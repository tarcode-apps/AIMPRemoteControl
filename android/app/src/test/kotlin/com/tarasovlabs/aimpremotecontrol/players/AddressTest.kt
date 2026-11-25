package com.tarasovlabs.aimpremotecontrol.players

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AddressTest {
    @Test
    fun readsAHost() {
        assertEquals(ParsedAddress("192.168.0.5", null), parseAddress("192.168.0.5"))
        assertEquals(ParsedAddress("home-pc.local", null), parseAddress("  home-pc.local "))
        assertEquals(ParsedAddress("fe80::1", null), parseAddress("fe80::1"))
    }

    @Test
    fun readsAHostWithAPort() {
        assertEquals(ParsedAddress("192.168.0.5", 3333), parseAddress("192.168.0.5:3333"))
        assertEquals(ParsedAddress("fe80::1", 8080), parseAddress("[fe80::1]:8080"))
        assertEquals(ParsedAddress("::1", null), parseAddress("[::1]"))
    }

    @Test
    fun readsALink() {
        assertEquals(ParsedAddress("pc.local", 3333), parseAddress("http://pc.local:3333/"))
        assertEquals(ParsedAddress("192.168.0.5", 3334), parseAddress("http://192.168.0.5:3334/playlist/?id=1#top"))
        assertEquals(ParsedAddress("pc.local", null), parseAddress("HTTP://pc.local"))
        assertEquals(ParsedAddress("fe80::1", 3333), parseAddress("http://[fe80::1]:3333/"))
    }

    @Test
    fun refusesWhatIsNotAnAddress() {
        assertNull(parseAddress(""))
        assertNull(parseAddress("http://"))
        assertNull(parseAddress("my pc"))
        assertNull(parseAddress("pc.local:"))
        assertNull(parseAddress("pc.local:port"))
        assertNull(parseAddress("pc.local:+80"))
        assertNull(parseAddress("pc.local:0"))
        assertNull(parseAddress("pc.local:65536"))
        assertNull(parseAddress("[fe80::1"))
        assertNull(parseAddress("[fe80::1]3333"))
        assertNull(parseAddress("user@pc.local"))
    }

    @Test
    fun tellsAHostFromWhatHasMoreAroundIt() {
        assertTrue(isHost("192.168.0.5"))
        assertTrue(isHost("музыка.local"))
        assertTrue(isHost("fe80::1"))
        assertFalse(isHost(""))
        assertFalse(isHost("192.168.0.5:3333"))
        assertFalse(isHost("http://pc.local"))
        assertFalse(isHost("[fe80::1]"))
        assertFalse(isHost("pc.local/"))
    }

    @Test
    fun tellsAPasteFromAKey() {
        assertTrue(isPasted("", "http://pc.local:3333/"))
        assertTrue(isPasted("192.168.0.5", "10.0.0.2:3333"))
        assertTrue(isPasted("192.168.", "192.168.0.5:3333"))
        assertFalse(isPasted("192.168.0.5:333", "192.168.0.5:3333"))
        assertFalse(isPasted("192.168.0.5:3333", "192.168.0.5:333"))
        assertFalse(isPasted("192.168.0.5:3333", "192.3333"))
        assertFalse(isPasted("pc", "pc"))
        assertFalse(isPasted("aa", "aaa"))
    }
}
