package com.habitline.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

@RunWith(AndroidJUnit4::class)
class CoreRepositoryTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val databaseName = "core-test-${uuid()}.db"
    private val preferenceName = "core-test-${uuid()}"
    private val preferences = context.getSharedPreferences(preferenceName, Context.MODE_PRIVATE)
    private val clock = TestClock(Instant.parse("2026-11-20T18:00:00Z"))
    private var zone: ZoneId = ZoneOffset.UTC
    private lateinit var db: TrackerDatabase
    private lateinit var repo: HabitRepository

    @Before fun open() {
        db = Room.databaseBuilder(context, TrackerDatabase::class.java, databaseName).build()
        repo = HabitRepository(context, db, clock, preferences) { zone }
    }

    @After fun cleanup() {
        db.close()
        context.deleteDatabase(databaseName)
        context.deleteSharedPreferences(preferenceName)
    }

    @Test fun stableCreationEditArchiveRestoreAndDeletePersistAcrossDatabaseReopen() = runBlocking {
        val friday = LocalDate.parse("2026-11-20")
        val input = HabitInput("  Morning walk  ", friday.minusDays(1), category = " Outdoors ", weekdayMask = 1 shl 5, points = 2.5)
        val id = uuid()
        val created = repo.addHabit(id, input)
        assertEquals("Morning walk", created.name)
        assertEquals("Outdoors", created.category)
        assertEquals(created, repo.addHabit(id, input.copy(name = "Retry respects the original")))
        assertEquals(1, repo.snapshot().habits.size)
        repo.bindWidget(73, id)
        assertTrue(runCatching { repo.setCompleted(id, friday.plusDays(1), true) }.isFailure)
        repo.setCompleted(id, friday, true)
        repo.setCompleted(id, friday, true)
        val completion = repo.snapshot().completions.single()
        assertEquals(2.5, completion.pointsEarned, 0.0)

        clock.now = Instant.parse("2026-11-23T12:00:00Z")
        val monday = repo.snapshot().today
        val edit = input.copy(name = "Trail walk", description = "Wear boots", weekdayMask = 1 shl 1)
        repo.updateHabit(id, edit)
        val revisionId = repo.snapshot().latestSchedule(id)!!.id
        repo.updateHabit(id, edit.copy(points = 3.75))
        assertEquals(revisionId, repo.snapshot().latestSchedule(id)?.id)
        assertEquals(2, repo.snapshot().schedules.size)
        assertEquals(1, repo.snapshot().day(friday).completedScheduled)
        assertEquals(1, repo.snapshot().day(monday).scheduled)
        assertFalse(repo.snapshot().schedule(id, friday.plusDays(1)).scheduledOn(friday.plusDays(1)))
        assertTrue(runCatching { repo.updateHabit(id, edit.copy(weekdayMask = 0)) }.isFailure)
        repo.setCompleted(id, monday, true)

        clock.now = Instant.parse("2026-11-24T12:00:00Z")
        repo.setArchived(id, true)
        repo.setArchived(id, true)
        val saved = repo.snapshot()
        assertTrue(saved.latestSchedule(id)!!.archived)
        assertEquals(3, saved.schedules.size)
        assertEquals(2, saved.completions.size)
        assertEquals(1, saved.day(monday).completedScheduled)
        assertEquals(0, saved.streak(id))
        assertEquals(id, saved.widgets[73])

        val settings = LocalSettings("Ava", "Designer", ThemeChoice.DARK)
        repo.saveSettings(settings)
        db.close()
        open()
        val reopened = repo.snapshot()
        assertEquals(settings, reopened.settings)
        assertEquals(saved.habits, reopened.habits)
        assertEquals(saved.completions, reopened.completions)
        assertEquals(saved.schedules, reopened.schedules)

        clock.now = Instant.parse("2026-11-30T12:00:00Z")
        repo.setArchived(id, false)
        assertFalse(repo.snapshot().latestSchedule(id)!!.archived)
        assertEquals(1, repo.snapshot().day(repo.snapshot().today).scheduled)
        repo.deleteHabit(id)
        val removed = repo.snapshot()
        assertTrue(removed.habits.isEmpty() && removed.completions.isEmpty() && removed.schedules.isEmpty() && removed.widgets.isEmpty())
        assertTrue(runCatching { repo.addHabit(id, input) }.isFailure)
    }

    @Test fun observedProgressTracksCommitsAndCompletionUsesTheCurrentLocalDate() = runBlocking {
        val day = repo.snapshot().today
        val snapshots = Channel<TrackerSnapshot>(Channel.CONFLATED)
        val observation = launch { repo.observe().collect { snapshots.send(it) } }
        suspend fun waitFor(matches: (TrackerSnapshot) -> Boolean) = withTimeout(5_000) {
            var state = snapshots.receive()
            while (!matches(state)) state = snapshots.receive()
            state
        }
        try {
            waitFor { it.habits.isEmpty() }
            val id = uuid()
            repo.addHabit(id, HabitInput("Read", day))
            assertEquals(1, waitFor { it.habits.isNotEmpty() }.day(day).remaining)
            repo.setCompleted(id, day, true)
            assertEquals(100, waitFor { it.isDone(id) }.day(day).percent)
            repo.setCompleted(id, day, false)
            repo.setCompleted(id, day, false)
            assertEquals(0, waitFor { !it.isDone(id) }.day(day).percent)
            zone = ZoneId.of("Asia/Kolkata")
            assertEquals(day, repo.snapshot().today)
            clock.now = Instant.parse("2026-11-20T18:30:00Z")
            val localTomorrow = day.plusDays(1)
            assertEquals(localTomorrow, repo.snapshot().today)
            assertTrue(runCatching { repo.setCompleted(id, day, true) }.isFailure)
            repo.setCompleted(id, localTomorrow, true)
            assertEquals(localTomorrow.toString(), waitFor { it.isDone(id, localTomorrow) }.completions.single().day)
        } finally {
            observation.cancelAndJoin()
            snapshots.close()
        }
    }

    @Test fun relationshipsAreUniqueAndLeaveCompletionsIndependent() = runBlocking {
        val day = repo.snapshot().today
        val first = repo.addHabit(uuid(), HabitInput("Read", day))
        val second = repo.addHabit(uuid(), HabitInput("Take notes", day))
        repo.linkHabits(first.id, second.id, "Supports")
        repo.linkHabits(second.id, first.id, "Paired")
        val link = repo.snapshot().links.single()
        assertEquals("Supports", link.kind)
        assertTrue(runCatching { repo.linkHabits(first.id, first.id, "Related") }.isFailure)
        repo.setCompleted(first.id, day, true)
        assertFalse(repo.snapshot().isDone(second.id))
        repo.unlinkHabits(link.id)
        repo.unlinkHabits(link.id)
        assertTrue(repo.snapshot().links.isEmpty())
        assertTrue(repo.snapshot().isDone(first.id))
        repo.linkHabits(first.id, second.id, "Paired")
        repo.deleteHabit(second.id)
        assertTrue(repo.snapshot().links.isEmpty())
    }

    private class TestClock(@Volatile var now: Instant) : Clock() {
        override fun instant() = now
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = Clock.fixed(now, zone)
    }
}
