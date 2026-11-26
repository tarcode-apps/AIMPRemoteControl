package com.tarasovlabs.aimpremotecontrol.playback

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.core.content.ContextCompat
import androidx.core.graphics.createBitmap
import androidx.core.graphics.drawable.DrawableCompat
import com.tarasovlabs.aimpremotecontrol.R
import java.io.ByteArrayOutputStream

private const val Size = 512

// The web client's player without a cover, in its dark theme: the surface, and the note in secondary text.
private const val Surface = 0xFF35363A.toInt()
private const val Note = 0xFF9E9EA0.toInt()

// Of the side of the cover, as the web client sizes the note.
private const val NoteShare = 0.4f

/**
 * The cover of a track that has none, and of a player that plays nothing: the web client's, a note on its
 * surface, as an image file. The dark one alone: the system's media card is dark.
 */
fun noCoverImage(context: Context): ByteArray {
    val note = checkNotNull(ContextCompat.getDrawable(context, R.drawable.ic_music_note)).mutate()
    DrawableCompat.setTint(note, Note)
    val bitmap = createBitmap(Size, Size)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Surface)
    val side = (Size * NoteShare).toInt()
    val inset = (Size - side) / 2
    note.setBounds(inset, inset, inset + side, inset + side)
    note.draw(canvas)
    return ByteArrayOutputStream().use { out ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        bitmap.recycle()
        out.toByteArray()
    }
}
