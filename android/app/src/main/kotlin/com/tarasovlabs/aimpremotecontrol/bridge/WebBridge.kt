package com.tarasovlabs.aimpremotecontrol.bridge

import android.annotation.SuppressLint
import android.net.Uri
import android.util.Log
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

private const val Tag = "WebBridge"

/**
 * Joins a [BridgeSession] to a web view: the client finds the app as `window.aimpRemoteControlApp`. The
 * session's callbacks come on the main thread.
 */
class WebBridge(private val session: BridgeSession) : WebViewCompat.WebMessageListener {
    // The listener is added only where the web view has the feature, in attach().
    @SuppressLint("RequiresFeature")
    override fun onPostMessage(
        view: WebView,
        message: WebMessageCompat,
        sourceOrigin: Uri,
        isMainFrame: Boolean,
        replyProxy: JavaScriptReplyProxy
    ) {
        // A frame within the page is not the client.
        if (!isMainFrame) return
        // A page may send bytes as well, and asking those for their text throws.
        if (message.type != WebMessageCompat.TYPE_STRING) {
            Log.w(Tag, "not a message: no text")
            return
        }
        session.receive(message.data, replyProxy::postMessage)
    }

    companion object {
        private const val ObjectName = "aimpRemoteControlApp"

        /** What a [BridgeSession] made for a web view logs with. */
        fun log(text: String) {
            Log.w(Tag, text)
        }

        /**
         * Gives the pages of [origin] the bridge, and no other page. Where the system's web view is too old
         * for it there is none, and the client runs as it does in a browser.
         */
        fun attach(view: WebView, origin: String, bridge: WebBridge) {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                WebViewCompat.addWebMessageListener(view, ObjectName, setOf(origin), bridge)
            } else {
                Log.w(Tag, "the web view is too old for the bridge")
            }
        }
    }
}
