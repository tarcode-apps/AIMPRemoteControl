package com.tarasovlabs.aimpremotecontrol.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.tarasovlabs.aimpremotecontrol.App
import com.tarasovlabs.aimpremotecontrol.discovery.DiscoveredPlayer
import com.tarasovlabs.aimpremotecontrol.discovery.DiscoveryState
import com.tarasovlabs.aimpremotecontrol.discovery.PlayerDiscovery
import com.tarasovlabs.aimpremotecontrol.network.PlayerAnswer
import com.tarasovlabs.aimpremotecontrol.network.askPlayer
import com.tarasovlabs.aimpremotecontrol.network.resolveHost
import com.tarasovlabs.aimpremotecontrol.players.Player
import com.tarasovlabs.aimpremotecontrol.players.PlayersStore
import java.net.Inet4Address
import java.net.InetAddress
import java.util.UUID
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** A kept player as the list shows it. [online] is null while nothing is known yet. */
data class SavedPlayerItem(val player: Player, val online: Boolean?, val loginNeeded: Boolean)

/** A found player the user does not keep, with the address the app would reach it at. */
data class FoundPlayerItem(val key: String, val name: String, val host: String, val port: Int, val loginNeeded: Boolean)

/** A login the user is asked for, to go on with the connection that [key] names. */
data class LoginRequest(val key: String, val player: Player, val refused: Boolean)

data class PlayersUiState(
    /** False until the kept players are read: an empty list means nothing before that. */
    val loaded: Boolean = false,
    val saved: List<SavedPlayerItem> = emptyList(),
    val found: List<FoundPlayerItem> = emptyList(),
    val searching: Boolean = false,
    val searchFailure: String? = null,
    /** One connection is tried at a time: the id of a kept player or the key of a found one. */
    val connecting: String? = null,
    /** Whose last connection got no answer, named as [connecting] is. */
    val unreachable: Set<String> = emptySet(),
    val loginRequest: LoginRequest? = null,
    /** The id of a player that has just let the app in: the screen opens it and says so. */
    val opened: String? = null
)

