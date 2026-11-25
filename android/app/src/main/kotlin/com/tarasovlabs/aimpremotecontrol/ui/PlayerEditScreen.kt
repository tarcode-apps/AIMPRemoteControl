package com.tarasovlabs.aimpremotecontrol.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.InputTransformation
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tarasovlabs.aimpremotecontrol.R
import com.tarasovlabs.aimpremotecontrol.players.CallAction
import com.tarasovlabs.aimpremotecontrol.players.Player
import com.tarasovlabs.aimpremotecontrol.players.PlayerIcon
import com.tarasovlabs.aimpremotecontrol.players.isHost
import com.tarasovlabs.aimpremotecontrol.players.isPasted
import com.tarasovlabs.aimpremotecontrol.players.parseAddress
import java.util.UUID

/** The settings of a kept player, or of a new one when [player] is null. A wide window has them in two columns. */
@Composable
fun PlayerEditScreen(player: Player?, onSave: (Player) -> Unit, onDelete: () -> Unit, onClose: () -> Unit) {
    val layout = rememberWindowLayout()
    val name = rememberTextFieldState(player?.name.orEmpty())
    val host = rememberTextFieldState(player?.host.orEmpty())
    val port = rememberTextFieldState((player?.port ?: Player.DefaultPort).toString())
    val login = rememberTextFieldState(player?.login.orEmpty())
    val password = rememberTextFieldState(player?.password.orEmpty())
    var icon by rememberSaveable { mutableStateOf(player?.icon ?: PlayerIcon.Desktop) }
    var autoConnect by rememberSaveable { mutableStateOf(player?.autoConnect ?: false) }
    var callAction by rememberSaveable { mutableStateOf(player?.callAction ?: CallAction.None) }
    var callVolume by rememberSaveable { mutableIntStateOf(player?.callVolume ?: Player.DefaultCallVolume) }
    // The fields are not blamed before the user has tried to save them.
    var checked by rememberSaveable { mutableStateOf(false) }
    var deleting by rememberSaveable { mutableStateOf(false) }

    val hostValue = host.text.toString().trim()
    val portValue = port.text.toString().toIntOrNull()?.takeIf { it in Player.Ports }
    val hostError = when {
        !checked || isHost(hostValue) -> null
        hostValue.isEmpty() -> stringResource(R.string.edit_address_required)
        else -> stringResource(R.string.edit_address_invalid)
    }

    fun save() {
        checked = true
        if (!isHost(hostValue) || portValue == null) return
        onSave(
            (player ?: Player(id = UUID.randomUUID().toString(), host = hostValue)).copy(
                host = hostValue,
                port = portValue,
                name = name.text.toString().trim(),
                icon = icon,
                login = login.text.toString(),
                password = password.text.toString(),
                autoConnect = autoConnect,
                callAction = callAction,
                callVolume = callVolume
            )
        )
    }

    val identity = @Composable {
        // The placeholder tells what an empty name stands for, as the web client's playlist name does.
        UnderlinedTextField(
            state = name,
            label = stringResource(R.string.edit_name),
            modifier = Modifier.fillMaxWidth(),
            placeholder = player?.announcedName?.ifEmpty { null } ?: stringResource(R.string.edit_name_placeholder)
        )
        IconChoice(icon, onChoose = { icon = it })
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            UnderlinedTextField(
                state = host,
                label = stringResource(R.string.edit_address),
                modifier = Modifier.weight(1f),
                placeholder = stringResource(R.string.edit_address_placeholder),
                error = hostError,
                // A link to the player, pasted, gives the address and the port at once.
                inputTransformation = InputTransformation {
                    if (isPasted(originalText, asCharSequence())) {
                        parseAddress(asCharSequence().toString())?.let { parsed ->
                            replace(0, length, parsed.host)
                            parsed.port?.let { port.setTextAndPlaceCursorAtEnd(it.toString()) }
                        }
                    }
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false)
            )
            UnderlinedTextField(
                state = port,
                label = stringResource(R.string.edit_port),
                modifier = Modifier.width(96.dp),
                error = if (checked && portValue == null) stringResource(R.string.edit_port_invalid) else null,
                inputTransformation = InputTransformation {
                    if (length > 5 || !asCharSequence().all(Char::isDigit)) revertAllChanges()
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
        }
    }
    val auth = @Composable {
        SectionTitle(stringResource(R.string.edit_section_auth))
        UnderlinedTextField(
            state = login,
            label = stringResource(R.string.auth_username),
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(autoCorrectEnabled = false)
        )
        UnderlinedPasswordField(password, modifier = Modifier.fillMaxWidth())
    }
    val behaviour = @Composable { first: Boolean ->
        SectionTitle(stringResource(R.string.edit_section_launch), first = first)
        // The row is the switch: its text is pressed and read out with it. The touch and its ripple reach past
        // the text, which stays in line with the fields.
        Row(
            modifier = Modifier
                .bleed(SwitchRowBleed)
                .clip(PanelShape)
                .toggleable(value = autoConnect, role = Role.Switch, onValueChange = { autoConnect = it })
                .heightIn(min = 48.dp)
                .padding(horizontal = SwitchRowBleed),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.edit_auto_connect), style = MaterialTheme.typography.bodyLarge)
                Text(
                    stringResource(R.string.edit_auto_connect_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            AppSwitch(checked = autoConnect)
        }

        SectionTitle(stringResource(R.string.call_title))
        CallActionControls(
            action = callAction,
            volume = callVolume,
            onAction = { callAction = it },
            onVolume = { callVolume = it }
        )

        if (player != null) {
            OutlinedButton(
                onClick = { deleting = true },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 14.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                contentPadding = ButtonDefaults.ButtonWithIconContentPadding
            ) {
                Icon(
                    painterResource(R.drawable.ic_delete),
                    contentDescription = null,
                    modifier = Modifier.size(ButtonDefaults.IconSize)
                )
                Spacer(Modifier.width(ButtonDefaults.IconSpacing))
                Text(stringResource(R.string.edit_delete))
            }
        }
    }

    BackHandler(onBack = onClose)

    Scaffold(
        topBar = {
            ScreenTopBar(
                title = player?.title ?: stringResource(R.string.edit_new_player),
                low = layout.low,
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(painterResource(R.drawable.ic_arrow_back), contentDescription = stringResource(R.string.action_back))
                    }
                },
                actions = { TextButton(onClick = ::save) { Text(stringResource(R.string.action_save)) } }
            )
        },
        // The keyboard is among them: the fields scroll clear of it.
        contentWindowInsets = screenInsets
    ) { innerPadding ->
        val frame = Modifier
            .fillMaxSize()
            .padding(innerPadding)
        val fields = Arrangement.spacedBy(14.dp)
        if (layout.wide) {
            // Each column scrolls by itself: one is not dragged along to reach the end of the other.
            Row(modifier = frame.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(32.dp)) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(top = 8.dp, bottom = 24.dp),
                    verticalArrangement = fields
                ) {
                    identity()
                    auth()
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(top = 8.dp, bottom = 24.dp),
                    verticalArrangement = fields
                ) {
                    behaviour(true)
                }
            }
        } else {
            Column(
                modifier = frame
                    .verticalScroll(rememberScrollState())
                    .padding(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 24.dp),
                verticalArrangement = fields
            ) {
                identity()
                auth()
                behaviour(false)
            }
        }
    }

    if (deleting && player != null) {
        DeletePlayerDialog(
            player = player,
            onDelete = {
                deleting = false
                onDelete()
            },
            onCancel = { deleting = false }
        )
    }
}

