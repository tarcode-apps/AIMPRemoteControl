package com.tarasovlabs.aimpremotecontrol.ui

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tarasovlabs.aimpremotecontrol.R
import kotlin.math.PI
import kotlin.math.sin

private const val LocalNetworkSdk = 37
private const val LocalNetworkPermission = "android.permission.ACCESS_LOCAL_NETWORK"

/**
 * The list of players: the kept ones and the ones the search finds. A wide window has them side by side,
 * a low one has no title row.
 */
@Composable
fun PlayersScreen(viewModel: PlayersViewModel, onOpen: (id: String) -> Unit, onEdit: (id: String?) -> Unit) {
    val context = LocalContext.current
    val activity = LocalActivity.current
    val layout = rememberWindowLayout()
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    // From Android 17 on the local network is behind a permission; before that there is none to ask for.
    var localNetwork by remember { mutableStateOf(hasLocalNetwork(context)) }
    var asked by rememberSaveable { mutableStateOf(false) }
    // Known only once the user has answered: while the system asks, there is nothing to complain of.
    var refused by rememberSaveable { mutableStateOf(false) }
    val askLocalNetwork = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        localNetwork = granted
        refused = !granted
    }
    LaunchedEffect(Unit) {
        if (!localNetwork && !asked) {
            asked = true
            askLocalNetwork.launch(LocalNetworkPermission)
        }
    }
    // The user may have changed it in the system settings meanwhile.
    LifecycleResumeEffect(Unit) {
        localNetwork = hasLocalNetwork(context)
        onPauseOrDispose { }
    }
    LaunchedEffect(localNetwork) { viewModel.setLocalNetwork(localNetwork) }

    LaunchedEffect(state.opened) {
        state.opened?.let { id ->
            viewModel.openedHandled()
            onOpen(id)
        }
    }

    var callActionOf by rememberSaveable { mutableStateOf<String?>(null) }
    var deleting by rememberSaveable { mutableStateOf<String?>(null) }

    @Composable
    fun Saved(item: SavedPlayerItem) {
        val player = item.player
        SavedPlayerCard(
            player = player,
            online = item.online,
            loginNeeded = item.loginNeeded,
            connecting = state.connecting == player.id,
            unreachable = player.id in state.unreachable,
            onConnect = { viewModel.connect(player) },
            onCancel = viewModel::cancel,
            onEdit = { onEdit(player.id) },
            onDelete = { deleting = player.id },
            onAutoConnect = { on -> viewModel.save(player.copy(autoConnect = on)) },
            onCallAction = { callActionOf = player.id }
        )
    }

    @Composable
    fun Found(item: FoundPlayerItem) {
        FoundPlayerCard(
            name = item.name,
            address = item.host,
            loginNeeded = item.loginNeeded,
            connecting = state.connecting == item.key,
            unreachable = item.key in state.unreachable,
            onConnect = { viewModel.connect(item) }
        )
    }

    @Composable
    fun SearchFailure(failure: String) {
        Text(stringResource(R.string.players_search_failed, failure), color = MaterialTheme.colorScheme.error)
    }

    // The button that adds a player stands at the title of the players kept, which it adds to; while none
    // is kept, at the only title there is.
    val add = { onEdit(null) }
    val addOnSaved = state.saved.isNotEmpty()

    fun LazyListScope.saved() {
        item(key = "saved", contentType = "header") {
            SectionHeader(stringResource(R.string.players_saved), onAdd = add)
        }
        items(state.saved, key = { it.player.id }, contentType = { "saved" }) { Saved(it) }
    }

    fun LazyListScope.found() {
        item(key = "found", contentType = "header") {
            SectionHeader(stringResource(R.string.players_found), state.searching, onAdd = add.takeIf { !addOnSaved })
        }
        state.searchFailure?.let { failure -> item(key = "failure", contentType = "text") { SearchFailure(failure) } }
        if (state.found.isEmpty()) {
            item(key = "nobody", contentType = "text") {
                Text(
                    stringResource(R.string.players_nobody_found),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        items(state.found, key = { "found:" + it.key }, contentType = { "found" }) { Found(it) }
    }

    val empty = state.saved.isEmpty() && state.found.isEmpty()
    Scaffold(
        // The titles of the parts say what the list is: the row above them names the app. A low window has
        // no room for it.
        topBar = {
            if (!layout.low) ScreenTopBar(title = stringResource(R.string.app_name), low = false, large = true)
        },
        contentWindowInsets = screenInsets
    ) { innerPadding ->
        val direction = LocalLayoutDirection.current
        // The lists reach the lower edge of the screen and end clear of the system's bar there.
        val bottomInset = innerPadding.calculateBottomPadding()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    start = innerPadding.calculateStartPadding(direction),
                    top = innerPadding.calculateTopPadding(),
                    end = innerPadding.calculateEndPadding(direction)
                )
        ) {
            if (!localNetwork && refused) {
                LocalNetworkRefused(
                    onAllow = {
                        // Refused for good, the system no longer asks: the way is through its settings.
                        if (activity?.shouldShowRequestPermissionRationale(LocalNetworkPermission) == false) {
                            context.startActivity(
                                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                            )
                        } else {
                            askLocalNetwork.launch(LocalNetworkPermission)
                        }
                    }
                )
            }
            val listPadding = PaddingValues(bottom = bottomInset + 16.dp)
            val cardSpacing = Arrangement.spacedBy(12.dp)
            when {
                !state.loaded -> Unit

                empty -> NoPlayers(
                    searching = state.searching,
                    sideBySide = layout.wide && layout.low,
                    titleFirst = layout.low,
                    onAdd = add,
                    modifier = Modifier
                        .weight(1f)
                        .padding(bottom = bottomInset)
                )

                !layout.wide -> LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 16.dp),
                    contentPadding = listPadding,
                    verticalArrangement = cardSpacing
                ) {
                    if (state.saved.isNotEmpty()) saved()
                    found()
                }

                // Nothing kept yet: the found ones take both columns.
                state.saved.isEmpty() -> LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 16.dp),
                    contentPadding = listPadding,
                    verticalArrangement = cardSpacing,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    item(key = "found", span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
                        SectionHeader(stringResource(R.string.players_found), state.searching, onAdd = add)
                    }
                    state.searchFailure?.let { failure ->
                        item(key = "failure", span = { GridItemSpan(maxLineSpan) }, contentType = "text") {
                            SearchFailure(failure)
                        }
                    }
                    items(state.found, key = { "found:" + it.key }, contentType = { "found" }) { Found(it) }
                }

                else -> Row(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    LazyColumn(modifier = Modifier.weight(1f), contentPadding = listPadding, verticalArrangement = cardSpacing) {
                        saved()
                    }
                    LazyColumn(modifier = Modifier.weight(1f), contentPadding = listPadding, verticalArrangement = cardSpacing) {
                        found()
                    }
                }
            }
        }
    }

    state.loginRequest?.let { request ->
        LoginDialog(
            login = request.player.login,
            refused = request.refused,
            onSignIn = viewModel::signIn,
            onCancel = viewModel::dismissLogin
        )
    }
    state.saved.firstOrNull { it.player.id == callActionOf }?.let { item ->
        CallActionSheet(player = item.player, onChange = viewModel::save, onDismiss = { callActionOf = null })
    }
    state.saved.firstOrNull { it.player.id == deleting }?.let { item ->
        DeletePlayerDialog(
            player = item.player,
            onDelete = {
                deleting = null
                viewModel.remove(item.player.id)
            },
            onCancel = { deleting = null }
        )
    }
}

