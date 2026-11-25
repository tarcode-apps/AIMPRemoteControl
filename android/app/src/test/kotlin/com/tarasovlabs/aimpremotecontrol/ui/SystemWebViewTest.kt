package com.tarasovlabs.aimpremotecontrol.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SystemWebViewTest {
    @Test
    fun takesAWebViewNewEnoughWithTheBridge() {
        for (version in listOf("111.0.5563.116", "138.0.7204.179", "142.0.7444.48", "1000")) {
            assertTrue(version, webViewUsable(version, bridged = true))
        }
    }

    @Test
    fun refusesAnOlderWebViewOrOneWithoutTheBridge() {
        for (version in listOf("110.0.5481.153", "83.0.4103.106", "", "beta", null)) {
            assertFalse(version, webViewUsable(version, bridged = true))
        }
        assertFalse(webViewUsable("142.0.7444.48", bridged = false))
    }
}
