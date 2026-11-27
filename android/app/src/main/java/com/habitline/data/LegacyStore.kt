package com.habitline.data

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonArray
import com.google.gson.JsonNull
import com.google.gson.JsonPrimitive
import com.google.gson.Strictness
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import java.io.StringReader
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** A failed decode must abort the Room transaction, including the first-run marker. */
object LegacyStore {
    fun decode(raw: String): HabitStore {
        val tree = JsonReader(StringReader(raw)).use { reader ->
            reader.strictness = Strictness.STRICT
            val root = readValue(reader, 0)
            require(reader.peek() == JsonToken.END_DOCUMENT) { "Trailing data in legacy store" }
            root.asJsonObject
        }
        require(tree.keySet() == setOf("habits", "completions", "widgetHabitMap")) { "Unrecognized legacy store layout" }
        fun records(key: String) = tree.get(key)?.takeIf { it.isJsonArray }?.asJsonArray
            ?: error("Missing legacy collection: " + key)
        val habits = records("habits").map { row ->
            val item = row.asJsonObject
            val id = item.string("id")
            require(UUID.fromString(id).toString().equals(id, ignoreCase = true)) { "Invalid habit UUID" }
            val days = item.getAsJsonArray("weeklyDays").map { it.integer() }
            require(days.all { it in 0..6 } && days.distinct().size == days.size) { "Invalid weekdays" }
            val name = item.string("name")
            val frequency = item.string("frequencyType")
            val points = item.get("points").integer()
            val timestamp = item.get("createdAt")
            require(timestamp.isJsonPrimitive && timestamp.asJsonPrimitive.isNumber)
            val created = timestamp.asBigDecimal.longValueExact()
            require(name.isNotBlank() && frequency in setOf("daily", "weekly") && points >= 0)
            Instant.ofEpochMilli(created)
            Habit(id, name, item.string("icon"), points, frequency, days, created)
        }
        val ids = habits.map { it.id }.toSet()
        require(ids.map { it.lowercase() }.distinct().size == habits.size) { "Duplicate legacy habit IDs" }
        val completions = records("completions").map { row ->
            val item = row.asJsonObject
            val day = item.string("date")
            require(day.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")) && LocalDate.parse(day).toString() == day)
            val id = item.string("habitId")
            require(id in ids) { "Completion references an unknown habit" }
            Completion(id, day)
        }.distinct()
        val bindings = tree.getAsJsonObject("widgetHabitMap").entrySet().associate { (key, value) ->
            require(key.toIntOrNull()?.let { it > 0 && it.toString() == key } == true) { "Invalid widget ID" }
            require(value.isJsonPrimitive && value.asJsonPrimitive.isString && value.asString in ids) {
                "Widget references an unknown habit"
            }
            key to value.asString
        }
        return HabitStore(habits.toMutableList(), completions.toMutableList(), bindings.toMutableMap())
    }

    private fun JsonObject.string(key: String): String = get(key)?.takeIf {
        it.isJsonPrimitive && it.asJsonPrimitive.isString
    }?.asString ?: error("Invalid legacy field: " + key)

    private fun JsonElement.integer(): Int {
        require(isJsonPrimitive && asJsonPrimitive.isNumber) { "Expected a number" }
        return asBigDecimal.intValueExact()
    }

    private fun readValue(reader: JsonReader, depth: Int): JsonElement {
        require(depth <= 32) { "Invalid legacy nesting" }
        return when (reader.peek()) {
            JsonToken.BEGIN_OBJECT -> JsonObject().apply {
                reader.beginObject()
                while (reader.hasNext()) {
                    val key = reader.nextName()
                    require(!has(key)) { "Duplicate legacy field" }
                    add(key, readValue(reader, depth + 1))
                }
                reader.endObject()
            }
            JsonToken.BEGIN_ARRAY -> JsonArray().apply {
                reader.beginArray()
                while (reader.hasNext()) add(readValue(reader, depth + 1))
                reader.endArray()
            }
            JsonToken.STRING -> JsonPrimitive(reader.nextString())
            JsonToken.NUMBER -> JsonPrimitive(reader.nextString().toBigDecimal())
            JsonToken.BOOLEAN -> JsonPrimitive(reader.nextBoolean())
            JsonToken.NULL -> { reader.nextNull(); JsonNull.INSTANCE }
            else -> error("Unexpected legacy JSON token")
        }
    }
}
