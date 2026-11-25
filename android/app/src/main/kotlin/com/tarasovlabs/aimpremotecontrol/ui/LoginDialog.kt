package com.tarasovlabs.aimpremotecontrol.ui

import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.tarasovlabs.aimpremotecontrol.R
import kotlin.coroutines.resume
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.suspendCancellableCoroutine

/** Asks for the login of a player; [refused] tells that the one tried before was wrong. */
@Composable
fun LoginDialog(login: String, refused: Boolean, onSignIn: (login: String, password: String) -> Unit, onCancel: () -> Unit) {
    val name = rememberTextFieldState(login)
    val password = rememberTextFieldState()
    val nameFocus = remember { FocusRequester() }
    val passwordFocus = remember { FocusRequester() }
    val signIn = { onSignIn(name.text.toString(), password.text.toString()) }

    AppDialog(
        title = stringResource(R.string.auth_required),
        onDismiss = onCancel,
        actions = {
            CapsButton(stringResource(R.string.action_cancel), onClick = onCancel)
            CapsButton(stringResource(R.string.auth_sign_in), onClick = signIn)
        }
    ) {
        // The dialog opens ready for typing: at the name, or at the password when the name is known.
        // A field takes the focus only once the dialog's own window has it.
        val window = LocalWindowInfo.current
        val view = LocalView.current
        LaunchedEffect(window, view) {
            snapshotFlow { window.isWindowFocused }.first { it }
            awaitKeyboardControl(view)
            (if (login.isEmpty()) nameFocus else passwordFocus).requestFocus()
        }
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // In the accent colour, as the web client shows an error in a dialog.
            if (refused) Text(stringResource(R.string.auth_refused), color = MaterialTheme.colorScheme.primary)
            UnderlinedTextField(
                state = name,
                label = stringResource(R.string.auth_username),
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, imeAction = ImeAction.Next),
                focusRequester = nameFocus
            )
            // The keyboard's own key signs in: on a phone held sideways it hides the buttons.
            UnderlinedPasswordField(
                password,
                modifier = Modifier.fillMaxWidth(),
                imeAction = ImeAction.Done,
                onKeyboardAction = { signIn() },
                focusRequester = passwordFocus
            )
        }
    }
}

/**
 * Waits until the window of [view] controls the keyboard, which comes a moment after the window's focus.
 * Android 11 keeps a request to show the keyboard made before that as one to show it whenever the control
 * comes back: the keyboard closed by Back opened again at once, as long as the field kept the focus.
 */
private suspend fun awaitKeyboardControl(view: View) {
    if (Build.VERSION.SDK_INT != Build.VERSION_CODES.R) return
    val controller = view.windowInsetsController ?: return
    suspendCancellableCoroutine { continuation ->
        val listener = object : WindowInsetsController.OnControllableInsetsChangedListener {
            override fun onControllableInsetsChanged(controller: WindowInsetsController, types: Int) {
                if (types and WindowInsets.Type.ime() == 0) return
                controller.removeOnControllableInsetsChangedListener(this)
                continuation.resume(Unit)
            }
        }
        // Called at once with the types controlled now.
        controller.addOnControllableInsetsChangedListener(listener)
        continuation.invokeOnCancellation { controller.removeOnControllableInsetsChangedListener(listener) }
    }
}
