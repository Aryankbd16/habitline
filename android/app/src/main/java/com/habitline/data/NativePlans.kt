package com.habitline.data

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

data class ReminderSettings(val time: LocalTime, val weekdays: Int) {
    init { require(weekdays in 1..DAILY_MASK && time.second == 0 && time.nano == 0) }

    val storedTime: String get() = time.format(DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT))
}

data class ReminderState(val settings: ReminderSettings, val deliveredThrough: LocalDate?)

internal data class ReminderTicket(
    val habitId: String, val updatedAt: String, val day: LocalDate, val zone: ZoneId, val due: Instant
)

internal fun nextReminder(
    state: TrackerSnapshot, habit: LocalHabit, now: ZonedDateTime, catchUpToday: Boolean
): ReminderTicket? {
    val reminder = state.reminders[habit.id] ?: return null
    val schedule = state.latestSchedule(habit.id)?.takeUnless { it.archived } ?: return null
    if (schedule.weekdayMask and reminder.settings.weekdays == 0) return null
    val today = now.toLocalDate()
    val start = maxOf(
        today, LocalDate.parse(schedule.startDate), LocalDate.parse(schedule.effectiveFrom),
        reminder.deliveredThrough?.plusDays(1) ?: today
    )
    // Look at the current partial week and the same weekday in the next week.
    for (offset in 0L..7L) {
        val day = start.plusDays(offset)
        if (!state.reminderApplies(habit.id, reminder.settings, day)) continue
        val due = reminder.settings.time.atDate(day).atZone(now.zone).toInstant()
        if (!due.isAfter(now.toInstant()) && !(day == today && catchUpToday)) continue
        return ReminderTicket(habit.id, habit.updatedAt, day, now.zone, due)
    }
    return null
}

internal fun TrackerSnapshot.acceptsReminder(ticket: ReminderTicket, now: ZonedDateTime): Boolean {
    val habit = habits.firstOrNull { it.id == ticket.habitId } ?: return false
    val reminder = reminders[habit.id] ?: return false
    return habit.updatedAt == ticket.updatedAt && ticket.day == now.toLocalDate() && ticket.zone == now.zone &&
        reminderApplies(habit.id, reminder.settings, ticket.day) &&
        reminder.settings.time.atDate(ticket.day).atZone(now.zone).toInstant() == ticket.due &&
        !now.toInstant().isBefore(ticket.due)
}

private fun TrackerSnapshot.reminderApplies(id: String, settings: ReminderSettings, day: LocalDate) =
    latestSchedule(id)?.archived == false && schedule(id, day).scheduledOn(day) &&
        settings.weekdays and (1 shl (day.dayOfWeek.value % 7)) != 0 && !isDone(id, day)

internal data class WidgetToday(val focus: String?, val completed: Int, val scheduled: Int, val rows: List<Occurrence>)

internal fun TrackerSnapshot.widgetToday(widget: Int, limit: Int): WidgetToday {
    val focus = widgets[widget]
    val day = day(today)
    val rows = day.occurrences.filter { it.scheduled && latestSchedule(it.habit.id)?.archived == false }
        .sortedBy { it.habit.id != focus }.take(limit)
    return WidgetToday(focus, day.completedScheduled, day.scheduled, rows)
}

internal data class WidgetMark(
    val widget: Int, val focus: String?, val habit: String, val day: LocalDate, val desired: Boolean,
    val expectedCompletionId: String? = null
)

internal fun TrackerSnapshot.acceptsWidgetMark(mark: WidgetMark, limit: Int): Boolean {
    if (mark.widget <= 0 || mark.day != today || widgets[mark.widget] != mark.focus) return false
    val row = widgetToday(mark.widget, limit).rows.firstOrNull { it.habit.id == mark.habit } ?: return false
    return mark.desired || (mark.expectedCompletionId != null && row.completion?.id == mark.expectedCompletionId)
}
