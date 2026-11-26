package com.tarasovlabs.aimpremotecontrol.playback

import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.tarasovlabs.aimpremotecontrol.network.HttpStatusException
import com.tarasovlabs.aimpremotecontrol.player.PlayerApi
import com.tarasovlabs.aimpremotecontrol.player.PlayerConnection
import java.io.IOException
import java.net.HttpURLConnection
import kotlin.math.abs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

private const val Tag = "RemotePlayer"

/**
 * AIMP on another computer as a Media3 player, for the media session: it plays nothing on this device and
 * takes no audio focus. Its state is what the player last told, and its commands are requests to the player.
 *
 * A command is taken at once, with what it is expected to do: the request is answered before the player's
 * event comes, and a state read in between would show the seek bar where it was. What the player tells
 * next stands, whatever was expected, and so does what it told last when the command fails.
 *
 * @param noCover the cover of what has none, as an image file.
 * @param scope where the commands are sent from, on the thread of [looper].
 */
@OptIn(UnstableApi::class)
class RemotePlayer(looper: Looper, private val noCover: ByteArray, private val scope: CoroutineScope) :
    SimpleBasePlayer(looper) {
    /** The connection the commands go through; none while no player is connected. */
    var connection: PlayerConnection? = null

    /** What the player is on, as it last told; null for nothing to show. Set on the player's own thread. */
    var told: NowPlaying? = null
        set(value) {
            field = value
            show(value)
        }

    // What is told, or what a command made of it until the player tells again.
    private var shown: NowPlaying? = null

    // The position moved by more than its telling is late: the session hears of it once.
    private var jumped = false

    private fun show(value: NowPlaying?) {
        val before = shown
        if (before == value) return
        shown = value
        if (before != null && value != null && before.id == value.id) {
            val now = SystemClock.elapsedRealtime()
            jumped = abs(value.position(now) - before.position(now)) > JumpMs
        }
        invalidateState()
    }

    override fun getState(): State {
        val state = State.Builder().setAvailableCommands(Commands)
        val shown = shown ?: return state.build()
        val metadata = MediaMetadata.Builder()
            .setTitle(shown.title)
            .setArtist(shown.artist)
            .setAlbumTitle(shown.album)
        // The session's cover loader asks the player for it.
        if (shown.cover.isEmpty()) {
            metadata.setArtworkData(noCover, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
        } else {
            metadata.setArtworkUri(shown.cover.toUri())
        }
        val item = MediaItemData.Builder(shown.id)
            .setMediaItem(MediaItem.Builder().setMediaId(shown.id).setMediaMetadata(metadata.build()).build())
            .setDurationUs(if (shown.durationMs > 0) shown.durationMs * 1000 else C.TIME_UNSET)
            .setIsSeekable(shown.durationMs > 0)
            .build()
        // Media3 moves the position on by itself while the player plays.
        val position = shown.position(SystemClock.elapsedRealtime())
        state
            // A player of one item has no next and no previous, and Media3 drops those commands before they
            // get here: the items around the track stand for the tracks the player itself will choose.
            .setPlaylist(listOf(Before, item, After))
            .setCurrentMediaItemIndex(Current)
            .setPlaybackState(Player.STATE_READY)
            .setPlayWhenReady(shown.playing, Player.PLAY_WHEN_READY_CHANGE_REASON_REMOTE)
            .setContentPositionMs(position)
            // However far into the track: previous is the track before, see handleSeek.
            .setMaxSeekToPreviousPositionMs(Long.MAX_VALUE)
        if (jumped) {
            jumped = false
            state.setPositionDiscontinuity(Player.DISCONTINUITY_REASON_INTERNAL, position)
        }
        return state.build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        val shown = shown ?: return Done
        val now = SystemClock.elapsedRealtime()
        when {
            // The player's play starts a playing track anew, and its pause resumes a paused one.
            playWhenReady == shown.playing -> Unit

            playWhenReady -> {
                // A stopped player starts the track it remembers, which only it knows.
                if (!shown.stopped) expect(shown.resumed(now))
                send { play() }
            }

            else -> {
                expect(shown.paused(now))
                send { pause() }
            }
        }
        return Done
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        val shown = shown ?: return Done
        // Previous is the track before, as the player's own button and the web client's have it, and never
        // the start of this one, which Media3 would choose after the first seconds of a track.
        when {
            seekCommand in Previous || mediaItemIndex == Current - 1 -> send { previous() }

            seekCommand in Next || mediaItemIndex == Current + 1 -> send { next() }

            else -> {
                val target = if (positionMs == C.TIME_UNSET) 0 else positionMs
                expect(shown.sought(target, SystemClock.elapsedRealtime()))
                send { seek(target / 1000.0) }
            }
        }
        return Done
    }

    /** Shows what a command is to do, where the player is there to do it. Media3 reads the state after the command. */
    private fun expect(value: NowPlaying) {
        if (connection?.status?.value?.online == true) shown = value
    }

    private fun send(command: suspend PlayerApi.() -> Unit) {
        val connection = connection ?: return
        scope.launch {
            try {
                PlayerApi(connection.http).command()
            } catch (e: HttpStatusException) {
                if (e.code == HttpURLConnection.HTTP_UNAUTHORIZED) connection.loginRefused()
                undo(e)
            } catch (e: IOException) {
                connection.failed()
                undo(e)
            } catch (e: SecurityException) {
                // The local network is behind a permission the user has taken back.
                connection.failed()
                undo(e)
            }
        }
    }

    /** A command did not reach the player, or was refused: what the player last told stands. */
    private fun undo(failure: Exception) {
        Log.w(Tag, "a command failed: $failure")
        show(told)
    }

    private companion object {
        // Both commands of each kind: the system's media card asks for either, and a media key, which is
        // what the buttons of the notification send before Android 13, is taken for the first alone.
        val Next = setOf(Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
        val Previous = setOf(Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)

        // Without the list of items, which would show the stand-ins for the neighbours as a queue.
        val Commands: Player.Commands = Player.Commands.Builder()
            .addAll(
                Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                Player.COMMAND_GET_METADATA,
                Player.COMMAND_PLAY_PAUSE,
                Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM
            )
            .addAll(*(Next + Previous).toIntArray())
            .build()

        val Before: MediaItemData = MediaItemData.Builder("before:").build()
        val After: MediaItemData = MediaItemData.Builder("after:").build()
        const val Current = 1

        // A telling is late by the network and by the player's lull before an event, and no more.
        const val JumpMs = 1500L

        val Done: ListenableFuture<*> = Futures.immediateVoidFuture()
    }
}
