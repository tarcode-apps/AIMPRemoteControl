package com.tarasovlabs.aimpremotecontrol.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp

/** The corners of a dialog, of a card, and of what is pressed inside a card. */
internal val PanelShape = RoundedCornerShape(12.dp)

/** A button of text alone, in capitals and the accent colour as the web client has them (`TextButton.module.scss`). */
@Composable
fun CapsButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color = MaterialTheme.colorScheme.primary
) {
    TextButton(
        onClick = onClick,
        modifier = modifier.heightIn(min = 36.dp),
        enabled = enabled,
        shape = RoundedCornerShape(18.dp),
        colors = ButtonDefaults.textButtonColors(contentColor = color)
    ) {
        // By the rules of the language the text is in: capitals differ between languages.
        Text(
            text.uppercase(LocalConfiguration.current.locales[0]),
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
    }
}

/** The measures of a switch: its track, the thumb, and the room around the thumb. */
private class SwitchSize(val width: Dp, val height: Dp, val thumb: Dp) {
    val inset = (height - thumb) / 2
    val travel = width - thumb - inset * 2
}

// The system's size; the web client's, for a row of text as small as a card's.
private val StandardSwitch = SwitchSize(width = 52.dp, height = 32.dp, thumb = 24.dp)
private val CompactSwitch = SwitchSize(width = 36.dp, height = 22.dp, thumb = 16.dp)

/**
 * A switch as the web client draws it (`Switch.module.scss`), of the system's size unless [compact]. It only
 * shows the state: the row it stands in is pressed as a whole, and read out with its text.
 */
@Composable
fun AppSwitch(checked: Boolean, modifier: Modifier = Modifier, compact: Boolean = false) {
    val colors = MaterialTheme.colorScheme
    val measures = if (compact) CompactSwitch else StandardSwitch
    val track by animateColorAsState(if (checked) colors.primaryContainer else colors.outline)
    val shift = animateDpAsState(if (checked) measures.travel else 0.dp)
    Box(
        modifier = modifier
            .size(width = measures.width, height = measures.height)
            .background(track, CircleShape)
            .padding(measures.inset)
    ) {
        Box(
            modifier = Modifier
                // Read while placing: a frame of the move composes nothing.
                .offset { IntOffset(shift.value.roundToPx(), 0) }
                .size(measures.thumb)
                .background(Color.White, CircleShape)
        )
    }
}
