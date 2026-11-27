package com.habitline.data

import org.junit.Assert.assertTrue
import org.junit.Test

class LegacyStoreTest {
    @Test fun distinguishesAnEmptyAccountFromDataNeedingRecovery() {
        val empty = """{"habits":[],"completions":[],"widgetHabitMap":{}}"""
        assertTrue(LegacyStore.decode(empty).habits.isEmpty())
        for (malformed in listOf("", "null", "{}", "[]", empty + "{}", empty.replace("[]", "null"),
            empty.replace("\"habits\":[]", "\"habits\":[],\"habits\":[]"),
            empty.replace("\"completions\":[]", "\"completions\":[{\"habitId\":\"unknown\",\"date\":\"2024-02-29\"}]"),
            empty.replace("\"widgetHabitMap\":{}", "\"widgetHabitMap\":{\"42\":\"unknown\"}"))) {
            assertTrue("Invalid legacy store accepted: " + malformed, runCatching { LegacyStore.decode(malformed) }.isFailure)
        }
    }
}
