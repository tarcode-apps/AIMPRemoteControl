package com.tarasovlabs.aimpremotecontrol.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.util.AndroidRuntimeException
import android.util.Log
import androidx.core.net.toUri
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

private const val Tag = "SystemWebView"

/**
 * The oldest system web view that shows the web client: its scripts are built for Chromium 111 and later
 * (the baseline of Next.js), and it reaches the API over the bridge, which the web view has from long before.
 * Android 8 and 9 get the web view up to 138.
 */
const val MinWebViewVersion = 111

// Where the system has none of its own to name: the web view of Google Play.
private const val DefaultWebViewPackage = "com.google.android.webview"

/** The system's web view as the app needs it: [usable] when it shows the client, and the app it comes with. */
data class SystemWebView(val usable: Boolean, val packageName: String)

/** Reads the web view the system has now. It loads the web view into the app, as the first web view does. */
fun systemWebView(context: Context): SystemWebView {
    val installed = WebViewCompat.getCurrentWebViewPackage(context)
        ?: return SystemWebView(usable = false, DefaultWebViewPackage)
    val bridged = try {
        WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
    } catch (e: AndroidRuntimeException) {
        // The web view is there, and turned off.
        Log.w(Tag, "the web view does not load: ${e.message}")
        false
    }
    return SystemWebView(webViewUsable(installed.versionName, bridged), installed.packageName)
}

/** Whether a web view of [versionName] (`138.0.7204.179`) shows the client; [bridged], whether it has the bridge. */
internal fun webViewUsable(versionName: String?, bridged: Boolean): Boolean {
    val major = versionName?.substringBefore('.')?.toIntOrNull() ?: return false
    return bridged && major >= MinWebViewVersion
}

/** Opens the page of the web view's app in the store, or in the browser on a device without one. */
fun openWebViewUpdate(context: Context, packageName: String) {
    val store = Intent(Intent.ACTION_VIEW, "market://details?id=$packageName".toUri())
    val page = Intent(Intent.ACTION_VIEW, "https://play.google.com/store/apps/details?id=$packageName".toUri())
    for (intent in listOf(store, page)) {
        try {
            context.startActivity(intent)
            return
        } catch (_: ActivityNotFoundException) {
            // The next one.
        }
    }
    Log.w(Tag, "nothing on the device opens the page of $packageName")
}
