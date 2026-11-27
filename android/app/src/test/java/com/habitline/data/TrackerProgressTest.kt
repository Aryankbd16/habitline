package com.habitline.data

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

class TrackerProgressTest {
    private val today = LocalDate.parse("2026-11-27")
    private val early = LocalDate.parse("2026-11-16")
    private val switch = LocalDate.parse("2026-11-23")
    private val habit = LocalHabit("reading", "profile", "Read", "📚", "", "")
    private fun revision(start: LocalDate, days: Int, archived: Boolean = false) =
        ScheduleRevision(start.toString(), habit.id, start.toString(), early.toString(), days, 1.5, archived)
    private fun done(date: LocalDate) = HabitCompletion(date.toString(), habit.id, date.toString(), null, 1.5, null)
    private fun state(schedules: List<ScheduleRevision>, vararg completed: LocalDate) =
        TrackerSnapshot(listOf(habit), schedules, completed.map(::done), emptyMap(), today)

    @Test fun historicalWeekdaysAndArchivedCompletionsRemainVisible() {
        val friday = LocalDate.parse("2026-11-20")
        val monday = LocalDate.parse("2026-11-23")
        val snapshot = state(listOf(revision(early, 1 shl 5), revision(switch, 1 shl 1), revision(today, DAILY_MASK, true)), friday, monday)
        assertEquals(1, snapshot.day(friday).completedScheduled)
        assertEquals(1, snapshot.day(monday).completedScheduled)
        assertEquals(0, snapshot.day(monday.plusDays(1)).scheduled)
        assertEquals(0, snapshot.day(today).scheduled)
        assertEquals(0, snapshot.streak(habit.id))
    }

    @Test fun scheduleEditsKeepRecordedCompletionsButExcludeThemFromScheduledProgress() {
        val snapshot = state(listOf(revision(early, DAILY_MASK), revision(today, 1 shl 1)), today, today.plusDays(1))
        val changed = snapshot.day(today)
        assertEquals(0, changed.scheduled)
        assertEquals(1, changed.completed)
        assertEquals(0, changed.completedScheduled)
        assertNull(changed.percent)
        assertEquals(0, snapshot.day(today.plusDays(1)).completed)
        assertFalse(snapshot.isDone(habit.id, today.plusDays(1)))
    }

    @Test fun progressRoundsAndCurrentStreakSkipsUnscheduledDays() {
        val schedule = revision(early, 1 shl 5)
        val snapshot = state(listOf(schedule), today.minusWeeks(1))
        assertEquals(1, snapshot.streak(habit.id))
        assertEquals(1, snapshot.day(today).remaining)
        assertEquals(0, snapshot.day(today).percent)
        val another = habit.copy(id = "another")
        val third = habit.copy(id = "third")
        val day = snapshot.copy(
            habits = listOf(habit, another, third),
            schedules = listOf(schedule, schedule.copy(habitId = another.id), schedule.copy(habitId = third.id)),
            completions = listOf(done(today))
        ).day(today)
        assertEquals(33, day.percent)
        assertEquals(2, day.remaining)
    }

    @Test fun calendarStartsOnMondayAndHandlesMonthAndYearBoundaries() {
        val snapshot = state(listOf(revision(early, DAILY_MASK)), today)
        val november = snapshot.month(YearMonth.of(2026, 11))
        assertEquals(42, november.size)
        assertTrue(november.take(6).all { it == null })
        assertEquals(LocalDate.parse("2026-11-01"), november[6]?.date)
        assertEquals(LocalDate.parse("2026-11-02"), november[7]?.date)
        assertEquals(1, november.first { it?.date == today }?.completed)
        assertTrue(november.first { it?.date == today.plusDays(1) }!!.future)
        val january = snapshot.month(YearMonth.of(2026, 12).plusMonths(1)).filterNotNull()
        assertEquals(LocalDate.parse("2027-01-01"), january.first().date)
        assertTrue(january.all { it.future && it.scheduled == 1 && it.completed == 0 })
        assertEquals(29, snapshot.month(YearMonth.of(2028, 2)).count { it != null })
    }

    @Test fun validatesInputWithoutDroppingSupportedLegacyValues() {
        assertThrows(IllegalArgumentException::class.java) { HabitInput("  ", today).validated() }
        assertThrows(IllegalArgumentException::class.java) { HabitInput("Walk", today, weekdayMask = 0).validated() }
        assertThrows(IllegalArgumentException::class.java) { HabitInput("Walk", today, points = Double.NaN).validated() }
        val normalized = HabitInput("  Walk  ", today, category = " ", points = 2.5).validated()
        assertEquals("Walk", normalized.name)
        assertEquals("General", normalized.category)
        val legacy = habit.copy(name = "a".repeat(121), icon = "b".repeat(25))
        val revision = revision(early, DAILY_MASK).copy(points = 1_000_001.0)
        val input = HabitInput(legacy.name, today, icon = legacy.icon, points = revision.points)
        assertEquals(input, input.validated(legacy, revision))
    }
}
