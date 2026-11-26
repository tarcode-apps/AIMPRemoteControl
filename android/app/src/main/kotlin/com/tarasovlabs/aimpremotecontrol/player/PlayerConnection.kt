package com.tarasovlabs.aimpremotecontrol.player

import android.os.SystemClock
import android.util.Log
import com.tarasovlabs.aimpremotecontrol.network.HttpStatusException
import com.tarasovlabs.aimpremotecontrol.network.PlayerHttp
import com.tarasovlabs.aimpremotecontrol.network.ServerEvent
import com.tarasovlabs.aimpremotecontrol.network.StreamSignal
import com.tarasovlabs.aimpremotecontrol.network.eventStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.onSubscription
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Whether the player is there, as the web client's `connection.ts` keeps it; the bridge passes it on as it
 * is. The player is lost only after [checking] for a while: a stream that drops and opens again is no news.
 */
data class ConnectionStatus(
    /** False from a loss of the player until its stream is open again and it has told its state. */
    val online: Boolean = true,
    /** A failure was met, and the stream is being tried before the loss is told. */
    val checking: Boolean = false,
    /** The player said it was shutting down. */
    val closed: Boolean = false,
    /** When the next attempt starts, by the clock of the device; null while one is under way. */
    val retryAt: Long? = null
)

/** The times of a connection, in milliseconds; those of the web client's own stream in a browser. */
data class ConnectionTimes(
    /** The player pings after 30 s without events; a stream silent for longer than two of those is dead. */
    val silence: Long = 75_000,
    /** The first retry; each failure in a row doubles it, up to [maxRetry]. */
    val firstRetry: Long = 3000,
    val maxRetry: Long = 30_000,
    /** A stream that drops and opens again within this is no news to the user. */
    val lossGrace: Long = 2500,
    /**
     * Awake again, a device takes a few seconds to bring its network up: for this long a failure is no
     * loss yet, and the stream is tried every [wakeRetry].
     */
    val wakeWindow: Long = 5000,
    val wakeRetry: Long = 500,
    /** A wait that took this much longer than it was to take was slept through. */
    val sleepSlack: Long = 1000
)

/**
 * The connection to one player: its stream of events, kept open through every loss of the player, what is
 * known of whether the player is there, and what the player is doing. The rules are those of the web
 * client's stream in a browser (`browserTransport.ts`), and a change to either is a change to both.
 *
 * It lives from when it is made until [close].
 *
 * @param http the requests to the player, under the login the stream is opened with.
 * @param elapsed the time since the device started, its sleep included.
 * @param clock the time of day, which the web client reads too.
 * @param log takes what happened to the stream.
 */
