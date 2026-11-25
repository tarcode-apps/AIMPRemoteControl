package com.tarasovlabs.aimpremotecontrol.bridge

import com.tarasovlabs.aimpremotecontrol.network.PlayerHttp
import com.tarasovlabs.aimpremotecontrol.network.StreamSignal
import com.tarasovlabs.aimpremotecontrol.network.read
import com.tarasovlabs.aimpremotecontrol.player.ConnectionStatus
import com.tarasovlabs.aimpremotecontrol.player.PlayerConnection
import java.io.IOException
import java.net.HttpURLConnection
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Response

/** The app's answer to the client's greeting: what the client may ask the app for. */
private val Greeting = buildJsonObject {
    put("type", "hello")
    putJsonArray("features") {
        add("disconnect")
        add("api")
    }
}.toString()

/**
 * The longest message the app reads, in characters. The page is not to be trusted with more: reading a
 * text takes memory several times its length.
 */
internal const val MaxMessageLength = 1024 * 1024

/** The longest answer of the player the app passes on, in bytes: it is kept whole, and so is its copy. */
internal const val MaxAnswerLength = 16L * 1024 * 1024

/** How many requests of the page may wait for their answers, and how many of them are with the player. */
internal const val MaxRequests = 64
private const val MaxRequestsAtOnce = 16

// A request of the page waits for its answer as long as a browser would, and a player may take its time.
private const val AnswerTimeout = 60_000L

// Every version of the API, so that a client of a newer player needs no newer app.
private const val ApiRoot = "/api/"
private val Methods = setOf("GET", "POST", "PUT", "PATCH", "DELETE")

/**
 * A message of the client: a JSON object with a `type`. Null when the text is none, or is longer than one
 * may be.
 */
internal fun readMessage(text: String?): JsonObject? {
    if (text == null || text.length > MaxMessageLength) return null
    val message = try {
        Json.parseToJsonElement(text)
    } catch (_: SerializationException) {
        return null
    }
    return (message as? JsonObject)?.takeIf { it.string("type") != null }
}

