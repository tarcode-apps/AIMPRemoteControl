package com.tarasovlabs.aimpremotecontrol.network

import java.io.IOException
import java.net.HttpURLConnection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.BufferedSource

/** An event of a player's stream: its name, and its data as the player sent it. */
data class ServerEvent(val name: String, val data: String)

/** What a stream gives: the news that it is open, then its events. */
sealed interface StreamSignal {
    data object Open : StreamSignal
    data class Event(val event: ServerEvent) : StreamSignal
}

/** An answer that is no stream. */
class HttpStatusException(val code: Int) : IOException("HTTP $code")

// No event of the API comes near this; a player that sends more is not one.
private const val MaxEventLength = 4L * 1024 * 1024

/**
 * Reads the next event of a stream (`text/event-stream`), waiting for it; null once the stream has ended.
 *
 * @throws IOException when the stream fails, or an event is longer than one may be.
 */
internal fun BufferedSource.readEvent(): ServerEvent? {
    var name = DefaultEvent
    val data = StringBuilder()
    var hasData = false
    while (!exhausted()) {
        // Throws where the line has no end: within the limit, or before the stream was cut.
        val line = readUtf8LineStrict(MaxEventLength)
        if (line.isEmpty()) {
            if (hasData) return ServerEvent(name, data.toString())
            name = DefaultEvent
            continue
        }
        // A comment.
        if (line.startsWith(':')) continue
        val colon = line.indexOf(':')
        val field = if (colon < 0) line else line.substring(0, colon)
        val value = if (colon < 0) "" else line.substring(colon + 1).removePrefix(" ")
        when (field) {
            "event" -> name = value

            "data" -> {
                if (hasData) data.append('\n')
                data.append(value)
                hasData = true
                if (data.length > MaxEventLength) throw IOException("an event longer than $MaxEventLength")
            }
        }
    }
    return null
}

private const val DefaultEvent = "message"

/**
 * A stream of events, opened anew by each collector and closed when it leaves. The flow ends when the
 * player ends the stream, and fails with an [IOException] when the stream does, or with an
 * [HttpStatusException] when the answer is no stream.
 *
 * @param client its read timeout is how long the stream may be silent.
 */
fun eventStream(client: OkHttpClient, request: Request): Flow<StreamSignal> = channelFlow {
    val call = client.newCall(request)
    launch(Dispatchers.IO) {
        try {
            call.execute().use { response ->
                if (response.code != HttpURLConnection.HTTP_OK) throw HttpStatusException(response.code)
                send(StreamSignal.Open)
                val source = response.body.source()
                while (true) send(StreamSignal.Event(source.readEvent() ?: break))
            }
        } catch (e: IOException) {
            // The collector left, which is how the socket was closed: no failure of the stream.
            if (!call.isCanceled()) throw e
        }
        close()
    }
    // Reading waits on the socket, which hears of nothing but its own end.
    awaitClose { call.cancel() }
}
