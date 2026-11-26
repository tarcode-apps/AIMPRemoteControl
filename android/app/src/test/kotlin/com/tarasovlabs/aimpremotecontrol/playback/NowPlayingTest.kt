package com.tarasovlabs.aimpremotecontrol.playback

import com.tarasovlabs.aimpremotecontrol.player.Playback
import com.tarasovlabs.aimpremotecontrol.player.PlayerState
import com.tarasovlabs.aimpremotecontrol.player.Track
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NowPlayingTest {
    private val track = Track("C:\\Music\\One.mp3", "Track One", "Artist A", "Album X", coverHash = "b34839fb")
    private val stopped = PlayerState(Playback.Stopped, track = null)
    private val cover = "/api/v1/covers/b34839fb?size=512"

    /** Told at 5 s of the device's clock, 83.2 s into a track of 266.4 s. */
    private fun told(state: Playback, track: Track = this.track) =
        PlayerState(state, track, position = 83.2, duration = 266.4, receivedAt = 5000)

    private fun shown(playing: Boolean, cover: String = this.cover) = NowPlaying(
        "C:\\Music\\One.mp3", "Track One", "Artist A", "Album X", playing, cover,
        positionMs = 83_200, positionTime = 5000, durationMs = 266_400
    )

    private fun of(state: PlayerState?, online: Boolean = true, now: Long = 9000) =
        nowPlaying(state, online, "Office", "Stopped", now)

    @Test
    fun showsTheTrackWithItsCoverWhereItIsAndWhetherItPlays() {
        assertEquals(shown(playing = true), of(told(Playback.Playing)))
        assertEquals(shown(playing = false), of(told(Playback.Paused)))
    }

    @Test
    fun showsATrackWithoutACoverWithNone() {
        assertEquals(shown(playing = true, cover = ""), of(told(Playback.Playing, track.copy(coverHash = ""))))
    }

    @Test
    fun showsAStoppedPlayerByItsNameWithNoTrackAndNoCover() {
        val stoppedPlayer = of(stopped)!!

        assertEquals(NowPlaying("stopped:", "Office", "Stopped", album = "", playing = false), stoppedPlayer)
        assertTrue(stoppedPlayer.stopped)
        assertFalse(shown(playing = false).stopped)
        assertEquals(stoppedPlayer, of(stopped, online = false))
    }

    @Test
    fun showsNothingOfAPlayerThatHasToldNothingYet() {
        assertNull(of(null))
        assertNull(of(null, online = false))
    }

    @Test
    fun keepsTheTrackOfALostPlayerWhereItWasWhenItWasLost() {
        // Four seconds after it told.
        val lost = shown(playing = false).copy(positionMs = 87_200, positionTime = 9000)
        val paused = shown(playing = false).copy(positionTime = 9000)

        assertEquals(lost, of(told(Playback.Playing), online = false, now = 9000))
        assertEquals(paused, of(told(Playback.Paused), online = false, now = 9000))
    }

    @Test
    fun movesThePositionOnWhileThePlayerPlays() {
        assertEquals(83_200, shown(playing = true).position(now = 5000))
        assertEquals(93_200, shown(playing = true).position(now = 15_000))
        assertEquals(83_200, shown(playing = false).position(now = 15_000))
        // Never past the end, nor back before what was told.
        assertEquals(266_400, shown(playing = true).position(now = 5_000_000))
        assertEquals(83_200, shown(playing = true).position(now = 1000))
        // A radio station has no end.
        assertEquals(5_078_200, shown(playing = true).copy(durationMs = 0).position(now = 5_000_000))
    }

    @Test
    fun takesACommandForWhatItIsToDo() {
        val playing = shown(playing = true)

        val paused = playing.paused(now = 15_000)
        assertEquals(playing.copy(playing = false, positionMs = 93_200, positionTime = 15_000), paused)
        assertEquals(93_200, paused.position(now = 60_000))

        val resumed = paused.resumed(now = 60_000)
        assertEquals(93_200, resumed.position(now = 60_000))
        assertEquals(94_200, resumed.position(now = 61_000))

        val sought = playing.sought(positionMs = 10_000, now = 15_000)
        assertEquals(10_000, sought.position(now = 15_000))
        assertEquals(12_000, sought.position(now = 17_000))
    }
}
