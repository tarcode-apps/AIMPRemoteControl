package com.tarasovlabs.aimpremotecontrol

import android.app.Application
import com.tarasovlabs.aimpremotecontrol.players.PlayersStore

/** Holds what the whole app shares. */
class App : Application() {
    val players by lazy { PlayersStore(this) }
}
