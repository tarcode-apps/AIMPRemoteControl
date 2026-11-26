package com.tarasovlabs.aimpremotecontrol

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import com.tarasovlabs.aimpremotecontrol.ui.AppRoot
import com.tarasovlabs.aimpremotecontrol.ui.theme.AimpRemoteControlTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AimpRemoteControlTheme {
                AppRoot()
            }
        }
        // Out of sight as well. The app stays among the recent ones, as after Back, and starts anew from there.
        lifecycleScope.launch { (application as App).closing.collect { finish() } }
    }
}
