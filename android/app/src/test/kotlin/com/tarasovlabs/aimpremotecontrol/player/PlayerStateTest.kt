package com.tarasovlabs.aimpremotecontrol.player

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PlayerStateTest {
    @Test
    fun readsWhatThePlayerTells() {
        // As docs/web-api.md has it.
        val told = """
            {
              "state": "paused", "position": 83.2, "duration": 266.4, "volume": 0.75, "mute": false,
              "repeat": "off", "shuffle": true, "radioCapture": false,
              "track": {
                "playlistId": "{A1B2C3D4-...}", "playlistRevision": 7, "index": 12, "trackNumber": "3",
                "title": "Track One", "artist": "Artist A", "album": "Album X", "isUrl": false,
                "inContainer": false, "mark": 4, "rating": 0.8, "displayingMark": 4,
                "coverHash": "b34839fba2927a883f861e5460f8698d", "fileUri": "C:\\Music\\Artist A\\Track One.mp3"
              }
            }
        """

        assertEquals(
            PlayerState(
                Playback.Paused,
                Track(
                    fileUri = "C:\\Music\\Artist A\\Track One.mp3",
                    title = "Track One",
                    artist = "Artist A",
                    album = "Album X",
                    coverHash = "b34839fba2927a883f861e5460f8698d"
                ),
                position = 83.2,
                duration = 266.4,
                receivedAt = 5000
            ),
            readPlayerState(told, receivedAt = 5000)
        )
    }

    @Test
    fun readsAStoppedPlayer() {
        assertEquals(
            PlayerState(Playback.Stopped, track = null),
            readPlayerState("""{"state":"stopped","position":0,"duration":0,"track":null}""", receivedAt = 0)
        )
    }

    @Test
    fun refusesWhatIsNoState() {
        val none = listOf(
            "", "nothing", "[]", "{}", """{"state":"dancing","position":0,"duration":0,"track":null}""",
            """{"state":"playing","position":0,"duration":0}""",
            """{"state":"playing","position":0,"duration":0,"track":{"title":"One"}}""",
            // The position and the length are told always.
            """{"state":"stopped","track":null}"""
        )
        for (text in none) assertThrows(text, IOException::class.java) { readPlayerState(text, receivedAt = 0) }
    }
}
