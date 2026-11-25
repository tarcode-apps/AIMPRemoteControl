package com.tarasovlabs.aimpremotecontrol.network

import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.RecordedRequest
import okio.Buffer

/**
 * A player as far as its login goes, checking a signature as the plugin does: a nonce it no longer takes
 * and a count used twice are answered with `stale=true`, anything else that is wrong with a plain challenge.
 * Without a [login] it lets everybody in. Every answer names [version], as the plugin's does; none is a
 * plugin that knows of no such header.
 */
class PlayerStub(
    private val login: String = "",
    private val password: String = "",
    private val version: String? = "3.0.0.0"
) : Dispatcher() {
    /** The requests as they came: the `Authorization` header of each, null where there was none. */
    val seen = mutableListOf<String?>()

    /** How many bytes `/api/v1/long` answers with. */
    @Volatile
    var long = 0

    /** Where `/away` sends its caller; the address of another server. */
    @Volatile
    var away: String? = null

    private var nonce = 1
    private val counts = mutableSetOf<String>()

    /** From now on the nonce given so far is stale. */
    @Synchronized
    fun expireNonce() {
        nonce++
    }

    @Synchronized
    override fun dispatch(request: RecordedRequest): MockResponse {
        val answer = answer(request)
        return if (version == null) answer else answer.newBuilder().addHeader(PluginVersionHeader, version).build()
    }

    private fun answer(request: RecordedRequest): MockResponse {
        val authorization = request.headers["Authorization"]
        seen += authorization
        if (login.isEmpty()) return page(request)
        if (authorization == null) return challenge(stale = false)

        val fields = Field.findAll(authorization).associate { it.groupValues[1] to it.groupValues[2].ifEmpty { it.groupValues[3] } }
        val ha1 = md5("$login:$Realm:$password")
        val ha2 = md5("${request.method}:${fields["uri"]}")
        val expected = md5("$ha1:${fields["nonce"]}:${fields["nc"]}:${fields["cnonce"]}:auth:$ha2")
        return when {
            fields["username"] != login || fields["response"] != expected -> challenge(stale = false)
            fields["uri"] != request.target -> MockResponse.Builder().code(400).build()
            fields["nonce"] != "nonce$nonce" || !counts.add("${fields["nonce"]} ${fields["nc"]}") -> challenge(stale = true)
            else -> page(request)
        }
    }

    private fun page(request: RecordedRequest): MockResponse = when (request.url.encodedPath) {
        "/moved" -> MockResponse.Builder().code(302).addHeader("Location", "/api/v1/settings?from=moved").build()
        "/away" -> MockResponse.Builder().code(302).addHeader("Location", away!!).build()
        // Busy, as far as its stream of events goes.
        "/api/v1/events" -> MockResponse.Builder().code(503).build()
        "/api/v1/none" -> MockResponse.Builder().code(404)
            .addHeader("Content-Type", "application/json")
            .body("""{"error":{"code":"notFound"}}""")
            .build()

        "/api/v1/slow" -> MockResponse.Builder().code(200).body("{}").headersDelay(Slow, TimeUnit.MILLISECONDS).build()
        "/api/v1/long" -> MockResponse.Builder().code(200).body(Buffer().write(ByteArray(long))).build()
        "/api/v1/playlists/1/items/2/cover" ->
            MockResponse.Builder().code(302).addHeader("Location", "/api/v1/covers/abc?size=64").build()

        // An image, which the player names by its bytes and lets be kept.
        "/api/v1/covers/abc" -> MockResponse.Builder().code(200)
            .addHeader("Content-Type", "image/png")
            .addHeader("Cache-Control", "private, max-age=31536000, immutable")
            .body(Buffer().write(Image))
            .build()
        else -> MockResponse.Builder().code(200).body("{}").build()
    }

    private fun challenge(stale: Boolean): MockResponse {
        val header = "Digest realm=\"$Realm\", qop=\"auth\", algorithm=MD5, nonce=\"nonce$nonce\"" +
            if (stale) ", stale=true" else ""
        return MockResponse.Builder().code(401).addHeader("WWW-Authenticate", header).body("Unauthorized").build()
    }

    companion object {
        /** How long `/api/v1/slow` takes to answer. */
        const val Slow = 3000L

        /** What `/api/v1/covers/abc` gives: bytes that are no text. */
        val Image = byteArrayOf(-119, 80, 78, 71, 0, -1, 10)

        private const val Realm = "AIMP"
        private val Field = Regex("""(\w+)=(?:"([^"]*)"|([^,\s]*))""")

        private fun md5(text: String) = MessageDigest.getInstance("MD5").digest(text.toByteArray()).toHexString()
    }
}
