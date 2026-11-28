package com.habitline.data

import java.time.LocalDate
import java.time.YearMonth
import kotlin.math.roundToInt

data class TrackerSnapshot(
    val habits: List<LocalHabit>, val schedules: List<ScheduleRevision>,
    val completions: List<HabitCompletion>, val widgets: Map<Int, String>, val today: LocalDate,
    val settings: LocalSettings = LocalSettings(), val links: List<HabitLink> = emptyList(),
    val progress: ProgressRecords = ProgressRecords(),
    val reminders: Map<String, ReminderState> = emptyMap()
) {
    private val revisions = schedules.groupBy { it.habitId }.mapValues { (_, rows) -> rows.sortedBy { it.effectiveFrom } }
    private val byDay = completions.groupBy { it.day }.mapValues { (_, rows) -> rows.associateBy { it.habitId } }
    private val completedDays = completions.groupBy { it.habitId }.mapValues { (_, rows) -> rows.map { it.day }.toSet() }

    fun schedule(id: String, day: LocalDate = today): ScheduleRevision? {
        val entries = revisions[id] ?: return null
        val index = entries.binarySearchBy(day.toString()) { it.effectiveFrom }
        return entries.getOrNull(if (index >= 0) index else -index - 2)
    }

    fun latestSchedule(id: String) = revisions[id]?.lastOrNull()

    fun archiveStart(id: String): LocalDate? {
        val history = revisions[id].orEmpty().takeWhile { it.effectiveFrom <= today.toString() }
        return history.asReversed().takeWhile { it.archived }.lastOrNull()?.effectiveFrom?.let(LocalDate::parse)
    }

    fun isDone(id: String, day: LocalDate = today) = day <= today && byDay[day.toString()]?.containsKey(id) == true

    fun day(date: LocalDate): DayProgress {
        val completions = if (date <= today) byDay[date.toString()].orEmpty() else emptyMap()
        return DayProgress(habits.mapNotNull { habit ->
            val scheduled = schedule(habit.id, date).scheduledOn(date)
            val completion = completions[habit.id]
            if (scheduled || completion != null) Occurrence(habit, scheduled, completion) else null
        })
    }

    fun month(month: YearMonth): List<CalendarDay?> {
        val offset = month.atDay(1).dayOfWeek.value - 1
        val cells = ((offset + month.lengthOfMonth() + 6) / 7) * 7
        return List(cells) { index ->
            val number = index - offset + 1
            if (number !in 1..month.lengthOfMonth()) null else {
                val date = month.atDay(number)
                val progress = day(date)
                CalendarDay(date, progress.scheduled, progress.completedScheduled, progress.completed, date > today)
            }
        }
    }

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

data class Occurrence(val habit: LocalHabit, val scheduled: Boolean, val completion: HabitCompletion?)

data class DayProgress(val occurrences: List<Occurrence>) {
    val scheduled = occurrences.count { it.scheduled }
    val completed = occurrences.count { it.completion != null }
    val completedScheduled = occurrences.count { it.scheduled && it.completion != null }
    val remaining = scheduled - completedScheduled
    val percent = if (scheduled == 0) null else (100.0 * completedScheduled / scheduled).roundToInt()
}

data class CalendarDay(
    val date: LocalDate, val scheduled: Int, val completedScheduled: Int, val completed: Int, val future: Boolean
)

fun ScheduleRevision?.scheduledOn(date: LocalDate): Boolean {
    if (this == null || archived || date.toString() < startDate) return false
    return weekdayMask and (1 shl (date.dayOfWeek.value % 7)) != 0
}
