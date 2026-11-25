package com.tarasovlabs.aimpremotecontrol.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DigestAuthTest {
    // The example of RFC 2617, section 3.5.
    private val challenge = DigestAuth.challenge(
        "Digest realm=\"testrealm@host.com\", qop=\"auth\", algorithm=MD5, " +
            "nonce=\"dcd98b7102dd2f0e8b11d0f600bfb0c093\", opaque=\"5ccc069c403ebaf9f0171e9517f40e41\""
    )!!

    @Test
    fun signsAsTheRfcExample() {
        val auth = DigestAuth("Mufasa", "Circle Of Life", cnonce = "0a4f113b")
        val header = auth.authorization("GET", "/dir/index.html", challenge)

        assertTrue(header, header.contains("response=\"6629fae49393a05397450978507c4ef1\""))
        assertTrue(header, header.contains("nc=00000001"))
        assertTrue(header, header.contains("opaque=\"5ccc069c403ebaf9f0171e9517f40e41\""))
    }

    @Test
    fun countsTheRequests() {
        val auth = DigestAuth("Mufasa", "Circle Of Life", cnonce = "0a4f113b")
        auth.authorization("GET", "/", challenge)

        assertTrue(auth.authorization("GET", "/", challenge).contains("nc=00000002"))
    }

    @Test
    fun readsThePluginsChallenge() {
        val fresh = DigestAuth.challenge("Digest realm=\"AIMP\", qop=\"auth\", algorithm=MD5, nonce=\"abc\"")
        val stale = DigestAuth.challenge("Digest realm=\"AIMP\", qop=\"auth\", algorithm=MD5, nonce=\"abc\", stale=true")

        assertNotNull(fresh)
        assertEquals("AIMP", fresh!!.realm)
        assertEquals("abc", fresh.nonce)
        assertNull(fresh.opaque)
        assertFalse(fresh.stale)
        assertTrue(stale!!.stale)
    }

    @Test
    fun quotesWhatEndsAQuotedString() {
        val header = DigestAuth("a\"b\\c", "x").authorization("GET", "/", challenge)

        assertTrue(header, header.startsWith("Digest username=\"a\\\"b\\\\c\", "))
    }

    @Test
    fun readsQuotedPairs() {
        val challenge = DigestAuth.challenge("Digest realm=\"a\\\"b, c\\\\\", nonce=\"n\"")

        assertEquals("a\"b, c\\", challenge!!.realm)
        assertEquals("n", challenge.nonce)
    }

    @Test
    fun refusesWhatIsNotDigest() {
        assertNull(DigestAuth.challenge("Basic realm=\"AIMP\""))
        assertNull(DigestAuth.challenge("Digest realm=\"AIMP\""))
    }
}