private const val DotCount = 3
private const val DotPeriod = 1400
private const val DotLag = 0.18f
private const val DotLit = 0.35f

/**
 * An ellipsis whose dots light up in turn after a title, for a search that goes on by itself: quieter than a
 * spinner, which looks like something to wait for.
 */
@Composable
private fun SearchingDots(description: String) {
    val color = MaterialTheme.colorScheme.onSurfaceVariant
    val phase = rememberInfiniteTransition().animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(DotPeriod, easing = LinearEasing))
    )
    // On the baseline of the title, as the dots of an ellipsis are.
    Canvas(
        modifier = Modifier
            .padding(bottom = 6.dp)
            .size(width = 18.dp, height = 3.dp)
            .semantics { contentDescription = description }
    ) {
        val radius = size.height / 2
        val step = (size.width - size.height) / (DotCount - 1)
        repeat(DotCount) { dot ->
            val at = (phase.value - dot * DotLag + 1f) % 1f
            val lit = if (at < DotLit) sin(PI.toFloat() * at / DotLit) else 0f
            drawCircle(
                color = color.copy(alpha = 0.3f + 0.7f * lit),
                radius = radius,
                center = Offset(radius + step * dot, radius)
            )
        }
    }
}

private fun hasLocalNetwork(context: Context): Boolean =
    Build.VERSION.SDK_INT < LocalNetworkSdk ||
        context.checkSelfPermission(LocalNetworkPermission) == PackageManager.PERMISSION_GRANTED