/**
 * The players and what is known of them: the kept ones, the ones the search finds, who answers, and the
 * connection being tried. The search and the checks run while somebody watches [uiState].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PlayersViewModel(
    private val store: PlayersStore,
    private val discovery: PlayerDiscovery,
    private val savedState: SavedStateHandle
) : ViewModel() {
    /** The kept players; null until they are read. */
    val players: StateFlow<List<Player>?> = store.players.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private data class Attempt(
        val connecting: String? = null,
        val unreachable: Set<String> = emptySet(),
        val loginRequest: LoginRequest? = null,
        val opened: String? = null
    )

    /** A found player with the address the app would reach it at: the plugin listens on IPv4 only. */
    private class Found(val player: DiscoveredPlayer, val host: String) {
        val loginNeeded: Boolean get() = player.attributes["auth"] == "1"
    }

    private val localNetwork = MutableStateFlow(false)

    // What the hosts of the kept players stand for, and whether a player answers there: a player reached
    // by a name of the user's own, or through another network, is not among the found ones.
    private val addresses = MutableStateFlow(emptyMap<String, Set<InetAddress>>())
    private val answers = MutableStateFlow(emptyMap<String, PlayerAnswer>())
    private val attempt = MutableStateFlow(Attempt())
    private var connection: Job? = null

    private val watching: Flow<Nothing> = localNetwork.flatMapLatest { allowed ->
        if (!allowed) {
            emptyFlow()
        } else {
            flow {
                discovery.start()
                try {
                    coroutineScope {
                        launch { keepAnnouncedNames() }
                        checkSavedPlayers()
                    }
                } finally {
                    discovery.stop()
                }
            }
        }
    }

    private val shown = combine(
        players.filterNotNull(),
        discovery.state,
        addresses,
        answers,
        attempt
    ) { players, discovery, addresses, answers, attempt ->
        val found = reachable(discovery)
        fun match(player: Player) = found.firstOrNull { it.player.isAt(player.host, player.port, addresses[player.host].orEmpty()) }

        PlayersUiState(
            loaded = true,
            saved = players.map { player ->
                val match = match(player)
                val answer = answers[player.address]
                SavedPlayerItem(
                    player = player,
                    online = if (match != null) true else answer?.reached,
                    loginNeeded = match?.loginNeeded == true || answer == PlayerAnswer.LoginNeeded
                )
            },
            found = found
                .filter { candidate -> players.none { match(it) === candidate } }
                .sortedBy { it.player.name.lowercase() }
                .map { FoundPlayerItem(it.player.serviceName, it.player.name, it.host, it.player.port, it.loginNeeded) },
            searching = discovery.searching,
            searchFailure = discovery.failure,
            connecting = attempt.connecting,
            unreachable = attempt.unreachable,
            loginRequest = attempt.loginRequest,
            opened = attempt.opened
        )
    }

    val uiState: StateFlow<PlayersUiState> = merge(watching, shown)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(StopAfter), PlayersUiState())

    init {
        // The player marked for it is opened once, when the app starts.
        if (savedState.get<Boolean>(AutoConnectTried) != true) {
            viewModelScope.launch {
                // Nothing is reached before the local network is open to the app.
                localNetwork.first { it }
                val marked = players.filterNotNull().first().firstOrNull { it.autoConnect }
                if (marked != null && savedState.get<Boolean>(AutoConnectTried) != true) connect(marked)
                savedState[AutoConnectTried] = true
            }
        }
    }

    /** From Android 17 on the local network is behind a permission; the screen tells whether the app has it. */
    fun setLocalNetwork(allowed: Boolean) {
        localNetwork.value = allowed
    }

    fun connect(player: Player) = connect(player.id, player)

    fun connect(found: FoundPlayerItem) = connect(
        found.key,
        Player(id = UUID.randomUUID().toString(), host = found.host, port = found.port, announcedName = found.name)
    )

    fun cancel() {
        connection?.cancel()
        attempt.update { it.copy(connecting = null) }
    }

    /** Goes on with the connection the login was asked for. */
    fun signIn(login: String, password: String) {
        val request = attempt.value.loginRequest ?: return
        connect(request.key, request.player.copy(login = login, password = password))
    }

    fun dismissLogin() {
        attempt.update { it.copy(loginRequest = null) }
    }

    /** The web view was refused with the login of a kept player: it is asked for again. */
    fun loginRefused(id: String) {
        val player = players.value?.firstOrNull { it.id == id } ?: return
        attempt.update { it.copy(loginRequest = LoginRequest(player.id, player, refused = true)) }
    }

    fun openedHandled() {
        attempt.update { it.copy(opened = null) }
    }

    fun save(player: Player) {
        viewModelScope.launch { store.save(player) }
    }

    fun remove(id: String) {
        viewModelScope.launch { store.remove(id) }
    }

    private fun connect(key: String, player: Player) {
        // Whatever the user starts first, the player marked for the start no longer cuts in.
        savedState[AutoConnectTried] = true
        connection?.cancel()
        attempt.update { it.copy(connecting = key, unreachable = it.unreachable - key, loginRequest = null) }
        connection = viewModelScope.launch {
            when (askPlayer(player.host, player.port, player.login, player.password, ConnectTimeout)) {
                PlayerAnswer.Ok -> {
                    // A found player is kept from here on, and so is a login that has just worked.
                    if (players.value?.contains(player) != true) store.save(player)
                    attempt.update { it.copy(connecting = null, opened = player.id) }
                }

                PlayerAnswer.LoginNeeded -> askLogin(key, player, refused = false)
                PlayerAnswer.LoginRefused -> askLogin(key, player, refused = true)
                is PlayerAnswer.Unreachable -> attempt.update { it.copy(connecting = null, unreachable = it.unreachable + key) }
            }
        }
    }

    private fun askLogin(key: String, player: Player, refused: Boolean) {
        attempt.update { it.copy(connecting = null, loginRequest = LoginRequest(key, player, refused)) }
    }

    private fun reachable(discovery: DiscoveryState): List<Found> = discovery.players.values.mapNotNull { player ->
        player.addresses.firstOrNull { it is Inet4Address }?.hostAddress?.let { Found(player, it) }
    }

    /** Asks the kept players now and then whether they are there, for as long as it runs. */
    private suspend fun checkSavedPlayers() {
        players.filterNotNull()
            .map { players -> players.map { it.host to it.port }.distinct() }
            .distinctUntilChanged()
            .collectLatest { targets ->
                while (true) {
                    coroutineScope {
                        for ((host, port) in targets) {
                            launch {
                                val found = resolveHost(host)
                                addresses.update { it + (host to found) }
                            }
                            launch {
                                val answer = askPlayer(host, port, "", "", ConnectTimeout)
                                answers.update { it + ("$host:$port" to answer) }
                            }
                        }
                    }
                    delay(CheckInterval)
                }
            }
    }

    /** Keeps the name a found player announces with the kept player it is, for when it is not found. */
    private suspend fun keepAnnouncedNames() {
        combine(players.filterNotNull(), discovery.state, addresses) { players, discovery, addresses ->
            val found = reachable(discovery)
            players.mapNotNull { player ->
                val name = found
                    .firstOrNull { it.player.isAt(player.host, player.port, addresses[player.host].orEmpty()) }
                    ?.player?.name
                if (name.isNullOrEmpty() || name == player.announcedName) null else player.copy(announcedName = name)
            }
        }.collect { renamed -> renamed.forEach { store.save(it) } }
    }

    companion object {
        private const val AutoConnectTried = "autoConnectTried"
        private const val ConnectTimeout = 5000L
        private const val CheckInterval = 15_000L

        // The search outlives a turn of the screen and a short look at another one.
        private const val StopAfter = 5000L

        val Factory = viewModelFactory {
            initializer {
                val app = this[APPLICATION_KEY] as App
                PlayersViewModel(app.players, PlayerDiscovery(app), createSavedStateHandle())
            }
        }
    }
}
