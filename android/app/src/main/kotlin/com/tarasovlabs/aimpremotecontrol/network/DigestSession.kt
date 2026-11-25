package com.tarasovlabs.aimpremotecontrol.network

import java.net.HttpURLConnection
import okhttp3.HttpUrl
import okhttp3.Interceptor

/**
 * The Digest login of one player for an OkHttp client: keeps the player's last challenge, signs with it
 * whatever goes on the wire to the player, and answers a new challenge by sending the request again.
 * Nothing that goes elsewhere is signed, wherever a redirect leads, and nobody else's challenge is taken.
 *
 * @param player the root of the player's addresses.
 */
internal class DigestSession(private val player: HttpUrl, login: String, password: String) {
    private val auth = DigestAuth(login, password)

    @Volatile
    private var challenge: DigestAuth.Challenge? = null

    /**
     * Goes among the network interceptors: a request the client makes by itself after a redirect is signed
     * with its own address, as the player wants it.
     */
    val signing = Interceptor { chain ->
        val request = chain.request()
        val known = challenge
        if (known == null || !player.sameOrigin(request.url)) {
            chain.proceed(request)
        } else {
            val url = request.url
            val uri = url.encodedQuery?.let { "${url.encodedPath}?$it" } ?: url.encodedPath
            // A login may have letters beyond ASCII, which OkHttp puts in a header only when told to; they go
            // out in UTF-8, as the plugin reads them.
            val headers = request.headers.newBuilder()
                .removeAll("Authorization")
                .addUnsafeNonAscii("Authorization", auth.authorization(request.method, uri, known))
                .build()
            chain.proceed(request.newBuilder().headers(headers).build())
        }
    }

    /** Goes among the application interceptors. A refused login comes back as the player's 401. */
    val answering = Interceptor { chain ->
        var signed = challenge != null
        var response = chain.proceed(chain.request())
        // The first challenge, and one more for a nonce that went stale meanwhile.
        repeat(2) {
            if (response.code != HttpURLConnection.HTTP_UNAUTHORIZED) return@Interceptor response
            // The answer is that of the last address a redirect led to.
            if (!player.sameOrigin(response.request.url)) return@Interceptor response
            val next = response.header("WWW-Authenticate")?.let(DigestAuth::challenge) ?: return@Interceptor response
            // The player takes a signature for wrong unless it calls the nonce stale.
            if (signed && !next.stale) return@Interceptor response
            challenge = next
            signed = true
            response.close()
            response = chain.proceed(chain.request())
        }
        response
    }
}
