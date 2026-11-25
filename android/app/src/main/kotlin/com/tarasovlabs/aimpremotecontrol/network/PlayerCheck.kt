package com.tarasovlabs.aimpremotecontrol.network

import android.util.Log
import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.net.UnknownHostException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.withTimeoutOrNull

/** How a player answered a request that needs a login where one is set. */
sealed interface PlayerAnswer {
    data object Ok : PlayerAnswer

    /** The player has a login set, and none was given. */
    data object LoginNeeded : PlayerAnswer
    data object LoginRefused : PlayerAnswer
    data class Unreachable(val reason: String) : PlayerAnswer

    /** There is a player at the address, whether it lets in or not. */
    val reached: Boolean get() = this !is Unreachable
}

private const val ProbePath = "/api/v1/settings"
private const val ConnectTimeout = 3000
private const val ReadTimeout = 3000

/**
 * Asks the player for something its login guards. The web view is not to be trusted with this: it remembers
 * a password that has worked, and shows a blank page where the network is closed to it.
 */
suspend fun askPlayer(host: String, port: Int, login: String, password: String, timeout: Long): PlayerAnswer {
    val request = requests.async { ask(host, port, login, password) }
    val answer = withTimeoutOrNull(timeout) { request.await() } ?: PlayerAnswer.Unreachable("no answer in $timeout ms")
    if (answer is PlayerAnswer.Unreachable) Log.i(Tag, "$host:$port: ${answer.reason}")
    return answer
}

private const val Tag = "PlayerCheck"

// A request blocks its thread and cannot be interrupted: a caller that is cancelled or out of time would
// wait for it all the same. So the requests run apart from their callers and end by their own timeouts.
private val requests = CoroutineScope(SupervisorJob() + Dispatchers.IO)

/** The addresses a host name stands for; none when it stands for nothing. */
suspend fun resolveHost(host: String): Set<InetAddress> = requests.async {
    try {
        InetAddress.getAllByName(host).toSet()
    } catch (_: UnknownHostException) {
        emptySet()
    }
}.await()

private class Response(val status: Int, val challenge: DigestAuth.Challenge?)

private fun ask(host: String, port: Int, login: String, password: String): PlayerAnswer {
    try {
        var response = request(host, port, null)
        if (response.status != HttpURLConnection.HTTP_UNAUTHORIZED) return answer(response)
        if (login.isEmpty()) return PlayerAnswer.LoginNeeded

        val auth = DigestAuth(login, password)
        // The first challenge, and one more for a nonce that went stale meanwhile.
        repeat(2) { attempt ->
            val challenge = response.challenge ?: return PlayerAnswer.Unreachable("not a Digest challenge")
            if (attempt > 0 && !challenge.stale) return PlayerAnswer.LoginRefused
            response = request(host, port, auth.authorization("GET", ProbePath, challenge))
            if (response.status != HttpURLConnection.HTTP_UNAUTHORIZED) return answer(response)
        }
        return PlayerAnswer.LoginRefused
    } catch (e: IOException) {
        return PlayerAnswer.Unreachable("${e.javaClass.simpleName}: ${e.message}")
    } catch (e: SecurityException) {
        // The local network is behind a permission the user has not given.
        return PlayerAnswer.Unreachable("${e.javaClass.simpleName}: ${e.message}")
    }
}

private fun answer(response: Response): PlayerAnswer =
    if (response.status == HttpURLConnection.HTTP_OK) PlayerAnswer.Ok else PlayerAnswer.Unreachable("HTTP ${response.status}")

private fun request(host: String, port: Int, authorization: String?): Response {
    val connection = URL("http", host, port, ProbePath).openConnection() as HttpURLConnection
    try {
        connection.connectTimeout = ConnectTimeout
        connection.readTimeout = ReadTimeout
        connection.instanceFollowRedirects = false
        if (authorization != null) connection.setRequestProperty("Authorization", authorization)
        val status = connection.responseCode
        val challenge = connection.getHeaderField("WWW-Authenticate")?.let(DigestAuth::challenge)
        return Response(status, challenge)
    } finally {
        connection.disconnect()
    }
}
