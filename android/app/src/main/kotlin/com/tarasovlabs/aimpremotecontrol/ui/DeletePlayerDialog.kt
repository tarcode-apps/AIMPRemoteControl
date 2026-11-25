package com.tarasovlabs.aimpremotecontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tarasovlabs.aimpremotecontrol.R
import com.tarasovlabs.aimpremotecontrol.players.Player

/** Asks before a player is deleted, showing which one it is. */
@Composable
fun DeletePlayerDialog(player: Player, onDelete: () -> Unit, onCancel: () -> Unit) {
    AppDialog(
        title = stringResource(R.string.delete_title),
        onDismiss = onCancel,
        actions = {
            CapsButton(stringResource(R.string.action_cancel), onClick = onCancel)
            CapsButton(stringResource(R.string.player_delete), onClick = onDelete)
        }
    ) {
        Column(modifier = Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                IconTile(player.icon.drawable, size = 44.dp, active = false)
                Column {
                    Text(
                        player.title,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        player.address,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Text(
                stringResource(R.string.delete_text),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