class PlayerConnection(
    val http: PlayerHttp,
    private val times: ConnectionTimes = ConnectionTimes(),
    private val elapsed: () -> Long = SystemClock::elapsedRealtime,
    private val clock: () -> Long = System::currentTimeMillis,
    private val log: (String) -> Unit = { Log.i("PlayerConnection", it) }
) {
    // One thread at a time: what is below is changed by the stream, by its timers and by the callers alike.
    private val oneAtATime = Dispatchers.Default.limitedParallelism(1)
    private val scope = CoroutineScope(SupervisorJob() + oneAtATime)
    private val stream = http.client.newBuilder().readTimeout(times.silence, TimeUnit.MILLISECONDS).build()

    private val statusFlow = MutableStateFlow(ConnectionStatus())
    private val refusedFlow = MutableStateFlow(false)
    private val stateFlow = MutableStateFlow<PlayerState?>(null)
    private val signalFlow = MutableSharedFlow<StreamSignal>(extraBufferCapacity = 64)
    private val restarts = MutableStateFlow(0)

    private var open = false
    private var hello: ServerEvent? = null
    private var failures = 0
    private var heardAt = elapsed()
    private var wakeUntil = 0L
    private var waiting = false
    private var lossTimer: Job? = null

    val status: StateFlow<ConnectionStatus> = statusFlow.asStateFlow()

    /** The player takes the login no more; the stream is not tried again. */
    val refused: StateFlow<Boolean> = refusedFlow.asStateFlow()

    /**
     * What the player is doing, as it last told; null until it has. It stands through a loss of the player,
     * of which [status] tells.
     */
    val state: StateFlow<PlayerState?> = stateFlow.asStateFlow()

    /**
     * The stream as it goes, for one listener: [StreamSignal.Open] whenever it opens, and its events but the
     * pings. A listener that comes while the stream is open is told so, and gets the player's `hello` again.
     */
    val signals: Flow<StreamSignal> = flow {
        emitAll(
            signalFlow.onSubscription {
                if (open) {
                    emit(StreamSignal.Open)
                    hello?.let { emit(StreamSignal.Event(it)) }
                }
            }
        )
    }
        // A listener begins between two steps of the stream, never in the middle of one: where the stream
        // opens as the listener comes, the listener is told so once, by the stream or by the lines above.
        .flowOn(oneAtATime)

    init {
        scope.launch { restarts.collectLatest { keepOpen() } }
    }

    /** The user asks for the player now: a retry that waits out its delay is not worth the wait. */
    fun retry() = act { restart() }

    /** A request found no player: the stream is checked at once, and the loss told without the grace. */
    fun failed() = act {
        if (!statusFlow.value.online) return@act
        if (!waking()) goOffline()
        restart()
    }

    /** A request was refused for its login. */
    fun loginRefused() {
        refusedFlow.value = true
    }

    /**
     * The device, or the app, is back from where its timers and sockets may have stood still: the stream is
     * looked at by the clock, and for a while a failure is no loss yet.
     */
    fun wake() = act {
        wakeUntil = elapsed() + times.wakeWindow
        if (waiting || elapsed() - heardAt > times.silence) restart()
    }

    fun close() = scope.cancel()

    private fun act(action: () -> Unit) {
        scope.launch { action() }
    }

    private fun waking() = elapsed() < wakeUntil

    /** Ends the attempt under way, or the wait for the next one, and begins another. */
    private fun restart() {
        lost()
        restarts.update { it + 1 }
    }

    private suspend fun keepOpen() {
        while (true) {
            waiting = false
            statusFlow.update { it.copy(retryAt = null) }
            heardAt = elapsed()
            val failure = read()
            val wasOpen = open
            open = false
            log("the stream is over: ${failure ?: "ended by the player"}")
            if (failure is HttpStatusException && failure.code == HttpURLConnection.HTTP_UNAUTHORIZED) {
                refusedFlow.value = true
                return
            }
            val wait = when {
                // Silent for too long, it is opened anew at once, as it is on any doubt.
                wasOpen && failure is SocketTimeoutException -> 0
                waking() -> times.wakeRetry
                else -> min(times.firstRetry shl min(failures++, MaxDoublings), times.maxRetry)
            }
            lost()
            if (wait > 0) {
                waiting = true
                statusFlow.update { it.copy(retryAt = clock() + wait) }
                val since = elapsed()
                delay(wait)
                if (elapsed() - since > wait + times.sleepSlack) wakeUntil = elapsed() + times.wakeWindow
            }
        }
    }

    /** Reads the stream until it is over; what ended it, null where the player did. */
    private suspend fun read(): Exception? = try {
        coroutineScope {
            // The stream tells of changes alone, so the state is asked for as it opens. A `player` event that
            // comes before the answer is the newer of the two.
            var asking: Job? = null
            eventStream(stream, http.request("GET", EventsPath)).collect { signal ->
                heardAt = elapsed()
                when (signal) {
                    StreamSignal.Open -> {
                        open = true
                        signalFlow.emit(signal)
                        asking = launch { found(askState()) }
                    }

                    is StreamSignal.Event -> {
                        when (signal.event.name) {
                            "hello" -> hello = signal.event

                            "player" -> {
                                asking?.cancel()
                                found(readPlayerState(signal.event.data, elapsed()))
                            }

                            // The player is closing, which is told apart from a lost network. The state
                            // it was asked for means nothing any more: its answer would find it again.
                            "shutdown" -> {
                                asking?.cancel()
                                goOffline(closed = true)
                            }
                        }
                        if (signal.event.name != "ping") signalFlow.emit(signal)
                    }
                }
            }
            asking?.cancel()
        }
        null
    } catch (e: IOException) {
        e
    } catch (e: SecurityException) {
        // The local network is behind a permission the user has taken back.
        e
    }

    /**
     * The player is there: its stream is open and it has told what it is doing. A stream alone is not taken
     * for it, or what opens one and tells no state would pass for a player with every attempt.
     */
    private fun found(state: PlayerState) {
        stateFlow.value = state
        failures = 0
        lossTimer?.cancel()
        lossTimer = null
        statusFlow.value = ConnectionStatus()
    }

    /** @throws IOException when the player does not answer with its state; the stream is then no good either. */
    private suspend fun askState(): PlayerState = http.get(StatePath) { response ->
        if (response.code != HttpURLConnection.HTTP_OK) throw HttpStatusException(response.code)
        readPlayerState(response.body.string(), elapsed())
    }

    /** A failure: the loss is told once the grace and the time to wake up are both over. */
    private fun lost() {
        if (!statusFlow.value.online || lossTimer != null) return
        statusFlow.update { it.copy(checking = true) }
        lossTimer = scope.launch {
            delay(times.lossGrace)
            while (waking()) delay(wakeUntil - elapsed())
            lossTimer = null
            goOffline()
        }
    }

    private fun goOffline(closed: Boolean = false) {
        lossTimer?.cancel()
        lossTimer = null
        statusFlow.update { if (it.online) it.copy(online = false, checking = false, closed = closed) else it }
    }

    internal companion object {
        /** The stream the connection keeps; the page may not open one of its own through the bridge. */
        const val EventsPath = "/api/v1/events"
        private const val StatePath = "/api/v1/player"
        private const val MaxDoublings = 16
    }
}
