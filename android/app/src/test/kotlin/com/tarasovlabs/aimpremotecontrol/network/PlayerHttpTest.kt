package com.tarasovlabs.aimpremotecontrol.network

import java.nio.file.Files
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockWebServer
import okhttp3.Cache
import okhttp3.OkHttpClient
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerHttpTest {
    private val server = MockWebServer()

    @After
    fun closeServer() = server.close()

    // The app's own timeouts suit a player, not a computer busy with a build.
    private val patient = OkHttpClient.Builder().readTimeout(1, TimeUnit.MINUTES).build()

    private fun player(stub: PlayerStub, login: String = "user", password: String = "secret"): PlayerHttp {
        server.dispatcher = stub
        server.start()
        return PlayerHttp(server.hostName, server.port, login, password, patient)
    }

    private fun status(http: PlayerHttp, path: String = "/api/v1/settings"): Int =
        runBlocking { http.get(path) { it.code } }

    @Test
    fun signsOnceThePlayerAsks() {
        val stub = PlayerStub("user", "secret")
        val http = player(stub)

        assertEquals(200, status(http))
        assertEquals(2, stub.seen.size)
        assertNull(stub.seen[0])
        assertTrue(stub.seen[1]!!, stub.seen[1]!!.contains("nc=00000001"))
    }

    @Test
    fun signsAtOnceFromThenOn() {
        val stub = PlayerStub("user", "secret")
        val http = player(stub)
        status(http)

        assertEquals(200, status(http))
        assertEquals(3, stub.seen.size)
        assertTrue(stub.seen[2]!!, stub.seen[2]!!.contains("nc=00000002"))
    }

    @Test
    fun signsAnewWhenTheNonceIsStale() {
        val stub = PlayerStub("user", "secret")
        val http = player(stub)
        status(http)
        stub.expireNonce()

        assertEquals(200, status(http))
        assertEquals(4, stub.seen.size)
        assertTrue(stub.seen[3]!!, stub.seen[3]!!.contains("nonce=\"nonce2\""))
    }

    @Test
    fun givesBackTheRefusal() {
        val stub = PlayerStub("user", "secret")
        val http = player(stub, password = "wrong")

        assertEquals(401, status(http))
        assertEquals(2, stub.seen.size)
        // With the challenge known, the next request is refused as it comes.
        assertEquals(401, status(http))
        assertEquals(3, stub.seen.size)
    }

    @Test
    fun sendsNothingOfItsOwnWithoutALogin() {
        val stub = PlayerStub("user", "secret")
        val http = player(stub, login = "", password = "")

        assertEquals(401, status(http))
        assertEquals(listOf<String?>(null), stub.seen)
    }

    @Test
    fun signsALoginBeyondAscii() {
        val stub = PlayerStub("Юзер", "пароль")
        val http = player(stub, "Юзер", "пароль")

        assertEquals(200, status(http))
        // And once more, with the challenge known from the start.
        assertEquals(200, status(http))
    }

    @Test
    fun signsARedirectWithItsOwnAddress() {
        val stub = PlayerStub("user", "secret")
        val http = player(stub)

        // The stub answers 400 to a signature made for another address.
        assertEquals(200, status(http, "/moved"))
        assertNotNull(stub.seen.last())
    }

    @Test
    fun signsNothingThatLeavesThePlayer() {
        val stub = PlayerStub("user", "secret")
        val http = player(stub)
        status(http)
        MockWebServer().use { other ->
            // Another server asks for the login as the player does, to be told it.
            val asking = PlayerStub("user", "secret")
            other.dispatcher = asking
            other.start()
            stub.away = other.url("/api/v1/settings").toString()

            assertEquals(401, status(http, "/away"))
            assertEquals(listOf<String?>(null), asking.seen)
        }
        // The player's own nonce is the one still signed with.
        assertEquals(200, status(http))
        assertTrue(stub.seen.last()!!, stub.seen.last()!!.contains("nonce=\"nonce1\""))
    }

    @Test
    fun takesAPathOfThePlayerOnly() {
        val http = player(PlayerStub())

        assertEquals(server.url("/api/v1/player?a=1"), http.url("/api/v1/player?a=1"))
        for (path in listOf("//example.com/api", "http://example.com/api", "http://${server.hostName}:1/api")) {
            assertThrows(path, IllegalArgumentException::class.java) { http.url(path) }
        }
    }

    @Test
    fun keepsWhatThePlayerLetsBeKept() {
        val stub = PlayerStub("user", "secret")
        server.dispatcher = stub
        server.start()
        val kept = Files.createTempDirectory("http").toFile()
        try {
            val keeping = patient.newBuilder().cache(Cache(kept, 1024 * 1024)).build()
            val http = PlayerHttp(server.hostName, server.port, "user", "secret", keeping)
            fun cover() = runBlocking { http.get("/api/v1/playlists/1/items/2/cover") { it.body.bytes() } }

            assertArrayEquals(PlayerStub.Image, cover())
            val asked = stub.seen.size
            assertArrayEquals(PlayerStub.Image, cover())
            // Where the cover of the item is, the player is asked again; the image itself it is not.
            assertEquals(asked + 1, stub.seen.size)

            // What says nothing of being kept is asked for each time.
            assertEquals(200, status(http))
            assertEquals(200, status(http))
            assertEquals(asked + 3, stub.seen.size)
        } finally {
            kept.deleteRecursively()
        }
    }

    @Test
    fun sendsACommandWithOrWithoutABody() {
        val http = player(PlayerStub())

        assertEquals("""{"a":1}""", http.request("PATCH", "/api/v1/player", """{"a":1}""").body!!.let { Buffer().also(it::writeTo).readUtf8() })
        assertEquals(0L, http.request("POST", "/api/v1/player/next").body!!.contentLength())
        assertNull(http.request("GET", "/api/v1/player").body)
        assertNull(http.request("DELETE", "/api/v1/queue").body)
        assertThrows(IllegalArgumentException::class.java) { http.request("GET", "/api/v1/player", "{}") }
    }

    @Test
    fun countsRequestsMadeAtTheSameTimeApart() {
        val stub = PlayerStub("user", "secret")
        val http = player(stub)
        status(http)

        val statuses = runBlocking { List(16) { async { http.get("/api/v1/settings") { it.code } } }.awaitAll() }

        assertEquals(List(16) { 200 }, statuses)
        // Not one of them had to be sent twice.
        assertEquals(2 + 16, stub.seen.size)
    }
}
