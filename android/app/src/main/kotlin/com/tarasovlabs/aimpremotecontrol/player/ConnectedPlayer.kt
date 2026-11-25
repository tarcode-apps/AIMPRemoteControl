package com.tarasovlabs.aimpremotecontrol.player

import com.tarasovlabs.aimpremotecontrol.network.PlayerHttp
import com.tarasovlabs.aimpremotecontrol.players.Player
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The one player the app is connected to, and the connection to it. Kept by the app and not by a screen:
 * the player stays connected while the app is out of sight, and everything that talks to it does so
 * through [connection].
 */
class ConnectedPlayer {
    private val ids = MutableStateFlow<String?>(null)
    private val connections = MutableStateFlow<PlayerConnection?>(null)

    /** The id of the player; null while the app is connected to none. */
    val id: StateFlow<String?> = ids.asStateFlow()

    /** There while a player is connected, but for the moment after [resume]. */
    val connection: StateFlow<PlayerConnection?> = connections.asStateFlow()

    /**
     * Connects to the player as it is given: its address, and the login that has just been checked. The
     * kept copy of the player may be older for a moment, and is not looked at.
     */
    @Synchronized
    fun connect(player: Player) {
        connections.value?.close()
        connections.value = PlayerConnection(PlayerHttp(player.host, player.port, player.login, player.password))
        ids.value = player.id
    }

    /**
     * The player the app was connected to when the system ended it, known by its id alone until the kept
     * players are read: [connect] follows.
     */
    @Synchronized
    fun resume(id: String) {
        if (ids.value == null) ids.value = id
    }

    @Synchronized
    fun disconnect() {
        ids.value = null
        connections.value?.close()
        connections.value = null
    }
}