/** The title of a group of settings; the [first] one of a column stands level with the top of its neighbour. */
@Composable
private fun SectionTitle(text: String, first: Boolean = false) {
    Text(
        text,
        modifier = Modifier.padding(top = if (first) 0.dp else 14.dp),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.secondary
    )
}

private val SwitchRowBleed = 8.dp
private val IconChoiceSize = 52.dp

// The ring of the chosen icon stands clear of its circle: a gap of 3 dp and a line of 2.
private val RingRoom = 5.dp

/**
 * One row of icons that scrolls sideways. They are round, as on the cards; a ring around the circle marks the
 * chosen one, which so keeps the size and the colours of a card's tile.
 */
@Composable
private fun IconChoice(chosen: PlayerIcon, onChoose: (PlayerIcon) -> Unit) {
    val icons = PlayerIcon.entries
    // The chosen one is in sight when the screen opens.
    val scroll = rememberLazyListState(initialFirstVisibleItemIndex = (icons.indexOf(chosen) - 2).coerceAtLeast(0))

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Pale as the label of a filled field is.
        Text(
            stringResource(R.string.edit_icon),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        // The room for the rings reaches past the column, so that the circles start where the fields do.
        LazyRow(state = scroll, modifier = Modifier.bleed(RingRoom), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            items(icons) { icon ->
                val selected = icon == chosen
                val colors = MaterialTheme.colorScheme
                Box(
                    modifier = Modifier
                        .then(if (selected) Modifier.border(2.dp, colors.primary, CircleShape) else Modifier)
                        .padding(RingRoom)
                ) {
                    Surface(
                        selected = selected,
                        onClick = { onChoose(icon) },
                        shape = CircleShape,
                        color = if (selected) colors.secondaryContainer else colors.surfaceContainerHigh,
                        contentColor = if (selected) colors.onSecondaryContainer else colors.onSurfaceVariant
                    ) {
                        Box(modifier = Modifier.size(IconChoiceSize), contentAlignment = Alignment.Center) {
                            Icon(painterResource(icon.drawable), contentDescription = stringResource(icon.label))
                        }
                    }
                }
            }
        }
    }
}
