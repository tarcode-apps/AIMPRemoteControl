package com.tarasovlabs.aimpremotecontrol.players

/** What an address stands for; [port] is null where the text names none. */
data class ParsedAddress(val host: String, val port: Int?)

private val Scheme = Regex("^[A-Za-z][A-Za-z0-9+.-]*://")

/**
 * Reads a host, or a link to a player as it is copied from a browser or from the plugin's settings:
 * `192.168.0.5:3333`, `http://pc.local:3333/`, `[fe80::1]:3333`. Null when the text is neither.
 */
fun parseAddress(text: String): ParsedAddress? {
    val authority = text.trim().replace(Scheme, "").substringBefore('/').substringBefore('?').substringBefore('#')
    val host: String
    val port: String?
    if (authority.startsWith('[')) {
        // An IPv6 address is in brackets wherever a port may follow it.
        val end = authority.indexOf(']')
        if (end < 0) return null
        host = authority.substring(1, end)
        val rest = authority.substring(end + 1)
        port = if (rest.isEmpty()) null else if (rest.startsWith(':')) rest.substring(1) else return null
    } else if (authority.count { it == ':' } == 1) {
        host = authority.substringBefore(':')
        port = authority.substringAfter(':')
    } else {
        host = authority
        port = null
    }
    if (!isHost(host)) return null
    if (port == null) return ParsedAddress(host, null)
    val number = port.takeIf { it.all(Char::isDigit) }?.toIntOrNull()?.takeIf { it in Player.Ports } ?: return null
    return ParsedAddress(host, number)
}

/** Whether the text is a host as [Player.host] keeps it: a name or an address, and nothing around it. */
fun isHost(text: String): Boolean = when {
    text.isEmpty() -> false
    // An IPv6 address has two colons at the least; one is a port after a host.
    ':' in text -> text.count { it == ':' } > 1 && text.all { it in "0123456789abcdefABCDEF:." }
    else -> text.all { it.isLetterOrDigit() || it in "-._" }
}

/**
 * Whether a field's text was changed by more than a key: [after] is neither [before] with one character
 * added nor [before] with a part taken away. This is how a paste looks.
 */
fun isPasted(before: CharSequence, after: CharSequence): Boolean {
    var prefix = 0
    while (prefix < before.length && prefix < after.length && before[prefix] == after[prefix]) prefix++
    var suffix = 0
    while (
        suffix < before.length - prefix && suffix < after.length - prefix &&
        before[before.length - 1 - suffix] == after[after.length - 1 - suffix]
    ) {
        suffix++
    }
    return after.length - prefix - suffix > 1
}
