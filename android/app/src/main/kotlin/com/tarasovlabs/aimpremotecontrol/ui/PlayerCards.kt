package com.tarasovlabs.aimpremotecontrol.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tarasovlabs.aimpremotecontrol.R
import com.tarasovlabs.aimpremotecontrol.players.CallAction
import com.tarasovlabs.aimpremotecontrol.players.Player

private val SettingBleed = 8.dp
private val SettingsMargin = 6.dp

/** Makes an element wider than the room it is given by [horizontal] on each side, over its neighbours' margins. */
internal fun Modifier.bleed(horizontal: Dp) = layout { measurable, constraints ->
    val extra = horizontal.roundToPx() * 2
    val placeable = measurable.measure(
        constraints.copy(minWidth = constraints.minWidth + extra, maxWidth = constraints.maxWidth + extra)
    )
    layout(placeable.width - extra, placeable.height) { placeable.place(-extra / 2, 0) }
}

/**
 * A player the user keeps. [online] is null while nothing is known yet. Its settings are rows across the
 * card, as in the system's settings, so that they fit a narrow screen whatever their values say.
 */
@Composable
fun SavedPlayerCard(
    player: Player,
    online: Boolean?,
    loginNeeded: Boolean,
    connecting: Boolean,
    unreachable: Boolean,
    onConnect: () -> Unit,
    onCancel: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onAutoConnect: (Boolean) -> Unit,
    onCallAction: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onConnect,
        modifier = modifier.fillMaxWidth(),
        enabled = !connecting,
        shape = PanelShape,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
            disabledContainerColor = MaterialTheme.colorScheme.surfaceContainer,
            disabledContentColor = MaterialTheme.colorScheme.onSurface
        ),
        border = if (connecting) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null
    ) {
        Column(modifier = Modifier.padding(start = 16.dp, top = 8.dp, end = 4.dp, bottom = 2.dp)) {
            Row(modifier = Modifier.padding(end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    IconTile(player.icon.drawable, size = 48.dp, active = online == true && !unreachable)
                    NameAndAddress(
                        player.title,
                        player.address,
                        locked = player.login.isNotEmpty() || loginNeeded,
                        large = true
                    )
                }
                PlayerMenu(player.title, onEdit, onDelete)
            }
            // What the player is doing and the button for it. The whole card connects as well; the button
            // says so, and stays in its place whatever it reads. Its text ends where the switch below does.
            TextAndButton(
                modifier = Modifier.heightIn(min = 48.dp),
                text = {
                    // Two lines of it fill the row; the room keeps them off the line below.
                    Box(modifier = Modifier.padding(vertical = 2.dp)) {
                        when {
                            connecting -> Text(
                                stringResource(R.string.player_connecting),
                                style = MaterialTheme.typography.labelLarge
                            )

                            unreachable -> Unreachable()

                            else -> Status(online, authMissing = loginNeeded && player.login.isEmpty())
                        }
                    }
                },
                button = {
                    val colors = MaterialTheme.colorScheme
                    when {
                        connecting -> CapsButton(stringResource(R.string.action_cancel), onClick = onCancel)

                        unreachable -> CapsButton(stringResource(R.string.action_retry), onClick = onConnect)

                        else -> CapsButton(
                            stringResource(R.string.player_connect),
                            onClick = onConnect,
                            // A player that is not seen may still answer: the search does not reach everywhere.
                            color = if (online == true) colors.primary else colors.onSurfaceVariant
                        )
                    }
                }
            )
            Column(modifier = Modifier.padding(end = 12.dp)) {
                // The line turns into the progress of a connection, which so takes no room of its own.
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.dp),
                    contentAlignment = Alignment.Center
                ) {
                    if (connecting) {
                        LinearProgressIndicator(modifier = Modifier.fillMaxSize())
                    } else {
                        HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f))
                    }
                }
                // The rows are as high as a touch needs, which sets their texts far apart: room above and
                // below the pair keeps that from looking like a gap, and the first ripple off the line.
                Spacer(Modifier.height(SettingsMargin))
                SettingRow(
                    icon = R.drawable.ic_bolt,
                    text = stringResource(R.string.player_auto_connect),
                    modifier = Modifier.toggleable(
                        value = player.autoConnect,
                        role = Role.Switch,
                        onValueChange = onAutoConnect
                    )
                ) {
                    AppSwitch(checked = player.autoConnect, compact = true)
                }
                SettingRow(
                    icon = R.drawable.ic_call,
                    text = stringResource(R.string.call_title),
                    value = when (player.callAction) {
                        CallAction.None -> stringResource(R.string.call_nothing)
                        CallAction.LowerVolume -> stringResource(R.string.player_call_lower, player.callVolume)
                        CallAction.Pause -> stringResource(R.string.call_pause)
                    },
                    valueSet = player.callAction != CallAction.None,
                    modifier = Modifier.clickable(onClick = onCallAction)
                ) {
                    Icon(
                        painterResource(R.drawable.ic_chevron_right),
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(Modifier.height(SettingsMargin))
            }
        }
    }
}

