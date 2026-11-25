package com.tarasovlabs.aimpremotecontrol.network

import android.util.Log
import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.UnknownHostException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.Response

/** How a player answered a request that needs a login where one is set. */
sealed interface PlayerAnswer {
    data object Ok : PlayerAnswer

    /** The player has a login set, and none was given. */
    data object LoginNeeded : PlayerAnswer
    data object LoginRefused : PlayerAnswer

    /** The player's plugin is older than the app works with; whether it would let in is not looked at. */
    data object Outdated : PlayerAnswer
    data class Unreachable(val reason: String) : PlayerAnswer

    /** There is a player at the address, whether it lets in or not. */
    val reached: Boolean get() = this !is Unreachable
}

private const val ProbePath = "/api/v1/settings"
private const val Tag = "PlayerCheck"

/**
 * Asks the player for something its login guards: the answer tells whether a player is there, whether its
 * plugin is one the app works with, and whether it lets in.
 */
suspend fun askPlayer(host: String, port: Int, login: String, password: String, timeout: Long): PlayerAnswer {
    val answer = ask(host, port, login, password, timeout)
    if (answer is PlayerAnswer.Unreachable) Log.i(Tag, "$host:$port: ${answer.reason}")
    return answer
}

internal suspend fun ask(host: String, port: Int, login: String, password: String, timeout: Long): PlayerAnswer {
    val http = try {
        PlayerHttp(host, port, login, password)
    } catch (e: IllegalArgumentException) {
        return PlayerAnswer.Unreachable("not a host: ${e.message}")
    }
    return try {
        withTimeoutOrNull(timeout) { http.get(ProbePath) { answer(it, login) } }
            ?: PlayerAnswer.Unreachable("no answer in $timeout ms")
    } catch (e: IOException) {
        PlayerAnswer.Unreachable("${e.javaClass.simpleName}: ${e.message}")
    } catch (e: SecurityException) {
        // The local network is behind a permission the user has not given.
        PlayerAnswer.Unreachable("${e.javaClass.simpleName}: ${e.message}")
    }
}

private fun answer(response: Response, login: String): PlayerAnswer = when {
    response.code != HttpURLConnection.HTTP_OK && response.code != HttpURLConnection.HTTP_UNAUTHORIZED ->
        PlayerAnswer.Unreachable("HTTP ${response.code}")

    !pluginSupported(response.header(PluginVersionHeader)) -> PlayerAnswer.Outdated
    response.code == HttpURLConnection.HTTP_OK -> PlayerAnswer.Ok
    login.isEmpty() -> PlayerAnswer.LoginNeeded
    response.header("WWW-Authenticate")?.let(DigestAuth::challenge) == null ->
        PlayerAnswer.Unreachable("not a Digest challenge")

    else -> PlayerAnswer.LoginRefused
}

// A lookup blocks its thread and cannot be interrupted: a caller that is cancelled would wait for it all the
// same. So the lookups run apart from their callers.
private val lookups = CoroutineScope(SupervisorJob() + Dispatchers.IO)

/** The addresses a host name stands for; none when it stands for nothing. */
suspend fun resolveHost(host: String): Set<InetAddress> = lookups.async {
    try {
        InetAddress.getAllByName(host).toSet()
    } catch (_: UnknownHostException) {
        emptySet()
    }
}.await()
