package com.tarasovlabs.aimpremotecontrol.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicSecureTextField
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.InputTransformation
import androidx.compose.foundation.text.input.KeyboardActionHandler
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.TextObfuscationMode
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.lerp
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tarasovlabs.aimpremotecontrol.R
import kotlin.math.roundToInt

// Fields as the player's own dialogs draw them: no box, the text right on a line that thickens and lights up
// while the field has the focus. The label stands where the text goes while the field is empty and out of focus,
// and small above the text otherwise.

/** A field of one line. Its [placeholder] shows only in focus: out of it, an empty field holds its label. */
@Composable
fun UnderlinedTextField(
    state: TextFieldState,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    error: String? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    inputTransformation: InputTransformation? = null,
    onKeyboardAction: KeyboardActionHandler? = null,
    focusRequester: FocusRequester? = null
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()

    FieldFrame(error, focused, modifier) {
        BasicTextField(
            state = state,
            modifier = Modifier.fieldInput(label, focusRequester, error),
            textStyle = fieldTextStyle(),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions = keyboardOptions,
            onKeyboardAction = onKeyboardAction,
            inputTransformation = inputTransformation,
            lineLimits = TextFieldLineLimits.SingleLine,
            interactionSource = interaction,
            decorator = { field ->
                FieldDecoration(
                    label = label,
                    focused = focused,
                    empty = state.text.isEmpty(),
                    placeholder = placeholder,
                    isError = error != null,
                    field = field
                )
            }
        )
    }
}

/** A password, hidden but for a button that shows it. */
@Composable
fun UnderlinedPasswordField(
    state: TextFieldState,
    modifier: Modifier = Modifier,
    imeAction: ImeAction = ImeAction.Unspecified,
    onKeyboardAction: KeyboardActionHandler? = null,
    focusRequester: FocusRequester? = null
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    var shown by remember { mutableStateOf(false) }

    val passwordLabel = stringResource(R.string.auth_password)

    FieldFrame(error = null, focused = focused, modifier = modifier) {
        BasicSecureTextField(
            state = state,
            modifier = Modifier.fieldInput(passwordLabel, focusRequester),
            textStyle = fieldTextStyle(),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions = KeyboardOptions(
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Password,
                imeAction = imeAction
            ),
            onKeyboardAction = onKeyboardAction,
            textObfuscationMode = if (shown) TextObfuscationMode.Visible else TextObfuscationMode.RevealLastTyped,
            interactionSource = interaction,
            decorator = { field ->
                FieldDecoration(
                    label = passwordLabel,
                    focused = focused,
                    empty = state.text.isEmpty(),
                    placeholder = null,
                    isError = false,
                    trailing = {
                        // As tall as the text, so that the field keeps its height; the touch reaches past it.
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .clickable(
                                    interactionSource = null,
                                    indication = ripple(bounded = false, radius = 20.dp),
                                    role = Role.Button
                                ) { shown = !shown },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                painterResource(if (shown) R.drawable.ic_visibility_off else R.drawable.ic_visibility),
                                contentDescription = stringResource(
                                    if (shown) R.string.auth_hide_password else R.string.auth_show_password
                                ),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    },
                    field = field
                )
            }
        )
    }
}

// Of the size of the other labels on the screen; the line is as tall as AIMP's: its selection covers 24 dp,
// most of the room above the letters.
@Composable
private fun fieldTextStyle(): TextStyle =
    MaterialTheme.typography.bodyLarge.copy(
        lineHeight = 24.sp,
        lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Proportional, LineHeightStyle.Trim.None),
        color = MaterialTheme.colorScheme.onSurface
    )

/** The input itself: the label and the error are drawn for the eye, and read out from here. */
private fun Modifier.fieldInput(label: String, focusRequester: FocusRequester?, errorText: String? = null) =
    fillMaxWidth()
        .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
        .semantics {
            contentDescription = label
            if (errorText != null) error(errorText)
        }

private val RaisedLabelSize = 12.sp
private val RaisedLabelLine = 16.sp
private val RaisedLabelGap = 4.dp

@Composable
private fun FieldFrame(error: String?, focused: Boolean, modifier: Modifier, field: @Composable () -> Unit) {
    val colors = MaterialTheme.colorScheme
    // An input out of focus keeps the size of its letters when the system's font size changes and the activity
    // takes the change itself (seen with Compose 1.13), so it is built anew. A focused one lays its text out again
    // by itself, and building it anew would take the focus and the keyboard away.
    val fontScale = LocalDensity.current.fontScale
    val scaleAtFocus = remember(focused) { fontScale }
    Column(modifier = modifier) {
        CompositionLocalProvider(
            LocalTextSelectionColors provides TextSelectionColors(colors.primary, colors.primary.copy(alpha = 0.35f))
        ) {
            key(if (focused) scaleAtFocus else fontScale) { field() }
        }
        if (error != null) {
            Text(
                error,
                modifier = Modifier
                    .padding(top = 4.dp)
                    .clearAndSetSemantics { },
                style = MaterialTheme.typography.bodySmall,
                color = colors.error
            )
        }
    }
}

/** What the field draws around its text; a tap anywhere in it goes to the field. */
@Composable
private fun FieldDecoration(
    label: String,
    focused: Boolean,
    empty: Boolean,
    placeholder: String?,
    isError: Boolean,
    trailing: (@Composable () -> Unit)? = null,
    field: @Composable () -> Unit
) {
    val colors = MaterialTheme.colorScheme
    val textStyle = fieldTextStyle()
    val line = when {
        isError -> colors.error
        focused -> colors.primary
        // Not the divider's colour, which is lost on a dialog: a line that marks a field has to be seen.
        else -> colors.outline
    }
    // In sp, as the label is: with large letters the room grows with it.
    val labelRoom = with(LocalDensity.current) { RaisedLabelLine.toDp() } + RaisedLabelGap

    Column {
        Box {
            Row(
                modifier = Modifier.padding(top = labelRoom, bottom = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    if (empty && focused && placeholder != null) {
                        Text(
                            placeholder,
                            style = textStyle,
                            color = colors.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    field()
                }
                trailing?.invoke()
            }
            FieldLabel(label, raised = focused || !empty, focused = focused, textStyle = textStyle, room = labelRoom)
        }
        // The room of the thick line is always kept: the text does not move when the field takes the focus.
        Box(modifier = Modifier.fillMaxWidth().height(2.dp)) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .height(if (focused || isError) 2.dp else 1.dp)
                    .background(line)
            )
        }
    }
}

/**
 * The label of a field: where the text goes, or [raised] by [room] and small. It moves between the two by itself,
 * so that a frame of the move composes the label alone.
 */
@Composable
private fun FieldLabel(text: String, raised: Boolean, focused: Boolean, textStyle: TextStyle, room: Dp) {
    val colors = MaterialTheme.colorScheme
    val raisedStyle = textStyle.copy(fontSize = RaisedLabelSize, lineHeight = RaisedLabelLine)
    val progress by animateFloatAsState(if (raised) 1f else 0f)
    val color by animateColorAsState(if (focused) colors.primary else colors.onSurfaceVariant)
    Text(
        text,
        modifier = Modifier
            .offset { IntOffset(0, (room.toPx() * (1 - progress)).roundToInt()) }
            .clearAndSetSemantics { },
        style = lerp(textStyle, raisedStyle, progress),
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
    )
}
