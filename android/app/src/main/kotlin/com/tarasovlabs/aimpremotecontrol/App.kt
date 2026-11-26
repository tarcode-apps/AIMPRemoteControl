package com.tarasovlabs.aimpremotecontrol

import android.app.Application
import com.tarasovlabs.aimpremotecontrol.network.httpCacheDirectory
import com.tarasovlabs.aimpremotecontrol.player.ConnectedPlayer
import com.tarasovlabs.aimpremotecontrol.players.PlayersStore
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** Holds what the whole app shares. */
class App : Application() {
    val players by lazy { PlayersStore(this) }

    val connected = ConnectedPlayer()

    private val closes = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** The app's window is to go: the user has closed the app from out of it. */
    val closing: SharedFlow<Unit> = closes.asSharedFlow()

    /** Leaves the connected player and closes the app's window, wherever the user is. */
    fun close() {
        connected.disconnect()
        closes.tryEmit(Unit)
    }

    override fun onCreate() {
        super.onCreate()
        httpCacheDirectory = cacheDir.resolve("http")
    }
}
