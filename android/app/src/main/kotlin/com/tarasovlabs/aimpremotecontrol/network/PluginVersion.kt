package com.tarasovlabs.aimpremotecontrol.network

/**
 * The header of every answer of the plugin, a refusal for want of a login too, with its version: `3.0.0.0`.
 * The plugins before 3.0 send none.
 */
internal const val PluginVersionHeader = "AIMP-Remote-Control-Version"

/**
 * The oldest plugin the app works with, as the user is told of it: the web client that comes with an older
 * one reaches the player by itself, with a login the web view does not give it.
 */
const val MinPluginVersion = "3.0"

/**
 * Whether a plugin of [version], as its answers and its announcement name it, is one the app works with. A
 * plugin that names no version is too old to.
 */
fun pluginSupported(version: String?): Boolean {
    val numbers = version?.split('.')?.map { it.toIntOrNull() ?: return false } ?: return false
    for ((index, least) in MinPluginVersion.split('.').map(String::toInt).withIndex()) {
        val number = numbers.getOrElse(index) { 0 }
        if (number != least) return number > least
    }
    return true
}
