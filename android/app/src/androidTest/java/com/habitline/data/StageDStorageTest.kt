package com.habitline.data

import android.content.Context
import androidx.room.Room
import androidx.room.withTransaction
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
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
class StageDStorageTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val name = "stage-d-${uuid()}.db"
    private val preferenceName = "stage-d-${uuid()}"
    private val preferences = context.getSharedPreferences(preferenceName, Context.MODE_PRIVATE)
    private val clock = MutableClock()
    private lateinit var db: TrackerDatabase
    private lateinit var repo: HabitRepository

    @Before fun open() {
        db = Room.databaseBuilder(context, TrackerDatabase::class.java, name).build()
        repo = HabitRepository(context, db, clock, preferences) { ZoneOffset.UTC }
    }

    @After fun cleanUp() {
        db.close()
        context.deleteDatabase(name)
        context.deleteSharedPreferences(preferenceName)
    }

    @Test fun marksGoalsAndChallengesCommitAtomicallyAndAwardsRemainImmutable() = runBlocking {
        val start = repo.snapshot().today
        val habit = uuid()
        val goal = uuid()
        val challenge = uuid()
        val values = HabitInput("Read", start, xpValue = 30)
        repo.addHabit(habit, values)
        val goalInput = GoalInput("Read twice", "", 2, start, start.plusDays(5), setOf(habit))
        val challengeInput = ChallengeInput("Three day streak", "", 3, start, start.plusDays(5), ChallengeMode.STREAK, setOf(habit))
        repo.saveGoal(goal, false, goalInput)
        repo.saveChallenge(challenge, false, challengeInput)

        repo.setCompleted(habit, start, true)
        repo.setCompleted(habit, start, true)
        assertEquals(30L, repo.snapshot().progress.xp())
        assertEquals(1, repo.snapshot().progress.events.size)
        repo.setCompleted(habit, start, false)
        repo.setCompleted(habit, start, false)
        assertEquals(0L, repo.snapshot().progress.xp())
        repo.updateHabit(habit, values.copy(xpValue = 70))
        repo.setCompleted(habit, start, true)
        assertEquals(30, repo.snapshot().completions.single().xpEarned)
        assertEquals(listOf(30, -30, 30), repo.snapshot().progress.events.map { it.amount })

        clock.now = clock.now.plusSeconds(86_400)
        repo.setCompleted(habit, start.plusDays(1), true)
        val second = repo.snapshot()
        assertEquals(100L, second.progress.xp())
        assertTrue(second.progress.milestones.any { it.kind == "level" && it.subjectId == "2" })
        val goalAward = second.progress.milestones.single { it.kind == "goal-target" }
        assertEquals("Read twice", goalAward.title)
        assertEquals(start.plusDays(1).toString(), goalAward.earnedOn)

        clock.now = clock.now.plusSeconds(86_400)
        repo.setCompleted(habit, start.plusDays(2), true)
        val third = repo.snapshot()
        assertTrue(third.progress.milestones.any { it.kind == "streak-3" })
        val challengeAward = third.progress.milestones.single { it.kind == "challenge-complete" }
        assertTrue(TargetProgressCalculator(third).challenge(third.progress.challenges.single()).complete)

        repo.saveGoal(goal, true, goalInput.copy(title = "Rewrite", target = 9))
        repo.archiveTarget(challenge, true, true)
        repo.setCompleted(habit, start.plusDays(2), false)
        repo.deleteTarget(goal, false)
        repo.deleteTarget(challenge, true)
        val persisted = repo.snapshot()
        assertEquals(100L, persisted.progress.xp())
        assertTrue(goalAward in persisted.progress.milestones)
        assertTrue(challengeAward in persisted.progress.milestones)
        assertTrue(persisted.progress.goalHabits.isEmpty())
        assertTrue(persisted.progress.challengeHabits.isEmpty())
        assertEquals(1, persisted.progress.milestones.count { it.kind == "tracked-completions" })
        assertEquals(persisted.progress.events.size, persisted.progress.events.map { it.completionId to it.kind }.distinct().size)
        db.close()
        open()
        assertEquals(persisted, repo.snapshot())
    }

    @Test fun stageCLedgerBackfillsAwardsWithoutChangingExistingData() = runBlocking {
        val today = LocalDate.of(2026, 3, 2)
        val owner = uuid()
        val habit = uuid()
        val stamp = clock.now.toString()
        val existing = HabitCompletion(uuid(), habit, "2026-03-01", null, 2.0, null)
        val removed = uuid()
        db.withTransaction {
            val dao = db.tracker()
            dao.insert(LocalProfile(owner, "Stage C", stamp))
            dao.insert(StorageMigration("shared-prefs-v1", owner, stamp, null))
            dao.insert(LocalHabit(habit, owner, "Recorded before Stage D", "★", stamp, stamp))
            dao.insert(ScheduleRevision(uuid(), habit, "2026-03-01", "2026-03-01", DAILY_MASK, 2.0))
            dao.insert(existing)
            dao.bind(WidgetBinding(42, habit))
            dao.save(ProfilePreference(uuid(), owner, "theme", "DARK"))
            dao.insert(XpEvent(uuid(), owner, removed, habit, today.toString(), "award", 100, stamp))
            dao.insert(XpEvent(uuid(), owner, removed, habit, today.toString(), "reverse", -100, stamp))
        }
        db.close()
        open()
        val state = repo.snapshot()
        assertEquals("Stage C", state.settings.name)
        assertEquals(ThemeChoice.DARK, state.settings.theme)
        assertEquals(habit, state.widgets[42])
        assertEquals(existing, state.completions.single())
        assertEquals(0L, state.progress.xp())
        assertEquals(listOf("award", "reverse"), state.progress.events.map { it.kind })
        assertTrue(state.progress.milestones.any { it.kind == "level" && it.subjectId == "2" })
        assertEquals(1, state.progress.milestones.count { it.kind == "tracked-completions" })
        assertEquals(state, repo.snapshot())
    }

    private class MutableClock : Clock() {
        var now: Instant = Instant.parse("2026-03-02T12:00:00Z")
        override fun instant() = now
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = Clock.fixed(now, zone)
    }
}
