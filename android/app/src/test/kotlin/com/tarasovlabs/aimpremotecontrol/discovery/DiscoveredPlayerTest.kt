package com.tarasovlabs.aimpremotecontrol.discovery

import java.net.InetAddress
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DiscoveredPlayerTest {
    private fun address(vararg bytes: Int) = InetAddress.getByAddress(ByteArray(bytes.size) { bytes[it].toByte() })

    private val found = DiscoveredPlayer(
        serviceName = "home pc",
        addresses = listOf(address(192, 168, 10, 240)),
        port = 3333
    )

    @Test
    fun isThePlayerKeptByItsAddress() {
        assertTrue(found.isAt("192.168.10.240", 3333, emptySet()))
    }

    @Test
    fun isThePlayerKeptByANameOfTheSameAddress() {
        assertTrue(found.isAt("music.home", 3333, setOf(address(192, 168, 10, 240))))
    }

    @Test
    fun isNotAPlayerAtAnotherAddress() {
        assertFalse(found.isAt("192.168.10.4", 3333, emptySet()))
        assertFalse(found.isAt("music.home", 3333, setOf(address(192, 168, 10, 4))))
    }

    @Test
    fun isNotAPlayerOnAnotherPort() {
        assertFalse(found.isAt("192.168.10.240", 3334, emptySet()))
    }
}
