package com.tarasovlabs.aimpremotecontrol.player

import com.tarasovlabs.aimpremotecontrol.network.PlayerHttp
import com.tarasovlabs.aimpremotecontrol.network.ServerEvent
import com.tarasovlabs.aimpremotecontrol.network.StreamSignal
import com.tarasovlabs.aimpremotecontrol.network.StreamStub
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerConnectionTest {
    private val stub = StreamStub()
    private val listeners = CoroutineScope(Dispatchers.Default)
    private var made: PlayerConnection? = null

    @After
    fun close() {
        made?.close()
        listeners.cancel()
        stub.close()
    }

    // Short enough for a test, and far enough apart to tell which of them was at work on a busy computer.
    private val times = ConnectionTimes(
        silence = 60_000,
        firstRetry = 100,
        maxRetry = 400,
        lossGrace = 1500,
        wakeWindow = 1500,
        wakeRetry = 50,
        sleepSlack = 60_000
    )

    private fun connect(times: ConnectionTimes = this.times): PlayerConnection {
        val time = { System.nanoTime() / 1_000_000 }
        return PlayerConnection(PlayerHttp(stub.host, stub.port, "", ""), times, time, time) {}.also { made = it }
    }

    /**
     * What the connection tells a listener, as it comes. The listener is there for certain once it was told
     * of the open stream, and is told of nothing but the `hello` that came before it.
     */
    private fun PlayerConnection.heard(): LinkedBlockingQueue<StreamSignal> {
        val heard = LinkedBlockingQueue<StreamSignal>()
        listeners.launch { signals.collect { heard += it } }
        return heard
    }

    private fun LinkedBlockingQueue<StreamSignal>.next(): StreamSignal? = poll(Patience, TimeUnit.MILLISECONDS)

    private fun PlayerConnection.waitFor(what: (ConnectionStatus) -> Boolean): ConnectionStatus =
        runBlocking { withTimeout(Patience) { status.first(what) } }

    private fun event(name: String, data: String = "{}") = StreamSignal.Event(ServerEvent(name, data))

    @Test
    fun tellsOfTheStreamAndItsEventsButThePings() {
        val connection = connect()
        val heard = connection.heard()
        val stream = stub.stream()
        assertEquals(StreamSignal.Open, heard.next())

        stream.send("hello", "1")
        stream.send("ping")
        stream.send("queue", "2")

        assertEquals(event("hello", "1"), heard.next())
        assertEquals(event("queue", "2"), heard.next())
        assertEquals(ConnectionStatus(), connection.status.value)
    }

    @Test
    fun tellsAListenerThatComesLateWhatItMissed() {
        val connection = connect()
        val first = connection.heard()
        val stream = stub.stream()
        assertEquals(StreamSignal.Open, first.next())
        stream.send("hello", "1")
        stream.send("queue", "2")
        assertEquals(event("hello", "1"), first.next())
        assertEquals(event("queue", "2"), first.next())

        val late = connection.heard()
        assertEquals(StreamSignal.Open, late.next())
        assertEquals(event("hello", "1"), late.next())
        stream.send("queue", "3")

        // Told of the open stream once, and of nothing else that came before it.
        assertEquals(event("queue", "3"), late.next())
        assertEquals(event("queue", "3"), first.next())
    }

    @Test
    fun tellsAListenerOfTheOpenStreamOnceHoweverTheTwoMeet() {
        repeat(20) {
            val connection = connect()
            val heard = connection.heard()
            val stream = stub.stream()
            assertEquals(StreamSignal.Open, heard.next())

            stream.send("queue", "1")

            assertEquals(event("queue", "1"), heard.next())
            connection.close()
        }
    }

    @Test
    fun opensTheStreamAgainWithoutTellingOfALossThatWasShort() {
        val connection = connect()
        val heard = connection.heard()
        val first = stub.stream()
        assertEquals(StreamSignal.Open, heard.next())
        first.close()

        stub.stream().send("hello", "1")

        assertEquals(StreamSignal.Open, heard.next())
        assertEquals(event("hello", "1"), heard.next())
        assertEquals(ConnectionStatus(), connection.waitFor { !it.checking })
    }

    @Test
    fun tellsOfALossThatLasts() {
        val connection = connect()
        val first = stub.stream()
        connection.waitFor { it.online }
        stub.status = 503
        first.close()

        connection.waitFor { it.checking }
        val lost = connection.waitFor { !it.online }
        assertFalse(lost.checking)
        assertFalse(lost.closed)
        // Between two attempts it is known when the next one starts.
        assertNotNull(connection.waitFor { it.retryAt != null }.retryAt)

        stub.status = 200
        stub.stream()
        assertEquals(ConnectionStatus(), connection.waitFor { it.online })
    }

    @Test
    fun takesThePlayersWordThatItIsClosing() {
        val connection = connect()
        stub.stream().send("shutdown")

        val status = connection.waitFor { !it.online }

        assertTrue(status.closed)
    }

    @Test
    fun takesAPlayerThatIsClosingForGoneWhateverItAnswersAfter() {
        stub.stateDelay = 500
        // No retry within the test: nothing but the late answer could bring the player back.
        val connection = connect(times.copy(firstRetry = 60_000, maxRetry = 60_000))
        stub.stream().send("shutdown")
        connection.waitFor { !it.online }

        Thread.sleep(stub.stateDelay * 2)

        assertEquals(ConnectionStatus(online = false, closed = true), connection.status.value.copy(retryAt = null))
        assertNull(connection.state.value)
    }

    @Test
    fun triesNoMoreOnceTheLoginIsRefused() {
        stub.status = 401
        val connection = connect()

        runBlocking { withTimeout(Patience) { connection.refused.first { it } } }

        assertFalse(stub.opensWithin(times.maxRetry * 3))
    }

    @Test
    fun opensAStreamThatFellSilentAnew() {
        // The retries are far off: only the silence opens the next stream this soon.
        val connection = connect(times.copy(silence = 300, firstRetry = 60_000, maxRetry = 60_000))
        stub.stream().send("hello")

        // Left open: a stream the player ends is tried again after a wait, which is another matter.
        stub.stream()
        assertNull(connection.status.value.retryAt)
    }

    @Test
    fun checksTheStreamAtOnceWhenARequestFoundNoPlayer() {
        val connection = connect()
        stub.stream()
        connection.waitFor { it.online }

        connection.failed()

        // Told without the grace, and the stream is opened anew to find the player again.
        assertFalse(connection.waitFor { !it.online }.checking)
        stub.stream()
        assertEquals(ConnectionStatus(), connection.waitFor { it.online })
    }

    @Test
    fun takesAFailureJustAfterWakingForNoLossYet() {
        val connection = connect()
        stub.stream()
        connection.waitFor { it.online }

        connection.wake()
        connection.failed()

        assertTrue(connection.waitFor { it.checking }.online)
        stub.stream()
        assertEquals(ConnectionStatus(), connection.waitFor { !it.checking })
    }

    @Test
    fun skipsTheWaitForARetryWhenAsked() {
        val connection = connect(times.copy(firstRetry = 60_000, maxRetry = 60_000))
        stub.stream().close()
        connection.waitFor { it.retryAt != null }

        connection.retry()

        assertTrue(stub.opensWithin(Patience))
    }

    /** What the player told, whenever that was. */
    private val PlayerConnection.told: PlayerState? get() = state.value?.copy(receivedAt = 0)

    private fun PlayerConnection.waitForState(state: PlayerState?) =
        runBlocking { withTimeout(Patience) { this@waitForState.state.first { it?.copy(receivedAt = 0) == state } } }

    @Test
    fun asksForThePlayersStateAsTheStreamOpens() {
        stub.state = PlayingJson
        val connection = connect()
        assertNull(connection.state.value)

        stub.stream()

        connection.waitForState(Playing)
    }

    @Test
    fun followsThePlayerByItsEvents() {
        val connection = connect()
        val stream = stub.stream()
        connection.waitForState(PlayerState(Playback.Stopped, track = null))

        stream.send("player", PlayingJson)

        connection.waitForState(Playing)
    }

    @Test
    fun takesAnEventForNewerThanTheAnswerItStillWaitsFor() {
        stub.stateDelay = 500
        val connection = connect()

        stub.stream().send("player", PlayingJson)

        connection.waitForState(Playing)
        Thread.sleep(stub.stateDelay * 2)
        assertEquals(Playing, connection.told)
    }

    @Test
    fun keepsTheStateThroughALossAndAsksAgainAfterIt() {
        stub.state = PlayingJson
        val connection = connect()
        val first = stub.stream()
        connection.waitForState(Playing)
        stub.status = 503
        stub.state = StreamStub.Stopped
        first.close()

        connection.waitFor { !it.online }
        assertEquals(Playing, connection.told)

        stub.status = 200
        stub.stream()
        connection.waitForState(PlayerState(Playback.Stopped, track = null))
    }

    @Test
    fun takesWhatAnswersWithNoStateForNoPlayer() {
        stub.state = """{"state":"dancing","position":0,"duration":0,"track":null}"""
        val connection = connect()
        stub.stream()

        connection.waitFor { !it.online }
        assertNull(connection.state.value)

        stub.state = PlayingJson
        stub.stream()
        connection.waitForState(Playing)
        connection.waitFor { it.online }
    }

    private companion object {
        const val Patience = 10_000L

        // More than the app reads, as the player sends it.
        const val PlayingJson = """{"state":"playing","position":83.2,"duration":266.4,"volume":0.75,"track":{""" +
            """"playlistId":"{A1}","index":12,"title":"Track One","artist":"Artist A","album":"Album X",""" +
            """"coverHash":"","fileUri":"C:\\Music\\One.mp3"}}"""
        val Playing = PlayerState(
            Playback.Playing,
            Track("C:\\Music\\One.mp3", "Track One", "Artist A", "Album X", coverHash = ""),
            position = 83.2,
            duration = 266.4
        )
    }
}