private fun JsonObject.string(name: String): String? = (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content
private fun JsonObject.primitive(name: String): JsonPrimitive? = (get(name) as? JsonPrimitive)?.takeIf { !it.isString }

/** A request of the page for the player's API; [file] asks for the bytes of the answer and not its text. */
private data class ApiRequest(val method: String, val path: String, val body: String?, val file: Boolean)

/** Null when the message is no request the app would make: the page says what, never where to. */
private fun apiRequest(message: JsonObject): ApiRequest? {
    val method = message.string("method")?.takeIf { it in Methods } ?: return null
    val path = message.string("path") ?: return null
    val body = message["body"]?.let { message.string("body") ?: return null }
    val file = message["file"]?.let { message.primitive("file")?.booleanOrNull ?: return null } ?: false
    return ApiRequest(method, path, body, file)
}

/** Whether the address is of the API the page may ask for. The stream of events is the app's to open. */
private fun isApi(url: HttpUrl): Boolean =
    url.encodedPath.startsWith(ApiRoot) && url.encodedPath != PlayerConnection.EventsPath

/**
 * The app's end of the bridge for one web view, whatever page it shows; `docs/android-bridge.md` is the
 * contract. The page reaches the player's API through it: the app makes the page's requests under the
 * player's login, which the page never sees, and tells it of the events of the one stream the app keeps.
 *
 * The page comes over plain HTTP, so whatever it sends is taken for what anybody in the network may have
 * written: it is read with care, and asks only for what the contract says a page may ask.
 *
 * @param scope where the page's requests run; [onGreeting] and [onDisconnect] are called where [receive] is.
 * @param connection the connection to the player the web view shows; the requests wait for it to be there.
 * @param onGreeting the page that is loaded knows of the app.
 * @param onDisconnect the user leaves the player for the list of players.
 * @param log takes what is wrong with a message.
 */
class BridgeSession(
    private val scope: CoroutineScope,
    private val connection: StateFlow<PlayerConnection?>,
    private val onGreeting: () -> Unit,
    private val onDisconnect: () -> Unit,
    private val log: (String) -> Unit
) {
    private val session = SupervisorJob(scope.coroutineContext.job)

    // What the page that is loaded has asked for; a page that greets is another one, and nobody waits
    // for the answers to the one before it.
    @Volatile
    private var page = SupervisorJob(session)
    private val requests = ConcurrentHashMap<Long, Job>()
    private val atOnce = Semaphore(MaxRequestsAtOnce)

    @Volatile
    private var listening: Job? = null

    @Volatile
    private var patient: Pair<PlayerHttp, OkHttpClient>? = null

    /** Takes a message of the page; [reply] sends to the page it came from. */
    fun receive(text: String?, reply: (String) -> Unit) {
        val message = readMessage(text) ?: return log("not a message, ${text?.length} long: ${text?.take(LoggedLength)}")
        when (val type = message.string("type")) {
            "hello" -> {
                page.cancel()
                page = SupervisorJob(session)
                reply(Greeting)
                onGreeting()
            }

            "request" -> request(message, reply)
            "abort" -> message.primitive("id")?.longOrNull?.let { requests.remove(it)?.cancel() }
            "events" -> listen(message.primitive("listen")?.booleanOrNull == true, reply)
            "retry" -> connection.value?.retry()
            "disconnect" -> onDisconnect()

            // A client newer than the app asks for nothing the greeting did not name, so this is a fault.
            else -> log("not a message the app knows: ${type?.take(LoggedLength)}")
        }
    }

    /** Ends what the web view's pages have asked for. */
    fun close() = session.cancel()

    private fun request(message: JsonObject, reply: (String) -> Unit) {
        val id = message.primitive("id")?.longOrNull ?: return log("a request without an id")
        val request = apiRequest(message) ?: return reply(failure(id, "refused"))
        if (requests.size >= MaxRequests) return reply(failure(id, "busy"))
        val job = scope.launch(page, CoroutineStart.LAZY) { reply(answer(id, request)) }
        // No answer: it would be taken for that of the request the id stands for.
        if (requests.putIfAbsent(id, job) != null) return log("a request under an id that waits for its answer")
        job.invokeOnCompletion { requests.remove(id, job) }
        job.start()
    }

    /** The message that answers the request: the player's answer, or why there is none. */
    private suspend fun answer(id: Long, request: ApiRequest): String {
        val connection = connection.filterNotNull().first()
        val http = connection.http
        val asked = try {
            http.request(request.method, request.path, request.body)
        } catch (_: IllegalArgumentException) {
            return failure(id, "refused")
        }
        if (!isApi(asked.url)) return failure(id, "refused")
        return try {
            atOnce.withPermit {
                client(http).newCall(asked).read { response ->
                    if (response.code == HttpURLConnection.HTTP_UNAUTHORIZED) connection.loginRefused()
                    answer(id, request, response)
                }
            }
        } catch (_: IOException) {
            connection.failed()
            failure(id, "network")
        } catch (_: SecurityException) {
            // The local network is behind a permission the user has taken back.
            connection.failed()
            failure(id, "network")
        }
    }

    private fun client(http: PlayerHttp): OkHttpClient {
        patient?.let { (of, client) -> if (of === http) return client }
        val client = http.client.newBuilder().readTimeout(AnswerTimeout, TimeUnit.MILLISECONDS).build()
        patient = http to client
        return client
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun listen(wanted: Boolean, reply: (String) -> Unit) {
        listening?.cancel()
        listening = if (!wanted) {
            null
        } else {
            scope.launch(page) {
                launch { connection.flatMapLatest { it?.status ?: emptyFlow() }.collect { reply(statusMessage(it)) } }
                connection.flatMapLatest { it?.signals ?: emptyFlow() }.collect { reply(signalMessage(it)) }
            }
        }
    }

    private companion object {
        const val LoggedLength = 100
    }
}

/** Reads the player's answer whole, on the thread that waits for it. */
private fun answer(id: Long, request: ApiRequest, response: Response): String {
    val source = response.body.source()
    if (source.request(MaxAnswerLength + 1)) return failure(id, "too long")
    val bytes = source.readByteArray()
    return buildJsonObject {
        put("type", "response")
        put("id", id)
        put("status", response.code)
        put("contentType", response.header("Content-Type"))
        // Where the request ended, after the player's redirects.
        put("url", response.request.url.run { encodedQuery?.let { "$encodedPath?$it" } ?: encodedPath })
        if (request.file) put("base64", Base64.getEncoder().encodeToString(bytes)) else put("body", bytes.decodeToString())
    }.toString()
}

private fun failure(id: Long, error: String): String = buildJsonObject {
    put("type", "response")
    put("id", id)
    put("error", error)
}.toString()

private fun statusMessage(status: ConnectionStatus): String = buildJsonObject {
    put("type", "connection")
    put("online", status.online)
    put("checking", status.checking)
    put("closed", status.closed)
    put("retryAt", status.retryAt)
}.toString()

private val Opened = buildJsonObject { put("type", "open") }.toString()

private fun signalMessage(signal: StreamSignal): String = when (signal) {
    StreamSignal.Open -> Opened

    is StreamSignal.Event -> buildJsonObject {
        put("type", "event")
        put("name", signal.event.name)
        put("data", signal.event.data)
    }.toString()
}
