package com.tarasovlabs.aimpremotecontrol.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.tarasovlabs.aimpremotecontrol.players.Player

private const val NewPlayer = "new"

/**
 * The app's screens and the way between them. With a player connected the app is that player's: its web
 * client is all there is, until the user disconnects in it. With none connected there is the list of
 * players and their settings.
 */
@Composable
fun AppRoot(viewModel: PlayersViewModel = viewModel(factory = PlayersViewModel.Factory)) {
    val players by viewModel.players.collectAsStateWithLifecycle()
    val connectedId by viewModel.connected.collectAsStateWithLifecycle()

    var editing by rememberSaveable { mutableStateOf<String?>(null) }

    val saved: List<Player> = players ?: run {
        Surface(modifier = Modifier.fillMaxSize()) { }
        return
    }
    val connected = saved.firstOrNull { it.id == connectedId }
    val editedId = editing

    when {
        connected != null -> PlayerWebView(
            player = connected,
            connection = viewModel.connection,
            onDisconnect = viewModel::disconnect,
            onLoginRefused = { viewModel.loginRefused(connected.id) },
            onLoadFailed = { reason -> viewModel.loadFailed(connected.id, reason) }
        )

        editedId != null -> PlayerEditScreen(
            player = saved.firstOrNull { it.id == editedId },
            onSave = {
                viewModel.save(it)
                editing = null
            },
            onDelete = {
                viewModel.remove(editedId)
                editing = null
            },
            onClose = { editing = null }
        )

        else -> PlayersScreen(viewModel = viewModel, onEdit = { editing = it ?: NewPlayer })
    }
}
