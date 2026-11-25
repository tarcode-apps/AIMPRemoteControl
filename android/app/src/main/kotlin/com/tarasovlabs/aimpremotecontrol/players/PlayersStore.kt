package com.tarasovlabs.aimpremotecontrol.players

import android.content.Context
import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.Serializer
import androidx.datastore.dataStoreFile
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

/**
 * The players the user keeps, in files of the app.
 *
 * The passwords are in a file of their own, by the id of the player: a backup of the app takes them only
 * where nobody but the user can read the copy, and before Android 12 it can take the list without them.
 * The rules are in `res/xml/data_extraction_rules.xml` and `backup_rules.xml`, which name both files.
 */
class PlayersStore(context: Context) {
    private val list = DataStoreFactory.create(JsonSerializer<List<Player>>(emptyList(), serializer())) {
        context.dataStoreFile("players.json")
    }
    private val passwords = DataStoreFactory.create(JsonSerializer<Map<String, String>>(emptyMap(), serializer())) {
        context.dataStoreFile("passwords.json")
    }

    val players: Flow<List<Player>> = list.data.combine(passwords.data) { saved, secrets ->
        saved.map { it.copy(password = secrets[it.id].orEmpty()) }
    }

    /** Adds the player, or replaces the one with its id. */
    suspend fun save(player: Player) {
        passwords.updateData { secrets ->
            if (player.password.isEmpty()) secrets - player.id else secrets + (player.id to player.password)
        }
        list.updateData { saved ->
            val others = if (player.autoConnect) saved.map { it.copy(autoConnect = false) } else saved
            if (others.any { it.id == player.id }) {
                others.map { if (it.id == player.id) player else it }
            } else {
                others + player
            }
        }
    }

    suspend fun remove(id: String) {
        list.updateData { saved -> saved.filter { it.id != id } }
        passwords.updateData { secrets -> secrets - id }
    }
}

private class JsonSerializer<T>(override val defaultValue: T, private val serializer: KSerializer<T>) : Serializer<T> {
    override suspend fun readFrom(input: InputStream): T =
        try {
            Json.decodeFromString(serializer, input.readBytes().decodeToString())
        } catch (e: SerializationException) {
            throw CorruptionException("The file cannot be read", e)
        }

    override suspend fun writeTo(t: T, output: OutputStream) {
        output.write(Json.encodeToString(serializer, t).encodeToByteArray())
    }
}
