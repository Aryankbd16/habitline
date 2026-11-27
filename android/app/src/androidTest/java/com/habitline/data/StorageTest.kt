package com.habitline.data

import android.content.Context
import androidx.room.Room
import androidx.room.withTransaction
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

@RunWith(AndroidJUnit4::class)
class StorageTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val prefs = context.getSharedPreferences("habitline_test_" + uuid(), Context.MODE_PRIVATE)
    private lateinit var db: TrackerDatabase
    private lateinit var repo: HabitRepository
    private val clock = Clock.fixed(Instant.parse("2026-11-22T12:00:00Z"), ZoneId.of("UTC"))
    private val habit = "0e3e8d00-c72d-4658-b7b3-652544ad4ce9"
    private val raw = """{
        "habits":[{"id":"$habit","name":"Sunday walk","icon":"🌿","points":3,"frequencyType":"weekly","weeklyDays":[0],"createdAt":1609459200000}],
        "completions":[{"habitId":"$habit","date":"2026-11-15"},{"habitId":"$habit","date":"2026-11-15"}],
        "widgetHabitMap":{"81":"$habit"}
    }""".trimIndent()

    @Before fun prepare() {
        db = Room.inMemoryDatabaseBuilder(context, TrackerDatabase::class.java).build()
        repo = HabitRepository(context, db, clock, prefs)
    }

    @After fun close() {
        db.close()
        prefs.edit().clear().commit()
    }

    @Test fun preservedUpgradeAndReplay() = runBlocking {
        check(prefs.edit().putString("habitline_store_json", raw).commit())
        val state = repo.snapshot()
        assertEquals(habit, state.habits.single().id)
        val row = state.completions.single()
        assertEquals("2026-11-15", row.day)
        assertNull(row.completedAt)
        assertNull(row.xpEarned)
        assertEquals(3.0, row.pointsEarned, 0.0)
        assertEquals(habit, state.widgets[81])
        assertEquals(1, state.streak(habit))
        assertEquals(1, state.schedule(habit)?.weekdayMask)
        assertEquals(state, HabitRepository(context, db, clock, prefs).snapshot())
        assertEquals(raw, prefs.getString("habitline_store_json", null))
        assertEquals(0L, scalar("SELECT count(*) FROM xp_events"))
        assertEquals(0L, scalar("SELECT count(*) FROM pragma_foreign_key_check"))
        db.openHelper.readableDatabase.query("PRAGMA integrity_check").use { c ->
            assertTrue(c.moveToFirst())
            assertEquals("ok", c.getString(0))
        }
    }

    @Test fun corruptPreferenceNeverOpensEmptyProfile() = runBlocking {
        prefs.edit().putString("habitline_store_json", raw.replace("2026-11-15", "2026-02-31")).commit()
        assertTrue(runCatching { repo.snapshot() }.isFailure)
        assertEquals(0L, scalar("SELECT count(*) FROM profiles"))
        assertEquals(0L, scalar("SELECT count(*) FROM storage_migrations"))
        assertTrue(prefs.contains("habitline_store_json"))
        prefs.edit().putString("habitline_store_json", raw).commit()
        assertEquals(1, repo.snapshot().habits.size)
    }

    @Test fun concurrentMarksUndoAndDeletionAreAtomic() = runBlocking {
        assertTrue(repo.snapshot().habits.isEmpty())
        val created = repo.addHabit("Stretch", "⭐", 4)
        val day = repo.snapshot().today
        repo.bindWidget(81, created.id)
        coroutineScope {
            (0..9).map { async(Dispatchers.IO) { repo.setCompleted(created.id, day, true, 81) } }.awaitAll()
        }
        assertEquals(1, repo.snapshot().completions.size)
        assertEquals(10L, scalar("SELECT sum(amount) FROM xp_events"))
        repo.setCompleted(created.id, day, false, 82)
        assertTrue(repo.snapshot().isDone(created.id))
        repo.setCompleted(created.id, day, false)
        repo.setCompleted(created.id, day, false)
        assertEquals(0L, scalar("SELECT sum(amount) FROM xp_events"))
        assertEquals(2L, scalar("SELECT count(*) FROM xp_events"))
        repo.setCompleted(created.id, day, true)
        repo.deleteHabit(created.id)
        assertEquals(0L, scalar("SELECT sum(amount) FROM xp_events"))
        assertTrue(repo.snapshot().widgets.isEmpty())
        assertEquals(3L, scalar("SELECT count(*) FROM tombstones"))
        assertEquals(6L, scalar("SELECT count(*) FROM outbox"))
    }

    @Test fun constraintsRollBackBatch() = runBlocking {
        repo.snapshot()
        val failed = runCatching {
            db.withTransaction {
                db.tracker().insert(LocalProfile(uuid(), "Rolled back", clock.instant().toString()))
                db.tracker().insert(WidgetBinding(19, "missing-habit"))
            }
        }
        assertTrue(failed.isFailure)
        assertEquals(1L, scalar("SELECT count(*) FROM profiles"))
        val created = repo.addHabit("Walk", "⭐", 1)
        val day = repo.snapshot().today
        repo.setCompleted(created.id, day, true)
        val prior = repo.snapshot().completions.single()
        assertTrue(runCatching { db.withTransaction { db.tracker().insert(prior.copy(id = uuid())) } }.isFailure)
        assertEquals(1L, scalar("SELECT count(*) FROM completions"))
    }

    private suspend fun scalar(sql: String) = db.withTransaction {
        db.openHelper.readableDatabase.query(sql).use { cursor ->
            check(cursor.moveToFirst())
            cursor.getLong(0)
        }
    }
}