// As high as the button with the room it needs around it. Every title is, with the button or without: titles
// beside each other in two columns then stand level.
private val HeaderHeight = 40.dp

// The width a title needs, in letters of the usual size, to have the whole text of the button beside it.
private val RoomyHeader = 320.dp

/**
 * The title of a part of the list, in line with the cards and the screen's title. It is pale and in plain
 * letters: the accent colour and capitals are the buttons', and a title must not look like one.
 * [searching] puts the ellipsis after it; with [onAdd] the button that adds a player stands at its end.
 */
@Composable
private fun SectionHeader(text: String, searching: Boolean = false, onAdd: (() -> Unit)? = null) {
    BoxWithConstraints {
        // On a narrow screen, or with large letters, the button says less instead of pushing the title out.
        val roomy = maxWidth / LocalDensity.current.fontScale >= RoomyHeader
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = HeaderHeight),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text,
                    modifier = Modifier.weight(1f, fill = false),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (searching) SearchingDots(stringResource(R.string.players_searching))
            }
            if (onAdd != null) {
                AddButton(stringResource(if (roomy) R.string.players_add_manually else R.string.players_add), onAdd)
            }
        }
    }
}

/**
 * Adds a player by hand, which is needed seldom: the button shows by its shape and says what it does, and
 * leaves the accent colour to the buttons that connect.
 */
@Composable
private fun AddButton(text: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .clickable(role = Role.Button, onClick = onClick)
            // Not a fixed height: letters of the largest size the system offers are taller than this.
            .heightIn(min = 36.dp)
            .padding(start = 10.dp, end = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(painterResource(R.drawable.ic_add), contentDescription = null, modifier = Modifier.size(18.dp))
        Text(text, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

@Composable
private fun LocalNetworkRefused(onAllow: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer
    ) {
        Row(
            modifier = Modifier.padding(start = 16.dp, top = 8.dp, end = 4.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                stringResource(R.string.local_network_refused),
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium
            )
            TextButton(
                onClick = onAllow,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.onErrorContainer)
            ) { Text(stringResource(R.string.local_network_allow)) }
        }
    }
}

// Radii of the rings around the round tile of 96 dp; they stand still and never touch it.
private val RingRadii = listOf(64.dp, 86.dp, 108.dp)
private const val GlowPeriod = 3600

// Of a period: how far behind its inner neighbour a ring lights up, how long it takes to light up, and
// how long to fade again, slowly, as the trace on a radar screen does.
private const val GlowLag = 0.14f
private const val GlowRise = 0.28f
private const val GlowFall = 0.5f
private val GlowEasing = CubicBezierEasing(0.37f, 0f, 0.63f, 1f)
private const val GlowDim = 0.12f
private const val GlowBright = 0.75f

/** The app's sign in rings that a light runs over from the inside out while the search goes on. */
@Composable
private fun SearchWaves(running: Boolean) {
    val accent = MaterialTheme.colorScheme.primary
    val phase = if (running) {
        rememberInfiniteTransition().animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(GlowPeriod, easing = LinearEasing))
        )
    } else {
        remember { mutableFloatStateOf(-1f) }
    }

    Box(
        modifier = Modifier
            .size(RingRadii.last() * 2)
            // The phase is read while drawing, so that a frame of the animation redraws and composes nothing.
            .drawBehind {
                RingRadii.forEachIndexed { ring, radius ->
                    val glow = if (phase.value < 0f) GlowDim else glow((phase.value - ring * GlowLag + 1f) % 1f)
                    drawCircle(
                        color = accent.copy(alpha = glow),
                        radius = radius.toPx(),
                        style = Stroke(1.5.dp.toPx())
                    )
                }
            },
        contentAlignment = Alignment.Center
    ) {
        IconTile(R.drawable.ic_app_symbol, size = 96.dp, active = true)
    }
}

