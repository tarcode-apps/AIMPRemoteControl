package com.tarasovlabs.aimpremotecontrol.playback

import android.content.ComponentName
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken

/**
 * Keeps the media session of the connected player there for as long as this is on the screen's tree: a
 * controller bound to [PlaybackService] is what starts the service, and holds it while the player is silent.
 */
@Composable
fun PlaybackSession() {
    val context = LocalContext.current.applicationContext
    DisposableEffect(context) {
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val controller = MediaController.Builder(context, token).buildAsync()
        onDispose { MediaController.releaseFuture(controller) }
    }
}
