package com.tarasovlabs.aimpremotecontrol.playback

import android.app.PendingIntent
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CacheBitmapLoader
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.tarasovlabs.aimpremotecontrol.App
import com.tarasovlabs.aimpremotecontrol.R
import com.tarasovlabs.aimpremotecontrol.player.PlayerConnection
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

private const val Tag = "PlaybackService"

private val Disconnect = SessionCommand("disconnect", Bundle.EMPTY)

/**
 * The media session of the connected player. Media3 builds the notification from it and keeps the service
 * in the foreground while the player plays and for some minutes after: for that long the system leaves the
 * app its network out of sight, and the session follows the player.
 *
 * The service owns neither the player nor its connection: it shows what [App.connected] has, and is there
 * for as long as something is bound to it or it is in the foreground.
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private val scope = MainScope()
    private lateinit var player: RemotePlayer
    private lateinit var session: MediaSession

    override fun onCreate() {
        super.onCreate()
        val connected = (application as App).connected
        val connection = connected.connection
        val noCover = noCoverImage(this)
        player = RemotePlayer(mainLooper, noCover, scope)
        val disconnect = CommandButton.Builder(CommandButton.ICON_UNDEFINED)
            .setCustomIconResId(R.drawable.ic_close)
            .setDisplayName(getString(R.string.notification_disconnect))
            .setSessionCommand(Disconnect)
            .build()
        val builder = MediaSession.Builder(this, player)
            .setBitmapLoader(CacheBitmapLoader(CoverLoader(connection, noCover, scope)))
            .setCallback(SessionCallback())
            .setMediaButtonPreferences(listOf(disconnect))
        // The app as the launcher opens it: the task that is there comes forward as it is.
        packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
            builder.setSessionActivity(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE))
        }
        session = builder.build()
        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this).build().apply { setSmallIcon(R.drawable.ic_app_symbol) }
        )
        setListener(object : Listener {
            // The player began to play with the app out of sight and out of the foreground.
            override fun onForegroundServiceStartNotAllowedException() {
                Log.w(Tag, "the system lets the service into the foreground no more")
            }
        })

        val stopped = getString(R.string.player_stopped)
        scope.launch { connection.nowPlaying(connected.name, stopped).collect { player.told = it } }
        scope.launch {
            connection.collect {
                player.connection = it
                // Media3 starts the service as the player begins to play and never stops it. With no player
                // connected it has nothing to show: it ends, once nothing is bound to it. So does one the
                // system starts anew after it ended the app. The pause Media3 sends on the way goes nowhere:
                // the player the app has left goes on as it was.
                if (it == null) pauseAllPlayersAndStopSelf()
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession = session

    /** The session's command of its own: the button that leaves the player and closes the app. */
    private inner class SessionCallback : MediaSession.Callback {
        // For the system's controls and the notification's; another app does not close this one.
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo
        ): MediaSession.ConnectionResult {
            val result = MediaSession.ConnectionResult.AcceptedResultBuilder(session, controller)
            if (controller.isTrusted) {
                result.setAvailableSessionCommands(
                    MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().add(Disconnect).build()
                )
            }
            return result.build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle
        ): ListenableFuture<SessionResult> {
            if (customCommand != Disconnect) {
                return Futures.immediateFuture(SessionResult(SessionError.ERROR_NOT_SUPPORTED))
            }
            // The notification goes with the player, and the service with it.
            (application as App).close()
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }
    }

    override fun onDestroy() {
        scope.cancel()
        session.release()
        player.release()
        super.onDestroy()
    }
}

/** What the session shows of the player that is connected, whichever it is; nothing while none is. */
@kotlin.OptIn(ExperimentalCoroutinesApi::class)
private fun StateFlow<PlayerConnection?>.nowPlaying(name: StateFlow<String>, stopped: String): Flow<NowPlaying?> =
    flatMapLatest { connection ->
        if (connection == null) {
            flowOf(null)
        } else {
            // Whether the player is there, and no more of its status: what is shown of a lost player is
            // where it was when it was lost, not where it would be by each later word of the retries.
            val online = connection.status.map { it.online }.distinctUntilChanged()
            combine(connection.state, online, name) { state, online, name ->
                nowPlaying(state, online, name, stopped, SystemClock.elapsedRealtime())
            }
        }
    }
