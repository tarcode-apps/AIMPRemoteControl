package com.tarasovlabs.aimpremotecontrol.playback

import com.tarasovlabs.aimpremotecontrol.player.Playback
import com.tarasovlabs.aimpremotecontrol.player.PlayerState
import kotlin.math.roundToLong

/**
 * What the media session shows of the player: the track it is on, where in it, and whether it plays; or that
 * it is stopped. Times are in milliseconds.
 */
data class NowPlaying(
    /** The same for as long as the player is on the track. */
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val playing: Boolean,
    /** The path of the cover on the player; empty for none, which the web client's placeholder stands for. */
    val cover: String = "",
    /** Where in the track the player was at [positionTime]; it has moved on since if it [playing]. */
    val positionMs: Long = 0,
    /** By the clock that counts since the device started. */
    val positionTime: Long = 0,
    /** The length of the track; 0 where it has none. */
    val durationMs: Long = 0
) {
    /** A stopped player, shown with no track. */
    val stopped: Boolean get() = id == StoppedId

    /** Where in the track the player is at [now], as far as it has told: it tells no more while it plays on. */
    fun position(now: Long): Long {
        if (!playing) return positionMs
        val position = positionMs + (now - positionTime).coerceAtLeast(0)
        return if (durationMs > 0) position.coerceAtMost(durationMs) else position
    }

    /** As a pause at [now] leaves it. */
    fun paused(now: Long): NowPlaying = copy(playing = false, positionMs = position(now), positionTime = now)

    /** As resuming at [now] leaves it. */
    fun resumed(now: Long): NowPlaying = copy(playing = true, positionTime = now)

    /** As a move to [positionMs] at [now] leaves it. */
    fun sought(positionMs: Long, now: Long): NowPlaying = copy(positionMs = positionMs, positionTime = now)
}

// No file of the player is named so.
private const val StoppedId = "stopped:"

// As large as the system shows a cover, on the lock screen.
private const val CoverSize = 512

/**
 * What the session shows of a player in [state] at [now]; nothing until the player has told it.
 *
 * A stopped player is shown by its [name], and as [stoppedText], with no track: the session is never empty,
 * for Media3 takes the notification away at once when it is, and the foreground with it, and the app would
 * then never hear the player begin again. A player that is not [online] keeps what it was on and plays no
 * more, where it was when it was lost: a loss is mostly short, and the player is still there on the track.
 */
fun nowPlaying(state: PlayerState?, online: Boolean, name: String, stoppedText: String, now: Long): NowPlaying? {
    state ?: return null
    val track = state.track ?: return NowPlaying(StoppedId, name, stoppedText, album = "", playing = false)
    val told = NowPlaying(
        id = track.fileUri,
        title = track.title,
        artist = track.artist,
        album = track.album,
        playing = state.state == Playback.Playing,
        cover = if (track.coverHash.isEmpty()) "" else "/api/v1/covers/${track.coverHash}?size=$CoverSize",
        positionMs = (state.position * 1000).roundToLong(),
        positionTime = state.receivedAt,
        durationMs = (state.duration * 1000).roundToLong()
    )
    return if (online) told else told.paused(now)
}