/** A player the search has found and the user does not keep yet. */
@Composable
fun FoundPlayerCard(
    name: String,
    address: String,
    loginNeeded: Boolean,
    connecting: Boolean,
    unreachable: Boolean,
    onConnect: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedCard(
        onClick = onConnect,
        modifier = modifier.fillMaxWidth(),
        enabled = !connecting,
        shape = PanelShape,
        colors = CardDefaults.outlinedCardColors(
            disabledContainerColor = MaterialTheme.colorScheme.surface,
            disabledContentColor = MaterialTheme.colorScheme.onSurface
        ),
        border = CardDefaults.outlinedCardBorder()
    ) {
        // The text of the button ends as far from the edge as the card's content starts from the other.
        Column(
            modifier = Modifier.padding(start = 16.dp, top = 10.dp, end = 4.dp, bottom = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            TextAndButton(
                text = {
                    // Tight enough for an address to fit whole beside the button on a narrow screen.
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        IconTile(R.drawable.ic_player_desktop, size = 44.dp, active = false)
                        NameAndAddress(name, address, locked = loginNeeded, large = false)
                    }
                },
                button = {
                    // The button keeps its place while the spinner is shown, so that the card keeps its size.
                    Box(contentAlignment = Alignment.Center) {
                        CapsButton(
                            stringResource(R.string.player_connect),
                            onClick = onConnect,
                            modifier = Modifier.alpha(if (connecting) 0f else 1f),
                            enabled = !connecting
                        )
                        if (connecting) CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.5.dp)
                    }
                }
            )
            if (unreachable) Unreachable(modifier = Modifier.padding(end = 12.dp))
        }
    }
}

// The width a text and a button need, in letters of the usual size, to stand side by side.
private val SideBySideWidth = 220.dp

/**
 * A text with its button at the end of the row. Where the row is too narrow for both, as it is with the largest
 * letters the system offers, the button goes under the text and keeps its edge.
 */
@Composable
private fun TextAndButton(
    text: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    button: @Composable () -> Unit
) {
    BoxWithConstraints(modifier = modifier) {
        if (maxWidth / LocalDensity.current.fontScale >= SideBySideWidth) {
            Row(
                modifier = Modifier.heightIn(min = minHeight),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(modifier = Modifier.weight(1f)) { text() }
                button()
            }
        } else {
            Column(modifier = Modifier.fillMaxWidth()) {
                text()
                Box(modifier = Modifier.align(Alignment.End)) { button() }
            }
        }
    }
}

