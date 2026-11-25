package com.tarasovlabs.aimpremotecontrol.network

import java.io.Closeable
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * A player as far as its stream of events goes: every request is answered with a stream, which the test
 * takes from [streams] and writes to, or with [status] when that is not 200.
 */
class StreamStub : Closeable {
    private val server = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
    private val opened = LinkedBlockingQueue<Stream>()

    val host: String get() = server.inetAddress.hostAddress!!
    val port: Int get() = server.localPort

    @Volatile
    var status = 200

    init {
        thread(isDaemon = true) {
            try {
                while (true) answer(server.accept())
            } catch (_: IOException) {
                // Closed.
            }
        }
    }

    /** The next stream a client opened, waited for. */
    fun stream(): Stream = opened.poll(Patience, TimeUnit.SECONDS) ?: throw AssertionError("no stream was opened")

    /** Whether a client opens a stream within [millis]. */
    fun opensWithin(millis: Long): Boolean = opened.poll(millis, TimeUnit.MILLISECONDS)?.also { it.close() } != null

    override fun close() = server.close()

    private fun answer(socket: Socket) {
        val reader = socket.getInputStream().bufferedReader()
        while (!reader.readLine().isNullOrEmpty()) Unit
        val out = socket.getOutputStream()
        if (status != 200) {
            out.write("HTTP/1.1 $status Refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            socket.close()
            return
        }
        out.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".toByteArray())
        out.flush()
        opened += Stream(socket)
    }

    class Stream(private val socket: Socket) : Closeable {
        fun send(name: String, data: String = "{}") = write("event: $name\ndata: $data\n\n")

        fun write(text: String) {
            socket.getOutputStream().apply {
                write(text.toByteArray())
                flush()
            }
        }

        /** As the player ends a stream. */
        override fun close() = socket.close()
    }

    private companion object {
        const val Patience = 10L
    }
}
