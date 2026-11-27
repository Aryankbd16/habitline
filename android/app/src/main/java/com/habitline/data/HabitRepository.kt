package com.habitline.data

import android.content.Context
import android.content.SharedPreferences
import androidx.room.withTransaction
import com.google.gson.Gson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.collect
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

class HabitRepository(
    context: Context,
    private val db: TrackerDatabase = TrackerDatabase.open(context),
    private val clock: Clock = Clock.systemUTC(),
    private val prefs: SharedPreferences = context.getSharedPreferences("habitline_store", Context.MODE_PRIVATE)
) {
    private val dao = db.tracker()
    private val gson = Gson()
    private fun today() = clock.instant().atZone(ZoneId.systemDefault()).toLocalDate()
    private fun profile() = dao.migration()?.profileId ?: migratePreferences(
        dao, prefs.getString("habitline_store_json", null), clock.instant(), ZoneId.systemDefault()
    ).profileId

    suspend fun snapshot() = db.withTransaction {
        profile()
        TrackerSnapshot(dao.habits(), dao.revisions(), dao.completions(), dao.widgets().associate { it.widgetId to it.habitId }, today())
    }

    fun observe(): Flow<TrackerSnapshot> = flow {
        db.withTransaction { profile() }
        dao.observeTracker().collect { emit(snapshot()) }
    }

    suspend fun addHabit(name: String, icon: String, points: Int) = db.withTransaction {
        require(name.isNotBlank() && points >= 0)
        val owner = profile()
        val stamp = clock.instant().toString()
        val day = today().toString()
        val habit = LocalHabit(uuid(), owner, name.trim(), icon, stamp, stamp)
        val revision = ScheduleRevision(uuid(), habit.id, day, day, 127, points.toDouble())
        dao.insert(habit)
        dao.insert(revision)
        record(owner, "habit", habit.id, "create", mapOf("habit" to habit, "revision" to revision))
        habit
    }

    suspend fun setCompleted(id: String, day: LocalDate, desired: Boolean, widget: Int? = null) = db.withTransaction {
        val owner = profile()
        if (widget != null && dao.boundHabit(widget) != id) return@withTransaction
        require(day == today()) { "The date changed. Refresh today's habits." }
        val habit = dao.habit(id) ?: return@withTransaction
        val key = day.toString()
        val prior = dao.completion(id, key)
        if (desired == (prior != null)) return@withTransaction
        val stamp = clock.instant().toString()
        if (desired) {
            val schedule = dao.schedule(id, key)
            require(schedule.scheduledOn(day)) { "This habit is not scheduled today." }
            val reward = dao.firstAward(id, key) ?: habit.xpValue
            val row = HabitCompletion(uuid(), id, key, stamp, requireNotNull(schedule).points, reward)
            val event = XpEvent(eventId(row.id + "/award"), owner, row.id, id, key, "award", reward, stamp)
            dao.insert(row)
            dao.insert(event)
            record(owner, "completion", row.id, "mark", mapOf("completion" to row, "event" to event))
        } else {
            undo(owner, requireNotNull(prior), stamp)
        }
    }

    suspend fun deleteHabit(id: String) = db.withTransaction {
        val owner = profile()
        if (dao.habit(id) == null) return@withTransaction
        val stamp = clock.instant().toString()
        for (row in dao.habitCompletions(id)) undo(owner, row, stamp)
        dao.deleteHabit(id)
        dao.insert(Deletion(uuid(), owner, "habit", id, stamp))
        record(owner, "habit", id, "delete", mapOf("id" to id))
    }

    private fun undo(owner: String, row: HabitCompletion, stamp: String) {
        val reversal = row.xpEarned?.let {
            XpEvent(eventId(row.id + "/reverse"), owner, row.id, row.habitId, row.day, "reverse", -it, stamp)
        }
        if (reversal != null) dao.insert(reversal)
        dao.deleteCompletion(row.id)
        dao.insert(Deletion(uuid(), owner, "completion", row.id, stamp))
        record(owner, "completion", row.id, "undo", mapOf("habitId" to row.habitId, "day" to row.day, "event" to reversal))
    }

    private fun record(owner: String, entity: String, id: String, op: String, value: Any) {
        dao.insert(PendingMutation(uuid(), owner, entity, id, op, gson.toJson(value), clock.instant().toString()))
    }

    suspend fun bindWidget(widget: Int, id: String) = db.withTransaction {
        profile()
        require(widget > 0 && dao.habit(id) != null)
        dao.bind(WidgetBinding(widget, id))
    }

    suspend fun clearWidgets(ids: IntArray) = db.withTransaction {
        profile()
        ids.forEach(dao::clearWidget)
    }
}
