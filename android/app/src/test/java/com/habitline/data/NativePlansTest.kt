package com.habitline.data

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

class NativePlansTest {
    private val zone = ZoneId.of("America/New_York")
    private val monday = LocalDate.parse("2026-03-02")
    private val habit = LocalHabit("habit", "owner", "Read", "★", "saved", "saved", reminderTime = "09:00")
    private val second = habit.copy(id = "second", name = "Walk")
    private val reading = ScheduleRevision("s1", habit.id, monday.toString(), monday.toString(), DAILY_MASK, 10.0)
    private val walking = reading.copy(id = "s2", habitId = second.id)
    private val reminder = ReminderState(ReminderSettings(LocalTime.of(9, 0), DAILY_MASK), null)

    private fun state(date: LocalDate = monday) = TrackerSnapshot(
        listOf(habit, second), listOf(reading, walking), emptyList(), mapOf(41 to second.id), date,
        reminders = mapOf(habit.id to reminder)
    )

    @Test fun scheduleAndReminderWeekdaysMustIntersectAndStartIsRespected() {
        val tuesday = monday.plusDays(1)
        val friday = monday.plusDays(4)
        val current = state().copy(schedules = listOf(reading.copy(weekdayMask = 1 shl 5, startDate = friday.toString()), walking))
        val mondayOnly = current.copy(reminders = mapOf(habit.id to reminder.copy(settings = reminder.settings.copy(weekdays = 1 shl 1))))
        val now = tuesday.atTime(12, 0).atZone(zone)
        assertNull(nextReminder(mondayOnly, habit, now, true))
        assertEquals(friday, nextReminder(current, habit, now, true)?.day)
    }

    @Test fun timeEditsZoneChangesAndDateBoundariesInvalidatePreviousTickets() {
        val before = monday.atTime(8, 0).atZone(zone)
        val state = state()
        val first = requireNotNull(nextReminder(state, habit, before, true))
        val due = monday.atTime(9, 0).atZone(zone)
        assertFalse(state.acceptsReminder(first, before))
        assertTrue(state.acceptsReminder(first, due))
        assertFalse(state.acceptsReminder(first, due.plusDays(1)))
        val tokyo = due.withZoneSameInstant(ZoneId.of("Asia/Tokyo"))
        assertFalse(state.acceptsReminder(first, tokyo))
        assertNotEquals(first.due, nextReminder(state, habit, tokyo, true)?.due)
        val edited = state.copy(reminders = mapOf(habit.id to reminder.copy(settings = reminder.settings.copy(time = LocalTime.of(11, 0)))))
        assertFalse(edited.acceptsReminder(first, due.plusHours(3)))
    }

    @Test fun daylightSavingGapShiftsForwardAndOverlapChoosesEarlierInstant() {
        val start = LocalDate.parse("2026-03-08")
        val spring = state(start).copy(reminders = mapOf(habit.id to ReminderState(ReminderSettings(LocalTime.of(2, 30), DAILY_MASK), null)))
        val gap = requireNotNull(nextReminder(spring, habit, start.atStartOfDay(zone), true))
        assertEquals("2026-03-08T07:30:00Z", gap.due.toString())
        val autumn = LocalDate.parse("2026-11-01")
        val overlap = spring.copy(today = autumn, reminders = mapOf(habit.id to ReminderState(ReminderSettings(LocalTime.of(1, 30), DAILY_MASK), null)))
        val fall = requireNotNull(nextReminder(overlap, habit, autumn.atStartOfDay(zone), true))
        assertEquals("2026-11-01T05:30:00Z", fall.due.toString())
    }

    @Test fun deliveryOnlyCatchesUpOnTheSameDayWhenAvailable() {
        val now = ZonedDateTime.of(monday, LocalTime.of(11, 0), zone)
        val state = state()
        assertEquals(monday, nextReminder(state, habit, now, true)?.day)
        assertEquals(monday.plusDays(1), nextReminder(state, habit, now, false)?.day)
        val delivered = state.copy(reminders = mapOf(habit.id to reminder.copy(deliveredThrough = monday)))
        assertEquals(monday.plusDays(1), nextReminder(delivered, habit, now, true)?.day)
        val marked = state.copy(completions = listOf(HabitCompletion("mark", habit.id, monday.toString(), "when", 2.0, 10)))
        assertEquals(monday.plusDays(1), nextReminder(marked, habit, now, true)?.day)
        assertNull(nextReminder(state.copy(reminders = emptyMap()), habit, now, true))
        assertNull(nextReminder(state.copy(schedules = listOf(reading.copy(archived = true))), habit, now, true))
        val oldTicket = requireNotNull(nextReminder(state, habit, now, true))
        assertFalse(state.copy(habits = listOf(second)).acceptsReminder(oldTicket, now))
        assertFalse(marked.acceptsReminder(oldTicket, now))
    }

    @Test fun widgetsExposeOnlyCurrentRowsAndRejectStaleFocusAndDates() {
        val state = state()
        val overview = state.widgetToday(42, 1)
        assertNull(overview.focus)
        assertEquals(listOf(habit.id), overview.rows.map { it.habit.id })
        val focus = state.widgetToday(41, 1)
        assertEquals(2, focus.scheduled)
        assertEquals(listOf(second.id), focus.rows.map { it.habit.id })
        val mark = WidgetMark(41, second.id, second.id, monday, true)
        assertTrue(state.acceptsWidgetMark(mark, 1))
        assertFalse(state.acceptsWidgetMark(mark.copy(habit = habit.id), 1))
        assertFalse(state.acceptsWidgetMark(mark.copy(focus = null), 1))
        assertFalse(state.acceptsWidgetMark(mark.copy(day = monday.minusDays(1)), 1))
        assertFalse(state.acceptsWidgetMark(mark.copy(widget = -1), 1))
        val marked = state.copy(completions = listOf(HabitCompletion("saved", second.id, monday.toString(), "now", 1.0, 10)))
        assertTrue(marked.acceptsWidgetMark(mark.copy(desired = false, expectedCompletionId = "saved"), 1))
        assertFalse(marked.acceptsWidgetMark(mark.copy(desired = false, expectedCompletionId = "old"), 1))
    }
}
