package com.tarasovlabs.aimpremotecontrol.network

import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asExecutor
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Cache
import okhttp3.Call
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

private const val ConnectTimeout = 3000L
private const val ReadTimeout = 3000L
private const val CacheSize = 64L * 1024 * 1024
private val Json = "application/json".toMediaType()
private val BodyRequired = setOf("POST", "PUT", "PATCH")

/**
 * Where the answers a player lets be kept are kept: its covers, which it names by their bytes. Set once,
 * before the first request; without it nothing is kept.
 */
@Volatile
var httpCacheDirectory: File? = null

// One pool of connections and of threads for all the players.
private val BaseClient by lazy {
    OkHttpClient.Builder()
        .connectTimeout(ConnectTimeout, TimeUnit.MILLISECONDS)
        .readTimeout(ReadTimeout, TimeUnit.MILLISECONDS)
        .apply { httpCacheDirectory?.let { cache(Cache(it, CacheSize)) } }
        .build()
}

/**
 * The root of a player's addresses, which is where its web client is.
 *
 * @throws IllegalArgumentException when [host] cannot be a host.
 */
fun playerRoot(host: String, port: Int): HttpUrl = HttpUrl.Builder().scheme("http").host(host).port(port).build()

/** Whether [other] is at this address's scheme, host and port: the player's login is for those alone. */
fun HttpUrl.sameOrigin(other: HttpUrl): Boolean = scheme == other.scheme && host == other.host && port == other.port

/**
 * The requests to one player under one login. They share the login's Digest session, so a player asks each
 * of them for it once and no more.
 *
 * @param base the client whose settings, connections and threads the requests use.
 * @throws IllegalArgumentException when [host] cannot be a host.
 */
class PlayerHttp(host: String, port: Int, login: String, password: String, base: OkHttpClient = BaseClient) {
    private val root = playerRoot(host, port)

    /** Signs its requests where the player asks for a login; without a [login] it leaves the 401 to the caller. */
    val client: OkHttpClient = if (login.isEmpty()) {
        base
    } else {
        val session = DigestSession(root, login, password)
        base.newBuilder().addInterceptor(session.answering).addNetworkInterceptor(session.signing).build()
    }

    /**
     * The address of [path], which begins at the root and has its query with it: `/api/v1/player`.
     *
     * @throws IllegalArgumentException when [path] is none, or leads away from the player.
     */
    fun url(path: String): HttpUrl {
        val url = requireNotNull(root.resolve(path)) { "not a path: $path" }
        require(root.sameOrigin(url)) { "not a path of the player: $path" }
        return url
    }

    /**
     * A request for [path]; [body] is JSON.
     *
     * @throws IllegalArgumentException as [url] does, or when [method] and [body] do not go together.
     */
    fun request(method: String, path: String, body: String? = null): Request {
        // OkHttp sends none of these without a body, and the API has commands that carry nothing.
        val content = body?.toRequestBody(Json) ?: if (method in BodyRequired) ByteArray(0).toRequestBody() else null
        return Request.Builder().url(url(path)).method(method, content).build()
    }

    /** Asks for [path] and reads the answer as [Call.read] does. */
    suspend fun <T> get(path: String, read: (Response) -> T): T = client.newCall(request("GET", path)).read(read)
}

private val Blocking = Dispatchers.IO.asExecutor()

/**
 * Makes the call and reads the response with [read], on a thread that may wait for the body; the response
 * is closed after it. Ends the call when the caller is cancelled. Not through `enqueue`: an exception that
 * is no IOException is thrown there on OkHttp's own thread, where nobody catches it.
 */
internal suspend fun <T> Call.read(read: (Response) -> T): T = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    Blocking.execute {
        try {
            continuation.resume(execute().use(read)) { _, _, _ -> }
        } catch (e: Throwable) {
            continuation.resumeWithException(e)
        }
    }
}
