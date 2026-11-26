package com.tarasovlabs.aimpremotecontrol.player

import com.tarasovlabs.aimpremotecontrol.network.HttpStatusException
import com.tarasovlabs.aimpremotecontrol.network.PlayerHttp
import com.tarasovlabs.aimpremotecontrol.network.read
import java.io.IOException
import java.net.HttpURLConnection
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The app's commands to a player (`docs/web-api.md`), and the only place they are made. For any player, with
 * or without a connection to it: a command is a request of its own.
 *
 * A command returns once the player has taken it; what it did comes with the player's events, not here. It
 * throws an [IOException] when the player does not answer, and an [HttpStatusException] when it answers with
 * an error.
 */
class PlayerApi(private val http: PlayerHttp) {
    /**
     * As the player's own play button: resumes a paused track, starts the last one of a stopped player, and
     * starts a playing one anew.
     */
    suspend fun play() = post("play")

    /** As the player's own pause button, which is a toggle: it resumes a paused track. */
    suspend fun pause() = post("pause")

    suspend fun next() = post("next")

    suspend fun previous() = post("previous")

    /** Moves the playing or paused track to [seconds] from its start. */
    suspend fun seek(seconds: Double) = send("PATCH", Root, buildJsonObject { put("position", seconds) }.toString())

    private suspend fun post(command: String) = send("POST", "$Root/$command", body = null)

    private suspend fun send(method: String, path: String, body: String?) {
        http.client.newCall(http.request(method, path, body)).read { response ->
            if (response.code != HttpURLConnection.HTTP_OK) throw HttpStatusException(response.code)
        }
    }

    private companion object {
        const val Root = "/api/v1/player"
    }
}
