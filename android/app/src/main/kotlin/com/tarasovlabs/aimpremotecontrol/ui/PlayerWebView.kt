package com.tarasovlabs.aimpremotecontrol.ui

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.util.Log
import android.view.ViewGroup
import android.webkit.HttpAuthHandler
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.tarasovlabs.aimpremotecontrol.bridge.BridgeSession
import com.tarasovlabs.aimpremotecontrol.bridge.WebBridge
import com.tarasovlabs.aimpremotecontrol.network.playerRoot
import com.tarasovlabs.aimpremotecontrol.network.sameOrigin
import com.tarasovlabs.aimpremotecontrol.player.PlayerConnection
import com.tarasovlabs.aimpremotecontrol.players.Player
import java.io.ByteArrayInputStream
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

private const val Tag = "PlayerWebView"

/**
 * The web client of the connected player, loaded from the player itself. The pages are the player's public
 * ones; what needs the login, the client asks of the app over the bridge, and the app asks the player
 * through [connection]. [onLoginRefused] comes when the player takes the kept login no more, and
 * [onLoadFailed] when the page does not load.
 *
 * Back on the client's first screen leaves the app with the player connected, as the player's own app
 * would. The way to the other players is to disconnect, which the client offers: [onDisconnect].
 *
 * The web view is the player's alone. The page comes over plain HTTP and may be anybody's in the network,
 * so it gets nothing it asks another address for, a link that leads elsewhere opens in the browser, and the
 * web view answers no request for a login: it would give the password to whoever asks in the player's name.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PlayerWebView(
    player: Player,
    connection: StateFlow<PlayerConnection?>,
    onDisconnect: () -> Unit,
    onLoginRefused: () -> Unit,
    onLoadFailed: (reason: String) -> Unit
) {
    val activity = LocalActivity.current
    // Where the requests of the page run: on the main thread, as the bridge hears the page and answers it.
    val scope = remember { MainScope() }
    DisposableEffect(scope) { onDispose { scope.cancel() } }
    val root = remember(player.host, player.port) { playerRoot(player.host, player.port) }
    val disconnect by rememberUpdatedState(onDisconnect)
    val refused by rememberUpdatedState(onLoginRefused)
    val loadFailed by rememberUpdatedState(onLoadFailed)
    var view by remember { mutableStateOf<WebView?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    // Whether the page that is loaded has greeted the app over the bridge: only such a page is the client,
    // with its button that disconnects.
    var greeted by remember { mutableStateOf(false) }
    // Counts the web views made for the player: one whose renderer is gone is good for nothing.
    var generation by remember { mutableIntStateOf(0) }

    BackHandler {
        when {
            canGoBack -> view?.goBack()
            // A page that is not the client: nothing on the screen leads to the players.
            !greeted -> onDisconnect()
            // The activity is not finished, so that the page is there when the user comes back. Left to
            // the system, that would hold from Android 12 on and only when the launcher started the app.
            else -> activity?.moveTaskToBack(true)
        }
    }

    LaunchedEffect(connection) {
        connection.awaitRefused()
        refused()
    }
    // Out of sight the app may have slept, and its connections with it.
    LifecycleEventEffect(Lifecycle.Event.ON_START) { connection.value?.wake() }

    Surface(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding()
        ) {
            key(player.id, generation) {
                val bridge = remember {
                    BridgeSession(
                        scope = scope,
                        connection = connection,
                        onGreeting = { greeted = true },
                        onDisconnect = { disconnect() },
                        log = WebBridge::log
                    )
                }
                DisposableEffect(bridge) { onDispose(bridge::close) }

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
                            // A player's page has no business with the files of the device or of other apps.
                            settings.allowFileAccess = false
                            settings.allowContentAccess = false
                            webViewClient = object : WebViewClient() {
                                override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                                    greeted = false
                                }

                                // The client's screens are entries of the history, made without loading a page.
                                override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                                    canGoBack = view.canGoBack()
                                }

                                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                    if (!request.isForMainFrame || root.isOriginOf(request.url)) return false
                                    // Only where the user followed a link: a page opens nothing by itself.
                                    if (request.hasGesture()) openOutside(view.context, request.url)
                                    return true
                                }

                                // Called for whatever the page asks for, on a thread of the web view's own; not
                                // for where an answer redirects.
                                override fun shouldInterceptRequest(
                                    view: WebView,
                                    request: WebResourceRequest
                                ): WebResourceResponse? {
                                    // Not an address of the web: the page's own blob: or data:.
                                    val address = request.url.toString().toHttpUrlOrNull() ?: return null
                                    if (root.sameOrigin(address)) return null
                                    Log.w(Tag, "not loaded, it is not the player's: ${address.redact()}")
                                    return WebResourceResponse(
                                        "text/plain",
                                        "utf-8",
                                        403,
                                        "Not the player",
                                        emptyMap(),
                                        ByteArrayInputStream(ByteArray(0))
                                    )
                                }

                                // The web view is told who asks and no more: not how, and not at which port. An
                                // answer would give the password in clear to whoever asks in the player's name.
                                override fun onReceivedHttpAuthRequest(
                                    view: WebView,
                                    handler: HttpAuthHandler,
                                    host: String,
                                    realm: String
                                ) {
                                    Log.w(Tag, "a login asked of the web view, which has none")
                                    handler.cancel()
                                }

                                // The system takes the renderer of a page out of sight when it is short of memory.
                                // Unanswered, that ends the app; the view cannot be used again, so another is made.
                                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                                    Log.w(Tag, "the renderer is gone, crashed: ${detail.didCrash()}")
                                    greeted = false
                                    canGoBack = false
                                    generation++
                                    return true
                                }

                                override fun onReceivedError(
                                    view: WebView,
                                    request: WebResourceRequest,
                                    error: WebResourceError
                                ) {
                                    if (request.isForMainFrame) loadFailed("${error.errorCode} ${error.description}")
                                }
                            }
                            WebBridge.attach(this, root.toString().removeSuffix("/"), WebBridge(bridge))
                            loadUrl(root.toString())
                            view = this
                        }
                    },
                    onRelease = { it.destroy() }
                )
            }
        }
    }
}

/** Waits until the player takes the kept login no more. */
@OptIn(ExperimentalCoroutinesApi::class)
private suspend fun StateFlow<PlayerConnection?>.awaitRefused() {
    flatMapLatest { it?.refused ?: flowOf(false) }.first { it }
}

private fun HttpUrl.isOriginOf(address: Uri): Boolean = address.toString().toHttpUrlOrNull()?.let(::sameOrigin) == true

/** Opens a link in the browser. Only an address of the web: a page starts nothing else on the device. */
private fun openOutside(context: Context, link: Uri) {
    if (link.scheme != "http" && link.scheme != "https") return
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, link).addCategory(Intent.CATEGORY_BROWSABLE))
    } catch (e: ActivityNotFoundException) {
        Log.w(Tag, "nothing on the device opens a link: ${e.message}")
    }
}
