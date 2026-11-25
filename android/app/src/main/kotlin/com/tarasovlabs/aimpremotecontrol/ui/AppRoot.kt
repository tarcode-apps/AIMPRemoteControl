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

/** The app's screens and the way between them: the list, a player's settings, a player's web client. */
@Composable
fun AppRoot(viewModel: PlayersViewModel = viewModel(factory = PlayersViewModel.Factory)) {
    val players by viewModel.players.collectAsStateWithLifecycle()

    var opened by rememberSaveable { mutableStateOf<String?>(null) }
    var editing by rememberSaveable { mutableStateOf<String?>(null) }

    val saved: List<Player> = players ?: run {
        Surface(modifier = Modifier.fillMaxSize()) { }
        return
    }
    val openedPlayer = saved.firstOrNull { it.id == opened }
    val editedId = editing

    when {
        openedPlayer != null -> PlayerWebView(
            player = openedPlayer,
            onClose = { opened = null },
            onLoginRefused = {
                viewModel.loginRefused(openedPlayer.id)
                opened = null
            }
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

        else -> PlayersScreen(
            viewModel = viewModel,
            onOpen = { opened = it },
            onEdit = { editing = it ?: NewPlayer }
        )
    }
}
