package com.tarasovlabs.aimpremotecontrol

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.tarasovlabs.aimpremotecontrol.ui.AppRoot
import com.tarasovlabs.aimpremotecontrol.ui.theme.AimpRemoteControlTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AimpRemoteControlTheme {
                AppRoot()
            }
        }
    }
}
