package com.tarasovlabs.aimpremotecontrol.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// The colours of the web client (web-client/app/_styles/_colors.scss), so that the app and the client it
// shows look as one. The text on the orange is dark: white on it is too faint to read.

private val Orange = Color(0xFFF98E00)
private val OnOrange = Color(0xFF2A1800)

private val DarkColors = darkColorScheme(
    primary = Orange,
    onPrimary = OnOrange,
    primaryContainer = Orange,
    onPrimaryContainer = OnOrange,
    inversePrimary = Color(0xFF8F5000),
    secondary = Color(0xFFFFB74D),
    onSecondary = OnOrange,
    secondaryContainer = Color(0xFF3F2D17),
    onSecondaryContainer = Color(0xFFFFB74D),
    tertiary = Color(0xFFFFB74D),
    onTertiary = OnOrange,
    tertiaryContainer = Color(0xFF3F2D17),
    onTertiaryContainer = Color(0xFFFFB74D),
    background = Color(0xFF202125),
    onBackground = Color(0xFFF0F0F0),
    surface = Color(0xFF202125),
    onSurface = Color(0xFFF0F0F0),
    surfaceVariant = Color(0xFF35363A),
    onSurfaceVariant = Color(0xFF9E9EA0),
    surfaceTint = Orange,
    inverseSurface = Color(0xFFE9E9E9),
    inverseOnSurface = Color(0xFF202124),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF3B2625),
    onErrorContainer = Color(0xFFFFB4AB),
    outline = Color(0xFF77787B),
    outlineVariant = Color(0xFF3A3B3F),
    surfaceBright = Color(0xFF404145),
    surfaceDim = Color(0xFF202125),
    surfaceContainerLowest = Color(0xFF1B1C1F),
    surfaceContainerLow = Color(0xFF26272B),
    surfaceContainer = Color(0xFF2B2C31),
    surfaceContainerHigh = Color(0xFF35363A),
    surfaceContainerHighest = Color(0xFF404145)
)

private val LightColors = lightColorScheme(
    // Darker than the orange: this one is also the colour of text on the light background.
    primary = Color(0xFF8F5000),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFFB8D00),
    onPrimaryContainer = OnOrange,
    inversePrimary = Color(0xFFFFB74D),
    secondary = Color(0xFF8F5000),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFEED4B3),
    onSecondaryContainer = Color(0xFF5E3500),
    tertiary = Color(0xFF8F5000),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFEED4B3),
    onTertiaryContainer = Color(0xFF5E3500),
    background = Color(0xFFFFFFFF),
    onBackground = Color(0xFF3C4043),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF3C4043),
    surfaceVariant = Color(0xFFE1E3E2),
    onSurfaceVariant = Color(0xFF5F6368),
    surfaceTint = Color(0xFF8F5000),
    inverseSurface = Color(0xFF3C4043),
    inverseOnSurface = Color(0xFFF1F3F4),
    error = Color(0xFFB3261E),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFF9DEDC),
    onErrorContainer = Color(0xFF8C1D18),
    outline = Color(0xFF80868B),
    outlineVariant = Color(0xFFDADCE0),
    surfaceBright = Color(0xFFFFFFFF),
    surfaceDim = Color(0xFFE1E3E2),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF6F7F8),
    surfaceContainer = Color(0xFFF1F3F4),
    surfaceContainerHigh = Color(0xFFE9EBEC),
    surfaceContainerHighest = Color(0xFFE1E3E2)
)

/** Colours of the web client that the Material scheme has no role for. */
@Immutable
class ExtraColors(
    /** The background of a dialog, a shade apart from the page as the player's Android app draws it. */
    val dialog: Color
)

private val DarkExtraColors = ExtraColors(dialog = Color(0xFF2B2C31))
private val LightExtraColors = ExtraColors(dialog = Color(0xFFE1E3E2))

val LocalExtraColors = staticCompositionLocalOf { DarkExtraColors }

@Composable
fun AimpRemoteControlTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalExtraColors provides if (darkTheme) DarkExtraColors else LightExtraColors) {
        MaterialTheme(colorScheme = if (darkTheme) DarkColors else LightColors, content = content)
    }
}