@Composable
fun IconTile(@DrawableRes icon: Int, size: Dp, active: Boolean, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    Box(
        modifier = modifier
            .size(size)
            .background(if (active) colors.secondaryContainer else colors.surfaceContainerHigh, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            painterResource(icon),
            contentDescription = null,
            modifier = Modifier.size(size / 2),
            tint = if (active) colors.onSecondaryContainer else colors.onSurfaceVariant
        )
    }
}

@Composable
private fun PlayerMenu(title: String, onEdit: () -> Unit, onDelete: () -> Unit) {
    var open by remember { mutableStateOf(false) }

    Box {
        IconButton(onClick = { open = true }) {
            Icon(
                painterResource(R.drawable.ic_more_vert),
                contentDescription = stringResource(R.string.player_more, title),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.player_edit)) },
                onClick = {
                    open = false
                    onEdit()
                }
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.player_delete)) },
                onClick = {
                    open = false
                    onDelete()
                }
            )
        }
    }
}

@Composable
private fun Status(online: Boolean?, authMissing: Boolean) {
    val colors = MaterialTheme.colorScheme
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // The dot alone is in the accent colour: the button beside the text is, and the two must not look alike.
            val dot = if (online == true) colors.primaryContainer else colors.onSurfaceVariant
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(if (online == true) dot else Color.Transparent, CircleShape)
                    .border(1.5.dp, dot, CircleShape)
            )
            Text(
                stringResource(
                    when (online) {
                        true -> R.string.player_online
                        false -> R.string.player_offline
                        null -> R.string.player_checking
                    }
                ),
                style = MaterialTheme.typography.labelLarge,
                color = if (online == true) colors.onSurface else colors.onSurfaceVariant
            )
        }
        // Only what the user has to do something about: a saved password needs no word.
        if (authMissing) {
            Text(
                stringResource(R.string.auth_required),
                style = MaterialTheme.typography.bodyMedium,
                color = colors.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/**
 * A player's name over its address, with a lock after the name when the player asks for a password. The name is
 * [large] on the card of a kept player.
 */
@Composable
private fun NameAndAddress(
    name: String,
    address: String,
    locked: Boolean,
    large: Boolean,
    modifier: Modifier = Modifier
) {
    val nameStyle = MaterialTheme.typography.titleMedium
    Column(modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                name,
                modifier = Modifier.weight(1f, fill = false),
                style = if (large) nameStyle.copy(fontSize = 18.sp, lineHeight = 24.sp) else nameStyle,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (locked) {
                Icon(
                    painterResource(R.drawable.ic_lock),
                    contentDescription = stringResource(R.string.auth_required),
                    modifier = Modifier.size(if (large) 18.dp else 16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Text(
            address,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/** What a card says of a player that did not answer. */
@Composable
private fun Unreachable(modifier: Modifier = Modifier) {
    Text(
        stringResource(R.string.player_unreachable),
        modifier = modifier,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.error
    )
}

/**
 * A row of a player's setting across the card: what it is on the left, its state on the right. A [value]
 * stands at the end of the row, and under the name where the two do not fit beside each other: on a narrow
 * screen, or in a language with longer words. It is pale unless [valueSet]: the setting does nothing then.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SettingRow(
    @DrawableRes icon: Int,
    text: String,
    modifier: Modifier,
    value: String? = null,
    valueSet: Boolean = true,
    state: @Composable RowScope.() -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            // The touch and its ripple reach past the content, which stays in line with the status above.
            .bleed(SettingBleed)
            .heightIn(min = 48.dp)
            .clip(PanelShape)
            .then(modifier)
            .padding(horizontal = SettingBleed),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Icon(
            painterResource(icon),
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        // Spread apart on one line; alone on the second, the value starts under the name. The text is as
        // large as the status above it, which a larger one would drown.
        FlowRow(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.SpaceBetween,
            itemVerticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text,
                // Keeps the value off the name when both are on one line.
                modifier = Modifier.padding(end = if (value != null) 12.dp else 0.dp),
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (value != null) {
                Text(
                    value,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (valueSet) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        state()
    }
}
