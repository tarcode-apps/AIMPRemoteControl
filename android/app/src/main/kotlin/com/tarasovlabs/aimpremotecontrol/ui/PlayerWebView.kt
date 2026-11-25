package com.tarasovlabs.aimpremotecontrol.ui

import android.annotation.SuppressLint
import android.view.ViewGroup
import android.webkit.HttpAuthHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.tarasovlabs.aimpremotecontrol.players.Player

/**
 * The player's web client, loaded from the player itself. The login is the player's kept one, checked before
 * this opens; [onLoginRefused] comes if the player refuses it all the same.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PlayerWebView(player: Player, onClose: () -> Unit, onLoginRefused: () -> Unit) {
    val url = "http://${if (':' in player.host) "[${player.host}]" else player.host}:${player.port}/"
    val refused by rememberUpdatedState(onLoginRefused)
    var view by remember { mutableStateOf<WebView?>(null) }
    var failure by remember { mutableStateOf<String?>(null) }

    BackHandler {
        val current = view
        if (current != null && current.canGoBack()) current.goBack() else onClose()
    }

    Surface(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding()
        ) {
            key(player.id) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { context ->
                        WebView(context).apply {
                            // Without them the view is measured by its content, and the client's lists get no height.
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            webViewClient = object : WebViewClient() {
                                // The page and what it loads ask at the same time, each for itself.
                                override fun onReceivedHttpAuthRequest(
                                    view: WebView,
                                    handler: HttpAuthHandler,
                                    host: String,
                                    realm: String
                                ) {
                                    // Asked again for the same request, the login has been refused.
                                    if (player.login.isNotEmpty() && handler.useHttpAuthUsernamePassword()) {
                                        handler.proceed(player.login, player.password)
                                    } else {
                                        handler.cancel()
                                        refused()
                                    }
                                }

                                override fun onReceivedError(
                                    view: WebView,
                                    request: WebResourceRequest,
                                    error: WebResourceError
                                ) {
                                    if (request.isForMainFrame) failure = "${error.errorCode} ${error.description}"
                                }
                            }
                            loadUrl(url)
                            view = this
                        }
                    },
                    onRelease = { it.destroy() }
                )
            }
            failure?.let {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(url, style = MaterialTheme.typography.bodySmall)
                    Text(it, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
