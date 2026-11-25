package com.tarasovlabs.aimpremotecontrol.players

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/** In the order the user chooses from. */
enum class PlayerIcon { Desktop, Laptop, LivingRoom, Study, Bedroom, Kitchen, Garage, Home, Speaker, Tv, Headphones, Music }

/** What happens to a player while a call rings or goes on. */
enum class CallAction { None, LowerVolume, Pause }

/**
 * A player the user keeps. It is its address and nothing more: the app connects to [host] and [port] as they
 * are, whatever the search finds.
 */
@Serializable
data class Player(
    /** Of this record in the app; the player knows nothing of it. */
    val id: String,
    val host: String,
    val port: Int = DefaultPort,
    val name: String = "",
    /** The name the player announced when it was last found, shown while the user has given none. */
    val announcedName: String = "",
    val icon: PlayerIcon = PlayerIcon.Desktop,
    val login: String = "",
    /** Kept apart from the rest, see [PlayersStore]. */
    @Transient val password: String = "",
    /** At most one player has it. */
    val autoConnect: Boolean = false,
    val callAction: CallAction = CallAction.None,
    /** Percent of the full volume, for [CallAction.LowerVolume]. */
    val callVolume: Int = DefaultCallVolume
) {
    val title: String get() = name.ifEmpty { announcedName.ifEmpty { host } }
    val address: String get() = "$host:$port"

    companion object {
        const val DefaultPort = 3333
        val Ports = 1..65535
        const val DefaultCallVolume = 20
    }
}
