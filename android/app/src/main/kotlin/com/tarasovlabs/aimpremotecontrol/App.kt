package com.tarasovlabs.aimpremotecontrol

import android.app.Application
import com.tarasovlabs.aimpremotecontrol.network.httpCacheDirectory
import com.tarasovlabs.aimpremotecontrol.player.ConnectedPlayer
import com.tarasovlabs.aimpremotecontrol.players.PlayersStore

/** Holds what the whole app shares. */
class App : Application() {
    val players by lazy { PlayersStore(this) }

    val connected = ConnectedPlayer()

    override fun onCreate() {
        super.onCreate()
        httpCacheDirectory = cacheDir.resolve("http")
    }
}
