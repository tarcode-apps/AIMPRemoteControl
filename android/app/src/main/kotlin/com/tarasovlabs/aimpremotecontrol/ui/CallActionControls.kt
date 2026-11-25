package com.tarasovlabs.aimpremotecontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tarasovlabs.aimpremotecontrol.R
import com.tarasovlabs.aimpremotecontrol.players.CallAction
import com.tarasovlabs.aimpremotecontrol.players.Player
import kotlin.math.roundToInt

private const val VolumeStep = 5

/** The choice of what a call does to a player. [onVolumeSet] comes when the slider is let go. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallActionControls(
    action: CallAction,
    volume: Int,
    onAction: (CallAction) -> Unit,
    onVolume: (Int) -> Unit,
    modifier: Modifier = Modifier,
    onVolumeSet: () -> Unit = {}
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            CallAction.entries.forEachIndexed { index, option ->
                SegmentedButton(
                    selected = option == action,
                    onClick = { onAction(option) },
                    shape = SegmentedButtonDefaults.itemShape(index, CallAction.entries.size),
                    label = {
                        Text(
                            stringResource(
                                when (option) {
                                    CallAction.None -> R.string.call_nothing
                                    CallAction.LowerVolume -> R.string.call_lower
                                    CallAction.Pause -> R.string.call_pause
                                }
                            )
                        )
                    }
                )
            }
        }
        // The volume is laid out for every choice and only shown for its own, so that the choice does not
        // change the height; the other two say in its place what they do.
        val lower = action == CallAction.LowerVolume
        Box(contentAlignment = Alignment.Center) {
            Column(modifier = if (lower) Modifier else Modifier.alpha(0f).clearAndSetSemantics { }) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(stringResource(R.string.call_volume), modifier = Modifier.weight(1f))
                    Text(
                        stringResource(R.string.call_volume_value, volume),
                        color = MaterialTheme.colorScheme.secondary,
                        style = MaterialTheme.typography.titleMedium
                    )
                }
                // The value stays with the caller, in whole steps; the slider's own state follows it.
                val slider = remember { SliderState(volume.toFloat(), trackRange = 0f..100f) }
                slider.value = volume.toFloat()
                Slider(
                    state = slider,
                    onValueChange = { onVolume((it / VolumeStep).roundToInt() * VolumeStep) },
                    enabled = lower,
                    onValueChangeFinished = onVolumeSet
                )
                Hint(stringResource(R.string.call_volume_hint))
            }
            if (!lower) {
                Hint(
                    stringResource(if (action == CallAction.Pause) R.string.call_pause_hint else R.string.call_nothing_hint),
                    modifier = Modifier.padding(horizontal = 16.dp),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

/** The same choice for a saved player, from its card: every change is kept at once. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallActionSheet(player: Player, onChange: (Player) -> Unit, onDismiss: () -> Unit) {
    var volume by remember(player.id) { mutableIntStateOf(player.callVolume) }

    // Opened whole at once: half of it is of no use, and in a low window it scrolls.
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(stringResource(R.string.call_title), style = MaterialTheme.typography.titleLarge)
            CallActionControls(
                action = player.callAction,
                volume = volume,
                onAction = { onChange(player.copy(callAction = it)) },
                onVolume = { volume = it },
                onVolumeSet = { onChange(player.copy(callVolume = volume)) }
            )
        }
    }
}

@Composable
private fun Hint(text: String, modifier: Modifier = Modifier, textAlign: TextAlign? = null) {
    Text(
        text,
        modifier = modifier,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = textAlign,
        style = MaterialTheme.typography.bodyMedium
    )
}
