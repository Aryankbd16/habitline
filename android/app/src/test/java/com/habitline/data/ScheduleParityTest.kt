package com.habitline.data

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class ScheduleParityTest {
    @Test fun matchesSharedScheduleAndLocalDateCases() {
        val raw = requireNotNull(javaClass.getResourceAsStream("/android-schedules-v1.json")).bufferedReader().use { it.readText() }
        val data = JsonParser.parseString(raw).asJsonObject
        val id = data["id"].asString
        val versions = data["schedules"].asJsonArray
        val start = versions.first().asJsonObject["effectiveFrom"].asString
        val revisions = versions.map { value ->
            val row = value.asJsonObject
            val day = row["effectiveFrom"].asString
            val mask = row["days"].asJsonArray.fold(0) { current, d -> current or (1 shl d.asInt) }
            ScheduleRevision(day, id, day, start, mask, row["points"].asDouble, row["archived"].asBoolean)
        }
        val completions = data["dates"].asJsonArray.map { HabitCompletion(it.asString, id, it.asString, null, 1.5, null) }
        for (example in data["cases"].asJsonArray) {
            val row = example.asJsonObject
            val day = LocalDate.parse(row["day"].asString)
            val state = TrackerSnapshot(emptyList(), revisions, completions, emptyMap(), day)
            assertEquals(row["scheduled"].asBoolean, state.schedule(id).scheduledOn(day))
            assertEquals(row["streak"].asInt, state.streak(id))
        }
        for (example in data["zonedDates"].asJsonArray) {
            val row = example.asJsonObject
            val day = Instant.parse(row["utc"].asString).atZone(ZoneId.of(row["zone"].asString)).toLocalDate()
            assertEquals(row["day"].asString, day.toString())
        }
    }
}
