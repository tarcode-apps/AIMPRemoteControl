package com.tarasovlabs.aimpremotecontrol.network

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerCheckTest {
    private val server = MockWebServer()

    @After
    fun closeServer() = server.close()

    private fun serve(dispatcher: Dispatcher) {
        server.dispatcher = dispatcher
        server.start()
    }

    private fun serve(response: MockResponse) = serve(object : Dispatcher() {
        override fun dispatch(request: RecordedRequest) = response
    })

    private fun ask(login: String = "", password: String = "", timeout: Long = 5000): PlayerAnswer =
        runBlocking { ask(server.hostName, server.port, login, password, timeout) }

    @Test
    fun anOpenPlayerLetsIn() {
        serve(PlayerStub())

        assertEquals(PlayerAnswer.Ok, ask())
        assertEquals(PlayerAnswer.Ok, ask("user", "secret"))
    }

    @Test
    fun aGuardedPlayerWantsALogin() {
        serve(PlayerStub("user", "secret"))

        assertEquals(PlayerAnswer.LoginNeeded, ask())
    }

    @Test
    fun theRightLoginLetsIn() {
        serve(PlayerStub("user", "secret"))

        assertEquals(PlayerAnswer.Ok, ask("user", "secret"))
    }

    @Test
    fun aWrongLoginIsRefused() {
        serve(PlayerStub("user", "secret"))

        assertEquals(PlayerAnswer.LoginRefused, ask("user", "wrong"))
        assertEquals(PlayerAnswer.LoginRefused, ask("other", "secret"))
    }

    @Test
    fun aPluginThatNamesNoVersionIsOutdated() {
        serve(PlayerStub(version = null))

        assertEquals(PlayerAnswer.Outdated, ask())
    }

    @Test
    fun anOutdatedPluginIsNotAskedForALogin() {
        serve(PlayerStub("user", "secret", version = "2.0.1.0"))

        assertEquals(PlayerAnswer.Outdated, ask())
        assertEquals(PlayerAnswer.Outdated, ask("user", "secret"))
        assertEquals(PlayerAnswer.Outdated, ask("user", "wrong"))
    }

    @Test
    fun tellsThePluginsItWorksWith() {
        for (version in listOf("3.0.0.0", "3.0", "3", "3.1.0.0", "4.0.0.0", "10.2")) assertTrue(version, pluginSupported(version))
        for (version in listOf(null, "", "2.0.1.0", "2.9.9.9", "1.2.0.5", "three", "3.x", "-3.0")) {
            assertFalse(version, pluginSupported(version))
        }
    }

    @Test
    fun whatIsNoPlayerIsUnreachable() {
        serve(MockResponse.Builder().code(404).build())

        assertEquals(PlayerAnswer.Unreachable("HTTP 404"), ask())
    }

    @Test
    fun aLoginOtherThanDigestIsUnreachable() {
        serve(
            MockResponse.Builder().code(401)
                .addHeader("WWW-Authenticate", "Basic realm=\"x\"")
                .addHeader(PluginVersionHeader, "3.0.0.0")
                .build()
        )

        assertEquals(PlayerAnswer.Unreachable("not a Digest challenge"), ask("user", "secret"))
    }

    @Test
    fun aClosedPortIsUnreachable() {
        server.start()
        val port = server.port
        server.close()

        val answer = runBlocking { ask("localhost", port, "", "", 5000) }

        assertTrue(answer.toString(), answer is PlayerAnswer.Unreachable)
    }

    @Test
    fun aSilentPlayerIsGivenUpInTime() {
        serve(MockResponse.Builder().code(200).headersDelay(2, TimeUnit.SECONDS).build())
        val started = System.nanoTime()

        val answer = ask(timeout = 300)

        assertEquals(PlayerAnswer.Unreachable("no answer in 300 ms"), answer)
        assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 1500)
    }

    @Test
    fun whatCannotBeAHostIsUnreachable() {
        val answer = runBlocking { ask("a b", 3333, "", "", 5000) }

        assertTrue(answer.toString(), answer is PlayerAnswer.Unreachable)
    }
}
