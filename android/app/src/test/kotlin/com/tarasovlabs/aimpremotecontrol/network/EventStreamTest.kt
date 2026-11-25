package com.tarasovlabs.aimpremotecontrol.network

import java.io.IOException
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class EventStreamTest {
    private fun events(text: String): List<ServerEvent> {
        val source = Buffer().writeUtf8(text)
        return generateSequence { source.readEvent() }.toList()
    }

    @Test
    fun readsEventsAsThePlayerWritesThem() {
        val text = "retry: 3000\n\nevent: hello\ndata: {\"name\":\"PC\"}\n\nevent: ping\ndata: {}\n\n"

        assertEquals(listOf(ServerEvent("hello", "{\"name\":\"PC\"}"), ServerEvent("ping", "{}")), events(text))
    }

    @Test
    fun readsWhatTheFormatAllows() {
        // Data in several lines, a comment, no space after the colon, a name left out, lines ended as Windows ends them.
        assertEquals(listOf(ServerEvent("a", "1\n2")), events("event: a\ndata: 1\ndata: 2\n\n"))
        assertEquals(listOf(ServerEvent("a", "1")), events(": hi\nevent:a\ndata:1\n\n"))
        assertEquals(listOf(ServerEvent("message", "1")), events("data: 1\n\n"))
        assertEquals(listOf(ServerEvent("a", "1")), events("event: a\r\ndata: 1\r\n\r\n"))
        assertEquals(listOf(ServerEvent("a", "")), events("event: a\ndata\n\n"))
    }

    @Test
    fun takesNoEventWithoutData() {
        // The name does not pass on to the next one.
        assertEquals(listOf(ServerEvent("message", "1")), events("event: a\n\ndata: 1\n\n"))
        assertNull(Buffer().readEvent())
    }

    @Test
    fun failsOnAnEventThatWasCut() {
        assertThrows(IOException::class.java) { events("event: a\ndata: 1") }
    }

    @Test
    fun tellsOfTheStreamThenOfItsEvents() {
        StreamStub().use { stub ->
            val request = Request.Builder().url("http://${stub.host}:${stub.port}/api/v1/events").build()
            val heard = runBlocking {
                withTimeout(Patience) {
                    val stream = Thread {
                        stub.stream().apply {
                            send("hello", "1")
                            send("player", "2")
                        }
                    }.apply { start() }
                    eventStream(OkHttpClient(), request).take(3).toList().also { stream.join() }
                }
            }

            val expected = listOf(
                StreamSignal.Open,
                StreamSignal.Event(ServerEvent("hello", "1")),
                StreamSignal.Event(ServerEvent("player", "2"))
            )
            assertEquals(expected, heard)
        }
    }

    @Test
    fun endsWhenThePlayerEndsTheStream() {
        StreamStub().use { stub ->
            val request = Request.Builder().url("http://${stub.host}:${stub.port}/api/v1/events").build()
            val heard = runBlocking {
                withTimeout(Patience) {
                    Thread { stub.stream().close() }.start()
                    eventStream(OkHttpClient(), request).toList()
                }
            }

            assertEquals(listOf<StreamSignal>(StreamSignal.Open), heard)
        }
    }

    @Test
    fun failsWithTheStatusOfAnAnswerThatIsNoStream() {
        StreamStub().use { stub ->
            stub.status = 503
            val request = Request.Builder().url("http://${stub.host}:${stub.port}/api/v1/events").build()
            val failure = runCatching { runBlocking { eventStream(OkHttpClient(), request).toList() } }.exceptionOrNull()

            assertTrue("$failure", failure is HttpStatusException && failure.code == 503)
        }
    }

    private companion object {
        const val Patience = 10_000L
    }
}
