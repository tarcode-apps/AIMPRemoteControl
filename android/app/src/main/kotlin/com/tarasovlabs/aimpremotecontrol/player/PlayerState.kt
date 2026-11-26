package com.tarasovlabs.aimpremotecontrol.player

import java.io.IOException
import kotlinx.serialization.Required
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.Json

/**
 * What the player is doing, as `GET /api/v1/player` and the `player` event tell it (`docs/web-api.md`); of
 * all they tell, what the app has a use for.
 */
@Serializable
data class PlayerState(
    val state: Playback,
    /** The track the player plays or is paused on; none while it is stopped. */
    val track: Track?,
    /** Where in the track the player was when it told this, in seconds. It tells no more while it merely plays on. */
    @Required val position: Double = 0.0,
    /** The length of the track in seconds; 0 where it has none, as a radio station. */
    @Required val duration: Double = 0.0,
    /** When the app heard this, by the clock of whoever read it: the position has moved on since. */
    @Transient val receivedAt: Long = 0
)

@Serializable
enum class Playback {
    @SerialName("playing")
    Playing,

    @SerialName("paused")
    Paused,

    @SerialName("stopped")
    Stopped
}

@Serializable
data class Track(
    /** Where the track is: the same for as long as the player is on it, a radio station through its songs too. */
    val fileUri: String,
    val title: String,
    val artist: String,
    val album: String,
    /** Names the track's cover by its bytes; empty without one. */
    val coverHash: String
)

private val Format = Json { ignoreUnknownKeys = true }

/**
 * @param receivedAt when [text] came.
 * @throws IOException when [text] is no state of a player: what sent it is not one.
 */
internal fun readPlayerState(text: String, receivedAt: Long): PlayerState = try {
    Format.decodeFromString<PlayerState>(text).copy(receivedAt = receivedAt)
} catch (e: IllegalArgumentException) {
    throw IOException("not a player's state: ${e.message}")
}
