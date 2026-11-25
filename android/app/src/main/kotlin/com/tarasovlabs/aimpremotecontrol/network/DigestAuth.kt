package com.tarasovlabs.aimpremotecontrol.network

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicInteger

/**
 * Digest authentication as the plugin takes it: MD5 with qop=auth. Signs the requests of one login; whoever
 * sends them hands over the server's challenge.
 */
class DigestAuth(
    private val login: String,
    private val password: String,
    private val cnonce: String = ByteArray(8).also(SecureRandom()::nextBytes).toHexString()
) {
    class Challenge(val realm: String, val nonce: String, val opaque: String?, val stale: Boolean)

    // The server refuses a count it has seen with this nonce and cnonce, in whatever order they come.
    private val count = AtomicInteger()

    /** The `Authorization` header for a request; [uri] is the path with its query, as it goes on the wire. */
    fun authorization(method: String, uri: String, challenge: Challenge): String {
        // Eight digits, as the count is written.
        val nc = count.incrementAndGet().toHexString()
        val ha1 = md5("$login:${challenge.realm}:$password")
        val ha2 = md5("$method:$uri")
        val response = md5("$ha1:${challenge.nonce}:$nc:$cnonce:auth:$ha2")
        return buildString {
            append("Digest username=${quoted(login)}, realm=${quoted(challenge.realm)}, ")
            append("nonce=${quoted(challenge.nonce)}, uri=${quoted(uri)}, ")
            append("algorithm=MD5, qop=auth, nc=$nc, cnonce=\"$cnonce\", response=\"$response\"")
            if (challenge.opaque != null) append(", opaque=${quoted(challenge.opaque)}")
        }
    }

    companion object {
        // A value is a token or a quoted-string, in which a backslash takes the next character as it is.
        private val Field = Regex("""(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]*))""")
        private val QuotedPair = Regex("""\\(.)""")
        private val ToQuote = Regex("""[\\"]""")

        /** Reads a `WWW-Authenticate` header; null when it is not a Digest challenge. */
        fun challenge(header: String): Challenge? {
            if (!header.startsWith("Digest ", ignoreCase = true)) return null
            val fields = Field.findAll(header.substring(7)).associate { field ->
                val quoted = field.groups[2]
                field.groupValues[1].lowercase() to
                    (quoted?.value?.replace(QuotedPair, "$1") ?: field.groupValues[3])
            }
            return Challenge(
                realm = fields["realm"] ?: return null,
                nonce = fields["nonce"] ?: return null,
                opaque = fields["opaque"],
                stale = fields["stale"].equals("true", ignoreCase = true)
            )
        }

        private fun quoted(value: String) = "\"" + value.replace(ToQuote, "\\\\$0") + "\""

        private fun md5(text: String) = MessageDigest.getInstance("MD5").digest(text.toByteArray()).toHexString()
    }
}
