package com.habitline.data

import android.content.Context
import android.content.SharedPreferences
import androidx.room.withTransaction
import com.google.gson.Gson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.collect
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class HabitRepository(
    context: Context,
    private val db: TrackerDatabase = TrackerDatabase.open(context),
    private val clock: Clock = Clock.systemUTC(),
    private val prefs: SharedPreferences = context.getSharedPreferences("habitline_store", Context.MODE_PRIVATE),
    private val zone: () -> ZoneId = { ZoneId.systemDefault() }
) {
    private val dao = db.tracker()
    private val gson = Gson()
    private fun localDate(instant: Instant) = instant.atZone(zone()).toLocalDate()
    private fun profile() = dao.migration()?.profileId ?: migratePreferences(
        dao, prefs.getString("habitline_store_json", null), clock.instant(), zone()
    ).profileId

    suspend fun snapshot() = db.withTransaction {
        val owner = profile()
        val preferences = dao.preferences(owner).associate { it.key to it.value }
        val name = requireNotNull(dao.profile(owner)).displayName
        val settings = LocalSettings(
            name = name.takeUnless { it == "My profile" && preferences[PROFESSION] == null }.orEmpty(),
            profession = preferences[PROFESSION].orEmpty(),
            theme = ThemeChoice.entries.firstOrNull { it.name == preferences[THEME] } ?: ThemeChoice.SYSTEM
        )
        TrackerSnapshot(
            dao.habits(), dao.revisions(), dao.completions(),
            dao.widgets().associate { it.widgetId to it.habitId }, localDate(clock.instant()), settings, dao.links()
        )
    }

    fun observe(): Flow<TrackerSnapshot> = flow {
        db.withTransaction { profile() }
        dao.observeTracker().collect { emit(snapshot()) }
    }

    suspend fun addHabit(name: String, icon: String, points: Int) =
        addHabit(uuid(), HabitInput(name, localDate(clock.instant()), icon = icon, points = points.toDouble()))

    suspend fun addHabit(id: String, input: HabitInput) = db.withTransaction {
        val values = input.validated()
        val owner = profile()
        require(runCatching { java.util.UUID.fromString(id).toString() == id }.getOrDefault(false))
        // A saved editor draft keeps its creation ID across retries and process recreation.
        dao.habit(id)?.let { return@withTransaction it }
        check(!dao.wasDeleted(owner, id)) { "This habit was already deleted." }
        val now = clock.instant()
        val stamp = now.toString()
        val habit = LocalHabit(
            id, owner, values.name, values.icon, stamp, stamp,
            values.description, values.category, values.priority
        )
        val revision = ScheduleRevision(
            uuid(), id, minOf(localDate(now), values.startDate).toString(), values.startDate.toString(),
            values.weekdayMask, values.points
        )
        dao.insert(habit)
        dao.insert(revision)
        record(owner, "habit", habit.id, "create", mapOf("habit" to habit, "revision" to revision))
        habit
    }

    suspend fun updateHabit(id: String, input: HabitInput) = db.withTransaction {
        val owner = profile()
        val old = dao.habit(id) ?: throw IllegalArgumentException("This habit was deleted.")
        val schedule = requireNotNull(dao.latestSchedule(id))
        val values = input.validated(old, schedule)
        val now = clock.instant()
        val updated = old.copy(
            name = values.name, description = values.description, category = values.category,
            icon = values.icon, priority = values.priority
        )
        val revision = schedule.copy(
            startDate = values.startDate.toString(), weekdayMask = values.weekdayMask, points = values.points
        )
        if (updated != old || revision != schedule) {
            val saved = updated.copy(updatedAt = now.toString())
            val savedRevision = saveRevision(schedule, revision, localDate(now))
            dao.update(saved)
            record(owner, "habit", id, "update", mapOf("habit" to saved, "revision" to savedRevision))
        }
    }

    suspend fun setArchived(id: String, archived: Boolean) = db.withTransaction {
        val owner = profile()
        val habit = dao.habit(id) ?: throw IllegalArgumentException("This habit was deleted.")
        val schedule = requireNotNull(dao.latestSchedule(id))
        if (schedule.archived != archived) {
            val now = clock.instant()
            val saved = habit.copy(updatedAt = now.toString())
            val revision = saveRevision(schedule, schedule.copy(archived = archived), localDate(now))
            dao.update(saved)
            record(owner, "habit", id, if (archived) "archive" else "restore", mapOf("habit" to saved, "revision" to revision))
        }
    }

    private fun saveRevision(old: ScheduleRevision, updated: ScheduleRevision, day: LocalDate): ScheduleRevision {
        if (old == updated) return old
        val key = day.toString()
        require(key >= old.effectiveFrom) { "The device date is earlier than the last schedule change." }
        // Edits sharing a local day coalesce, as in the web app. Only that day's version can change.
        return if (key == old.effectiveFrom) updated.also(dao::update)
        else updated.copy(id = uuid(), effectiveFrom = key).also(dao::insert)
    }

    suspend fun saveSettings(settings: LocalSettings) = db.withTransaction {
        val name = settings.name.trim()
        val profession = settings.profession.trim()
        require(name.length <= 120 && profession.length <= 120) { "Use at most 120 characters per field." }
        val owner = profile()
        val current = requireNotNull(dao.profile(owner))
        val preferences = dao.preferences(owner).associateBy { it.key }
        if (name != current.displayName) dao.update(current.copy(displayName = name))
        for ((key, value) in listOf(PROFESSION to profession, THEME to settings.theme.name)) {
            val previous = preferences[key]
            if (previous?.value != value) {
                dao.save(ProfilePreference(previous?.id ?: eventId("preference/$owner/$key"), owner, key, value))
            }
        }
        if (name != current.displayName || profession != preferences[PROFESSION]?.value.orEmpty()) {
            record(owner, "profile", owner, "update", mapOf("displayName" to name, "profession" to profession))
        }
    }

    suspend fun linkHabits(first: String, second: String, kind: String) = db.withTransaction {
        require(first != second && kind in HABIT_LINK_TYPES) { "Choose two habits and a connection type." }
        val owner = profile()
        require(dao.habit(first)?.profileId == owner && dao.habit(second)?.profileId == owner) { "Both habits must exist." }
        if (dao.linkBetween(first, second) == null) {
            val link = HabitLink(uuid(), minOf(first, second), maxOf(first, second), kind)
            dao.insert(link)
            record(owner, "habit_relationship", link.id, "create", link)
        }
    }

    suspend fun unlinkHabits(id: String) = db.withTransaction {
        val owner = profile()
        val link = dao.link(id) ?: return@withTransaction
        require(dao.habit(link.habitId)?.profileId == owner)
        dao.deleteLink(id)
        dao.insert(Deletion(uuid(), owner, "habit_relationship", id, clock.instant().toString()))
        record(owner, "habit_relationship", id, "delete", mapOf("id" to id))
    }

    suspend fun setCompleted(id: String, day: LocalDate, desired: Boolean, widget: Int? = null) = db.withTransaction {
        val owner = profile()
        val now = clock.instant()
        val currentDate = localDate(now)
        if (widget != null && (day != currentDate || dao.boundHabit(widget) != id || dao.latestSchedule(id)?.archived != false)) {
            return@withTransaction
        }
        require(day == currentDate) { "The date changed. Refresh today's habits." }
        val habit = dao.habit(id) ?: return@withTransaction
        val key = day.toString()
        val prior = dao.completion(id, key)
        if (desired == (prior != null)) return@withTransaction
        val stamp = now.toString()
        if (desired) {
            val schedule = dao.schedule(id, key)
            if (widget != null && !schedule.scheduledOn(day)) return@withTransaction
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
        require(widget > 0 && dao.latestSchedule(id)?.archived == false)
        dao.bind(WidgetBinding(widget, id))
    }

    suspend fun clearWidgets(ids: IntArray) = db.withTransaction {
        profile()
        ids.forEach(dao::clearWidget)
    }

    private companion object {
        const val PROFESSION = "profession"
        const val THEME = "theme"
    }
}
