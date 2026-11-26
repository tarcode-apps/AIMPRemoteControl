package com.tarasovlabs.aimpremotecontrol.player

import com.tarasovlabs.aimpremotecontrol.network.HttpStatusException
import com.tarasovlabs.aimpremotecontrol.network.PlayerHttp
import com.tarasovlabs.aimpremotecontrol.network.PlayerStub
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerApiTest {
    private val server = MockWebServer()

    // The app's own timeouts suit a player, not a computer busy with a build.
    private val patient = OkHttpClient.Builder().readTimeout(1, TimeUnit.MINUTES).build()

    @After
    fun close() = server.close()

    private fun api(dispatcher: Dispatcher = PlayerStub()): PlayerApi {
        server.dispatcher = dispatcher
        server.start()
        return PlayerApi(PlayerHttp(server.hostName, server.port, "", "", patient))
    }

    /** What the player was asked: the method, the path and the body. */
    private fun asked(): String = server.takeRequest().run { "$method $target ${body?.utf8().orEmpty()}".trim() }

    @Test
    fun sendsThePlayersOwnCommands() = runBlocking {
        val api = api()

        api.play()
        assertEquals("POST /api/v1/player/play", asked())
        api.pause()
        assertEquals("POST /api/v1/player/pause", asked())
        api.next()
        assertEquals("POST /api/v1/player/next", asked())
        api.previous()
        assertEquals("POST /api/v1/player/previous", asked())
    }

    @Test
    fun seeksByThePositionInSeconds() = runBlocking {
        val api = api()

        api.seek(120.5)
        assertEquals("""PATCH /api/v1/player {"position":120.5}""", asked())
        api.seek(0.0)
        assertEquals("""PATCH /api/v1/player {"position":0.0}""", asked())
    }

    @Test
    fun signsACommandForAPlayerWithALogin() = runBlocking {
        val stub = PlayerStub("user", "secret")
        server.dispatcher = stub
        server.start()

        PlayerApi(PlayerHttp(server.hostName, server.port, "user", "secret", patient)).next()

        assertTrue(stub.seen.last()!!.startsWith("Digest "))
    }

    @Test
    fun failsWhenThePlayerRefusesACommand() {
        val api = api(object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) = MockResponse.Builder().code(500).build()
        })

        val failure = assertThrows(HttpStatusException::class.java) { runBlocking { api.play() } }

        assertEquals(500, failure.code)
    }

    @Test
    fun failsWhenThePlayerIsNotThere() {
        val api = api()
        server.close()

        assertThrows(IOException::class.java) { runBlocking { api.play() } }
    }
}
