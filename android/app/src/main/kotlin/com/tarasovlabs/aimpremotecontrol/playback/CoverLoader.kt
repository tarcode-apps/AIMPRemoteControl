package com.tarasovlabs.aimpremotecontrol.playback

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.util.BitmapLoader
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import com.tarasovlabs.aimpremotecontrol.player.PlayerConnection
import java.io.IOException
import java.net.HttpURLConnection
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

private const val Tag = "CoverLoader"

/**
 * The covers of the session: a cover's address is its path on the connected player, which is asked under the
 * player's login, and the HTTP cache of the app keeps what it answers. A cover the player cannot give, for it
 * no longer knows it or is not there, is shown as [noCover], as the web client shows it.
 */
@OptIn(UnstableApi::class)
class CoverLoader(
    private val connection: StateFlow<PlayerConnection?>,
    private val noCover: ByteArray,
    private val scope: CoroutineScope
) : BitmapLoader {
    override fun supportsMimeType(mimeType: String): Boolean = true

    override fun decodeBitmap(data: ByteArray): ListenableFuture<Bitmap> = future { decode(data) }

    override fun loadBitmap(uri: Uri): ListenableFuture<Bitmap> = future {
        try {
            val http = connection.value?.http ?: throw IOException("no player is connected")
            http.get(uri.toString()) { response ->
                if (response.code != HttpURLConnection.HTTP_OK) throw IOException("HTTP ${response.code}")
                decode(response.body.bytes())
            }
        } catch (e: IOException) {
            missing(uri, e)
        } catch (e: SecurityException) {
            // The local network is behind a permission the user has taken back.
            missing(uri, e)
        }
    }

    private fun missing(uri: Uri, failure: Exception): Bitmap {
        Log.i(Tag, "the cover $uri is not there: $failure")
        return decode(noCover)
    }

    private fun future(make: suspend () -> Bitmap): ListenableFuture<Bitmap> {
        val future = SettableFuture.create<Bitmap>()
        val job = scope.launch(Dispatchers.IO) {
            try {
                future.set(make())
            } catch (e: IOException) {
                future.setException(e)
            }
        }
        // Media3 gives up a cover it no longer waits for.
        future.addListener({ if (future.isCancelled) job.cancel() }, Runnable::run)
        return future
    }

    /** @throws IOException when the bytes are no image. */
    private fun decode(data: ByteArray): Bitmap =
        BitmapFactory.decodeByteArray(data, 0, data.size) ?: throw IOException("not an image")
}
