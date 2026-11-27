package com.habitline.data

import java.time.LocalDate

data class TrackerSnapshot(
    val habits: List<LocalHabit>, val schedules: List<ScheduleRevision>,
    val completions: List<HabitCompletion>, val widgets: Map<Int, String>, val today: LocalDate
) {
    private val revisions = schedules.groupBy { it.habitId }
    val completedDays = completions.groupBy { it.habitId }.mapValues { (_, rows) -> rows.map { it.day }.toSet() }

    fun schedule(id: String, day: LocalDate = today) =
        revisions[id]?.lastOrNull { it.effectiveFrom <= day.toString() }

    fun isDone(id: String, day: LocalDate = today) = completedDays[id]?.contains(day.toString()) == true

    fun streak(id: String): Int {
        if (schedule(id)?.archived == true) return 0
        val dates = completedDays[id].orEmpty()
        if (dates.isEmpty()) return 0
        val earliest = revisions[id]?.minOfOrNull { it.startDate } ?: today.toString()
        var cursor = today
        if (schedule(id, cursor).scheduledOn(cursor) && cursor.toString() !in dates) cursor = cursor.minusDays(1)
        var length = 0
        while (cursor.toString() >= earliest) {
            if (cursor.toString() in dates) length++
            else if (schedule(id, cursor).scheduledOn(cursor)) break
            cursor = cursor.minusDays(1)
        }
        return length
    }
}

fun ScheduleRevision?.scheduledOn(date: LocalDate): Boolean {
    if (this == null || archived || date.toString() < startDate) return false
    return weekdayMask and (1 shl (date.dayOfWeek.value % 7)) != 0
}
