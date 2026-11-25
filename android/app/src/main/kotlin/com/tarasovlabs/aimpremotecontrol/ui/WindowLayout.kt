package com.tarasovlabs.aimpremotecontrol.ui

import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * The room a window gives, by the breakpoints of the window size classes. A phone on its side is [wide]
 * and [low]; a tablet is wide and not low.
 */
class WindowLayout(
    /** There is room for two columns. */
    val wide: Boolean,
    /** Every row counts: the title row is kept small and nothing floats over the content. */
    val low: Boolean
)

// The lower bounds of the medium width and height classes.
private val MediumWidth = 600.dp
private val MediumHeight = 480.dp

/**
 * Read from the size the window has been laid out with. The activity outlives a turn of the screen, and the
 * window metrics asked for at the change of configuration may still be the old ones: the layout stayed that
 * of the other orientation.
 */
@Composable
fun rememberWindowLayout(): WindowLayout {
    val size = LocalWindowInfo.current.containerSize
    return with(LocalDensity.current) {
        WindowLayout(wide = size.width.toDp() >= MediumWidth, low = size.height.toDp() < MediumHeight)
    }
}

/**
 * What a screen keeps its content clear of: the system's bars, a camera's cutout, the keyboard. The content
 * has a margin of its own at the sides, and an inset there stands in for that margin instead of adding to it:
 * on its side a phone would otherwise lose a strip beside the cutout twice.
 */
val screenInsets: WindowInsets
    @Composable get() = WindowInsets.safeDrawing.exclude(WindowInsets(left = ScreenMargin, right = ScreenMargin))

/** The margin between a screen's content and its sides. */
val ScreenMargin = 16.dp

// As high as a button is drawn; a finger's 48 dp reach past it, which the row's neighbours leave free.
private val LowBarHeight = 40.dp

/** The title row of a screen: as small as its buttons allow in a [low] window, [large] on the first screen. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenTopBar(
    title: String,
    low: Boolean,
    large: Boolean = false,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {}
) {
    val typography = MaterialTheme.typography
    TopAppBar(
        title = {
            Text(
                title,
                style = when {
                    low -> typography.titleMedium
                    large -> typography.headlineMedium
                    else -> typography.titleLarge
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        navigationIcon = navigationIcon,
        actions = actions,
        expandedHeight = if (low) LowBarHeight else TopAppBarDefaults.TopAppBarExpandedHeight,
        windowInsets = screenInsets.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)
    )
}
