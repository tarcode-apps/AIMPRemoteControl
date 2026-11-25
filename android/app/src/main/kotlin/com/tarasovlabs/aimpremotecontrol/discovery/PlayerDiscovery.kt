package com.tarasovlabs.aimpremotecontrol.discovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.RequiresApi
import java.net.InetAddress
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** A player as its plugin announces it. The addresses and the attributes come with the resolution. */
data class DiscoveredPlayer(
    val serviceName: String,
    val addresses: List<InetAddress> = emptyList(),
    val port: Int = 0,
    val attributes: Map<String, String> = emptyMap()
) {
    /** The service name is cut and changed on its way; the plugin sends the name as it is beside it. */
    val name: String get() = attributes["name"] ?: serviceName

    /**
     * Whether this is the player reached at [host] and [port]. A host may be a name of the user's own for
     * the same address: [hostAddresses] are what it stands for.
     */
    fun isAt(host: String, port: Int, hostAddresses: Set<InetAddress>): Boolean =
        this.port == port && addresses.any { it.hostAddress == host || it in hostAddresses }
}

/** What the search knows at a moment: the players by their service names, and how the search itself goes. */
data class DiscoveryState(
    val players: Map<String, DiscoveredPlayer> = emptyMap(),
    val searching: Boolean = false,
    val failure: String? = null
)

/**
 * Finds the players that announce themselves over mDNS as [ServiceType]. Its [state] changes on the main
 * thread; [start] and [stop] are to be called there too.
 */
class PlayerDiscovery(context: Context) {
    private val context = context.applicationContext
    private val nsd = this.context.getSystemService(NsdManager::class.java)
    private val main = Handler(Looper.getMainLooper())

    private val current = MutableStateFlow(DiscoveryState())
    val state: StateFlow<DiscoveryState> = current.asStateFlow()

    private var players: Map<String, DiscoveredPlayer>
        get() = current.value.players
        set(value) = current.update { it.copy(players = value) }
    private var searching: Boolean
        get() = current.value.searching
        set(value) = current.update { it.copy(searching = value) }
    private var failure: String?
        get() = current.value.failure
        set(value) = current.update { it.copy(failure = value) }

    private var listener: NsdManager.DiscoveryListener? = null
    private val watched = HashMap<String, NsdManager.ServiceInfoCallback>()
    private val toResolve = ArrayDeque<NsdServiceInfo>()
    private var resolving = false

    fun start() {
        if (listener != null) return
        failure = null
        val started = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) = onMain { searching = true }
            override fun onDiscoveryStopped(serviceType: String) = onMain { searching = false }
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) =
                onMain { failed("The search did not start: error $errorCode") }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
            override fun onServiceFound(serviceInfo: NsdServiceInfo) = onMain { found(serviceInfo) }
            override fun onServiceLost(serviceInfo: NsdServiceInfo) = onMain { lost(serviceInfo.serviceName) }

            // A listener stopped and started again would hear what was meant for its former self.
            private fun onMain(action: () -> Unit) {
                main.post { if (listener === this) action() }
            }
        }
        listener = started
        try {
            nsd.discoverServices(ServiceType, NsdManager.PROTOCOL_DNS_SD, started)
        } catch (e: RuntimeException) {
            failed("The search did not start: $e")
        }
    }

    fun stop() {
        val stopped = listener ?: return
        listener = null
        searching = false
        try {
            nsd.stopServiceDiscovery(stopped)
        } catch (_: IllegalArgumentException) {
            // The system never took the listener: the search had failed to start.
        }
        if (Build.VERSION.SDK_INT >= 34) {
            watched.values.forEach(::unwatch)
        }
        watched.clear()
        toResolve.clear()
        players = emptyMap()
    }

    private fun failed(text: String) {
        failure = text
        listener = null
        searching = false
    }

    private fun found(info: NsdServiceInfo) {
        val name = info.serviceName
        if (players[name] == null) players = players + (name to DiscoveredPlayer(name))
        if (Build.VERSION.SDK_INT >= 34) {
            watch(info)
        } else {
            toResolve.addLast(info)
            resolveNext()
        }
    }

    private fun lost(name: String) {
        players = players - name
        if (Build.VERSION.SDK_INT >= 34) {
            watched.remove(name)?.let(::unwatch)
        }
    }

    @RequiresApi(34)
    private fun watch(info: NsdServiceInfo) {
        val name = info.serviceName
        if (watched.containsKey(name)) return
        val callback = object : NsdManager.ServiceInfoCallback {
            override fun onServiceInfoCallbackRegistrationFailed(errorCode: Int) {
                Log.w(Tag, "No address of $name: error $errorCode")
            }

            override fun onServiceUpdated(serviceInfo: NsdServiceInfo) = update {
                describe(serviceInfo, serviceInfo.hostAddresses)
            }

            override fun onServiceLost() = update { it.copy(addresses = emptyList()) }
            override fun onServiceInfoCallbackUnregistered() = Unit

            private fun update(change: (DiscoveredPlayer) -> DiscoveredPlayer) {
                if (watched[name] === this) players[name]?.let { players = players + (name to change(it)) }
            }
        }
        watched[name] = callback
        // On the main thread, as the rest of the state is.
        nsd.registerServiceInfoCallback(info, context.mainExecutor, callback)
    }

    @RequiresApi(34)
    private fun unwatch(callback: NsdManager.ServiceInfoCallback) {
        try {
            nsd.unregisterServiceInfoCallback(callback)
        } catch (_: IllegalArgumentException) {
            // Its registration had failed.
        }
    }

    // Before Android 14 the system resolves one service at a time and refuses a second request meanwhile.
    private fun resolveNext() {
        if (resolving) return
        val info = toResolve.removeFirstOrNull() ?: return
        val name = info.serviceName
        val asked = listener
        resolving = true
        val resolved = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.w(Tag, "No address of $name: error $errorCode")
                finish { it }
            }

            @Suppress("DEPRECATION")
            override fun onServiceResolved(serviceInfo: NsdServiceInfo) = finish {
                describe(serviceInfo, listOfNotNull(serviceInfo.host))
            }

            private fun finish(change: (DiscoveredPlayer) -> DiscoveredPlayer) {
                main.post {
                    resolving = false
                    if (listener === asked) players[name]?.let { players = players + (name to change(it)) }
                    resolveNext()
                }
            }
        }
        @Suppress("DEPRECATION")
        nsd.resolveService(info, resolved)
    }

    private fun describe(info: NsdServiceInfo, addresses: List<InetAddress>): DiscoveredPlayer {
        return DiscoveredPlayer(
            serviceName = info.serviceName,
            addresses = addresses,
            port = info.port,
            attributes = info.attributes.mapValues { it.value?.toString(Charsets.UTF_8).orEmpty() }
        )
    }

    companion object {
        private const val Tag = "PlayerDiscovery"
        const val ServiceType = "_aimp-remote._tcp"
    }
}