/** The opacity of a ring at a point of its own period. */
private fun glow(at: Float): Float = when {
    at < GlowRise -> lerp(GlowDim, GlowBright, GlowEasing.transform(at / GlowRise))
    at < GlowRise + GlowFall -> lerp(GlowBright, GlowDim, GlowEasing.transform((at - GlowRise) / GlowFall))
    else -> GlowDim
}

/**
 * What the list shows while there is nothing in it: the search going on, and what a newcomer has to do.
 *
 * @param sideBySide the sign beside the steps: a phone on its side has no height for one under the other.
 * @param titleFirst the title stands over the sign, as the screen's own where it has no title row.
 */
@Composable
private fun NoPlayers(
    searching: Boolean,
    sideBySide: Boolean,
    titleFirst: Boolean,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier
) {
    val title = @Composable {
        Text(
            stringResource(R.string.players_empty_title),
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center
        )
    }
    val sign = @Composable {
        if (titleFirst) title()
        SearchWaves(running = searching)
        if (!titleFirst) title()
    }
    val steps = @Composable {
        // What a newcomer needs, who has the app and knows nothing of the plugin.
        Column(modifier = Modifier.widthIn(max = 400.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            SetupStep(1, stringResource(R.string.players_setup_aimp))
            SetupStep(2, stringResource(R.string.players_setup_plugin))
            SetupStep(3, stringResource(R.string.players_setup_network))
        }
    }
    val after = @Composable { align: TextAlign ->
        Text(
            stringResource(R.string.players_empty_text),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = align
        )
    }
    val add = @Composable {
        FilledTonalButton(onClick = onAdd, contentPadding = ButtonDefaults.ButtonWithIconContentPadding) {
            Icon(painterResource(R.drawable.ic_add), contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
            Spacer(Modifier.width(ButtonDefaults.IconSpacing))
            Text(stringResource(R.string.players_add_manually))
        }
    }
    // A small screen scrolls rather than cut the steps off.
    val frame = modifier
        .fillMaxWidth()
        .verticalScroll(rememberScrollState())
    if (sideBySide) {
        Row(
            modifier = frame.padding(horizontal = 32.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(40.dp, Alignment.CenterHorizontally)
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                sign()
            }
            // Beside the sign the steps read as a column of text: what follows them starts where their text does.
            Column(modifier = Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                steps()
                Column(
                    modifier = Modifier.padding(start = StepTextIndent),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    after(TextAlign.Start)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                        PluginLink()
                        add()
                    }
                }
            }
        }
    } else {
        Column(
            modifier = frame.padding(horizontal = 32.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp, Alignment.CenterVertically)
        ) {
            sign()
            steps()
            // The link goes with the text it answers, the button stands apart.
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                after(TextAlign.Center)
                PluginLink()
            }
            add()
        }
    }
}

/** Where to get the plugin, as a link in the text rather than a button: it leaves the app. */
@Composable
private fun PluginLink() {
    val text = stringResource(R.string.players_get_plugin)
    val style = TextLinkStyles(
        style = SpanStyle(color = MaterialTheme.colorScheme.primary, textDecoration = TextDecoration.Underline)
    )
    Text(
        buildAnnotatedString { withLink(LinkAnnotation.Url(PluginPage, style)) { append(text) } },
        style = MaterialTheme.typography.labelLarge
    )
}

// Where the plugin is to be had: its page in the player's catalogue of add-ons.
private const val PluginPage = "https://aimp.ru/?do=catalog&rec_id=1407"

private val StepBadge = 28.dp
private val StepGap = 14.dp

/** Where the text of a step starts, past its number. */
private val StepTextIndent = StepBadge + StepGap

@Composable
private fun SetupStep(number: Int, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(StepGap)) {
        Box(
            modifier = Modifier
                .size(StepBadge)
                .background(MaterialTheme.colorScheme.secondaryContainer, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                number.toString(),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSecondaryContainer
            )
        }
        Text(
            text,
            modifier = Modifier
                .weight(1f)
                .padding(top = 3.dp),
            style = MaterialTheme.typography.bodyLarge
        )
    }
}
