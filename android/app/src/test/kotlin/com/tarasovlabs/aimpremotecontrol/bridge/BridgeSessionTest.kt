package com.tarasovlabs.aimpremotecontrol.bridge

import com.tarasovlabs.aimpremotecontrol.network.PlayerHttp
import com.tarasovlabs.aimpremotecontrol.network.PlayerStub
import com.tarasovlabs.aimpremotecontrol.network.StreamStub
import com.tarasovlabs.aimpremotecontrol.player.ConnectionTimes
import com.tarasovlabs.aimpremotecontrol.player.PlayerConnection
import java.util.Base64
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BridgeSessionTest {
    private val server = MockWebServer()
    private val streams = StreamStub()
    private val scope = CoroutineScope(Job() + Dispatchers.Default.limitedParallelism(1))
    private val connection = MutableStateFlow<PlayerConnection?>(null)
    private val told = LinkedBlockingQueue<String>()
    private val faults = LinkedBlockingQueue<String>()
    private var greetings = 0
    private var disconnects = 0
    private val session = BridgeSession(scope, connection, { greetings++ }, { disconnects++ }, faults::add)

    @After
    fun close() {
        session.close()
        scope.cancel()
        connection.value?.close()
        server.close()
        streams.close()
    }

    // The app's own timeouts suit a player, not a computer busy with a build.
    private val patient = OkHttpClient.Builder().readTimeout(1, TimeUnit.MINUTES).build()

    // Retries that never come: a test tells by itself when the stream is tried.
    private val times = ConnectionTimes(firstRetry = 60_000, maxRetry = 60_000, lossGrace = 60_000)

    private fun connect(http: PlayerHttp): PlayerConnection {
        val time = { System.nanoTime() / 1_000_000 }
        return PlayerConnection(http, times, time, time) {}.also { connection.value = it }
    }

    /** A player that answers requests; its stream of events is busy. */
    private fun player(stub: PlayerStub = PlayerStub("user", "secret"), password: String = "secret"): PlayerStub {
        server.dispatcher = stub
        server.start()
        connect(PlayerHttp(server.hostName, server.port, "user", password, patient))
        return stub
    }

    private fun tell(message: String) = session.receive(message, told::add)

    private fun answer(patience: Long = Patience): JsonObject? =
        told.poll(patience, TimeUnit.MILLISECONDS)?.let { Json.parseToJsonElement(it).jsonObject }

    private fun JsonObject.text(name: String) = getValue(name).jsonPrimitive.content

    /** The paths the player was asked for, in the order they came; the first of a login comes twice. */
    private fun asked(): List<String> = List(server.requestCount) { server.takeRequest().target }

    @Test
    fun readsAMessage() {
        assertNotNull(readMessage("""{"type":"hello"}"""))
        assertNotNull(readMessage("""{"type":"disconnect","more":[1,2]}"""))

        val none = listOf(
            null, "", "hello", """{"type":""", """["hello"]""", """{"kind":"hello"}""", """{"type":1}""", """{"type":null}"""
        )
        for (text in none) assertNull(text, readMessage(text))
    }

    @Test
    fun readsNoMessageLongerThanOneMayBe() {
        val message = """{"type":"hello","more":"%s"}"""
        val room = MaxMessageLength - message.format("").length

        assertNotNull(readMessage(message.format("a".repeat(room))))
        assertNull(readMessage(message.format("a".repeat(room + 1))))
    }

    @Test
    fun greetsWithWhatTheAppCanDo() {
        tell("""{"type":"hello"}""")

        assertEquals("""{"type":"hello","features":["disconnect","api"]}""", told.poll())
        assertEquals(1, greetings)
    }

    @Test
    fun leavesWhatItDoesNotKnowAlone() {
        tell("""{"type":"dance"}""")
        tell("not a message")
        tell("""{"type":"disconnect"}""")

        assertEquals(2, faults.size)
        assertEquals(1, disconnects)
        assertTrue(told.isEmpty())
    }

    @Test
    fun asksThePlayerUnderItsLogin() {
        val stub = player()

        tell("""{"type":"request","id":7,"method":"GET","path":"/api/v1/player?a=1"}""")

        val answer = answer()!!
        assertEquals("response", answer.text("type"))
        assertEquals(7, answer.getValue("id").jsonPrimitive.int)
        assertEquals(200, answer.getValue("status").jsonPrimitive.int)
        assertEquals("{}", answer.text("body"))
        assertEquals("/api/v1/player?a=1", answer.text("url"))
        assertNotNull(stub.seen.last())
    }

    @Test
    fun asksForAVersionOfTheApiItDoesNotKnow() {
        player(PlayerStub())

        tell("""{"type":"request","id":1,"method":"GET","path":"/api/v2/player"}""")

        assertEquals(200, answer()!!.getValue("status").jsonPrimitive.int)
        assertEquals(listOf("/api/v2/player"), asked().filter { it != "/api/v1/events" })
    }

    @Test
    fun sendsTheBodyOfARequest() {
        player()

        tell("""{"type":"request","id":1,"method":"PATCH","path":"/api/v1/player","body":"{\"volume\":0.5}"}""")
        tell("""{"type":"request","id":2,"method":"POST","path":"/api/v1/player/next"}""")
        repeat(2) { assertEquals(200, answer()!!.getValue("status").jsonPrimitive.int) }

        val sent = List(server.requestCount) { server.takeRequest() }
        val patch = sent.last { it.method == "PATCH" }
        assertEquals("""{"volume":0.5}""", patch.body!!.utf8())
        assertEquals("application/json; charset=utf-8", patch.headers["Content-Type"])
        assertEquals(0, sent.last { it.method == "POST" }.body!!.size)
    }

    @Test
    fun givesAFileAsItsBytesAndWhereItWasFound() {
        player()

        tell("""{"type":"request","id":1,"method":"GET","path":"/api/v1/playlists/1/items/2/cover","file":true}""")

        val answer = answer()!!
        assertEquals("/api/v1/covers/abc?size=64", answer.text("url"))
        assertEquals("image/png", answer.text("contentType"))
        assertArrayEquals(PlayerStub.Image, Base64.getDecoder().decode(answer.text("base64")))
    }

    @Test
    fun passesOnAnAnswerThatIsAnError() {
        player(PlayerStub())

        // A path is taken for where it leads.
        tell("""{"type":"request","id":1,"method":"GET","path":"/api/v1/player/../none"}""")

        val answer = answer()!!
        assertEquals(404, answer.getValue("status").jsonPrimitive.int)
        assertEquals("application/json", answer.text("contentType"))
        assertEquals("""{"error":{"code":"notFound"}}""", answer.text("body"))
        assertEquals(listOf("/api/v1/none"), asked().filter { it != "/api/v1/events" })
    }

    @Test
    fun asksForNothingButTheApi() {
        player()
        val refused = listOf(
            """"method":"GET","path":"/RPC_JSON"""",
            """"method":"GET","path":"/"""",
            """"method":"GET","path":"/api"""",
            """"method":"GET","path":"/apis/v1/player"""",
            """"method":"GET","path":"/api/v1/../../RPC_JSON"""",
            """"method":"GET","path":"//example.com/api/v1/player"""",
            """"method":"GET","path":"http://example.com/api/v1/player"""",
            // The stream of events is the app's own.
            """"method":"GET","path":"/api/v1/events"""",
            """"method":"TRACE","path":"/api/v1/player"""",
            """"method":"GET","path":"/api/v1/player","body":"{}"""",
            """"method":"POST","path":"/api/v1/player","body":{"volume":1}""",
            """"method":"GET","path":"/api/v1/player","file":"yes"""",
            """"method":"GET""""
        )

        for ((id, request) in refused.withIndex()) {
            tell("""{"type":"request","id":$id,$request}""")
            val answer = answer()!!
            assertEquals(request, "refused", answer.text("error"))
            assertEquals(id, answer.getValue("id").jsonPrimitive.int)
        }
        tell("""{"type":"request","method":"GET","path":"/api/v1/player"}""")

        assertEquals(1, faults.size)
        assertEquals(emptyList<String>(), asked().filter { it != "/api/v1/events" })
    }

    @Test
    fun tellsOfAPlayerThatDoesNotAnswer() {
        player()
        val connection = connection.value!!
        server.close()

        tell("""{"type":"request","id":1,"method":"GET","path":"/api/v1/player"}""")

        assertEquals("network", answer()!!.text("error"))
        // The connection hears of it, and tells the loss without waiting.
        assertFalse(runBlocking { withTimeout(Patience) { connection.status.first { !it.online } } }.checking)
    }

    @Test
    fun tellsTheConnectionOfALoginThePlayerRefuses() {
        player(password = "wrong")

        tell("""{"type":"request","id":1,"method":"GET","path":"/api/v1/player"}""")

        assertEquals(401, answer()!!.getValue("status").jsonPrimitive.int)
        assertTrue(connection.value!!.refused.value)
    }

    @Test
    fun endsARequestThePageNoLongerWaitsFor() {
        player()

        tell("""{"type":"request","id":1,"method":"GET","path":"/api/v1/slow"}""")
        tell("""{"type":"abort","id":1}""")

        assertNull(answer(PlayerStub.Slow + 1000))
    }

    @Test
    fun answersNoPageButTheOneThatIsLoaded() {
        player()

        tell("""{"type":"request","id":1,"method":"GET","path":"/api/v1/slow"}""")
        tell("""{"type":"hello"}""")

        assertEquals("hello", answer()!!.text("type"))
        assertNull(answer(PlayerStub.Slow + 1000))
    }

    @Test
    fun takesNoMoreRequestsThanItCanKeep() {
        player()

        repeat(MaxRequests) { tell("""{"type":"request","id":$it,"method":"GET","path":"/api/v1/slow"}""") }
        tell("""{"type":"request","id":$MaxRequests,"method":"GET","path":"/api/v1/player"}""")

        val answer = answer()!!
        assertEquals(MaxRequests, answer.getValue("id").jsonPrimitive.int)
        assertEquals("busy", answer.text("error"))
    }

    @Test
    fun passesOnNoAnswerLongerThanOneMayBe() {
        val stub = player()

        stub.long = MaxAnswerLength.toInt()
        tell("""{"type":"request","id":1,"method":"GET","path":"/api/v1/long"}""")
        assertEquals(MaxAnswerLength.toInt(), answer(Long)!!.text("body").length)

        stub.long = MaxAnswerLength.toInt() + 1
        tell("""{"type":"request","id":2,"method":"GET","path":"/api/v1/long"}""")
        assertEquals("too long", answer(Long)!!.text("error"))
    }

    @Test
    fun waitsForTheConnectionToBeThere() {
        server.dispatcher = PlayerStub()
        server.start()

        tell("""{"type":"request","id":1,"method":"GET","path":"/api/v1/player"}""")
        assertNull(answer(500))
        connect(PlayerHttp(server.hostName, server.port, "", "", patient))

        assertEquals(200, answer()!!.getValue("status").jsonPrimitive.int)
    }

    @Test
    fun tellsThePageOfTheStreamAndTheConnection() {
        connect(PlayerHttp(streams.host, streams.port, "", "", patient))
        val stream = streams.stream()
        stream.send("hello", """{"name":"PC"}""")

        tell("""{"type":"events","listen":true}""")
        val first = List(3) { answer()!! }
        stream.send("ping")
        stream.send("player", """{"state":"playing"}""")

        val heard = first + answer()!!
        val status = heard.single { it.text("type") == "connection" }
        assertTrue(status.getValue("online").jsonPrimitive.boolean)
        assertFalse(status.getValue("checking").jsonPrimitive.boolean)
        assertFalse(status.getValue("closed").jsonPrimitive.boolean)
        assertEquals(JsonNull, status["retryAt"])
        // The stream was open before the page came: it is told so, and of the player the stream began with.
        val stream3 = heard.filter { it.text("type") != "connection" }
        assertEquals("open", stream3[0].text("type"))
        assertEquals(listOf("hello", """{"name":"PC"}"""), listOf(stream3[1].text("name"), stream3[1].text("data")))
        assertEquals(listOf("player", """{"state":"playing"}"""), listOf(stream3[2].text("name"), stream3[2].text("data")))
    }

    @Test
    fun tellsThePageOfALossAndOfTheRetryItAsksFor() {
        connect(PlayerHttp(streams.host, streams.port, "", "", patient))
        val stream = streams.stream()
        tell("""{"type":"events","listen":true}""")
        repeat(2) { answer() }

        stream.send("shutdown")
        // The event itself, and what it means for the connection.
        val closing = List(2) { answer()!! }.single { it.text("type") == "connection" }
        assertFalse(closing.getValue("online").jsonPrimitive.boolean)
        assertTrue(closing.getValue("closed").jsonPrimitive.boolean)

        stream.close()
        tell("""{"type":"retry"}""")
        streams.stream()
        val back = generateSequence { answer() }.first { it.text("type") == "open" }
        assertNotNull(back)
    }

    @Test
    fun tellsNothingToAPageThatStoppedListening() {
        connect(PlayerHttp(streams.host, streams.port, "", "", patient))
        val stream = streams.stream()
        tell("""{"type":"events","listen":true}""")
        repeat(2) { answer() }

        tell("""{"type":"events","listen":false}""")
        stream.send("player")

        assertNull(answer(1000))
    }

    private companion object {
        const val Patience = 10_000L
        const val Long = 60_000L
    }
}
