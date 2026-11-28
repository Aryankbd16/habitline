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
import java.time.LocalTime
import java.time.ZonedDateTime
import java.time.ZoneId

internal data class NativeSnapshot(val now: ZonedDateTime, val tracker: TrackerSnapshot)

class HabitRepository(
    context: Context,
    private val db: TrackerDatabase = TrackerDatabase.open(context),
    private val clock: Clock = Clock.systemUTC(),
    private val prefs: SharedPreferences = context.getSharedPreferences("habitline_store", Context.MODE_PRIVATE),
    private val zone: () -> ZoneId = { ZoneId.systemDefault() }
) {
    private val dao = db.tracker()
    private val progress = db.progress()
    private val gson = Gson()
    private fun localDate(instant: Instant) = instant.atZone(zone()).toLocalDate()
    private fun profile() = dao.migration()?.profileId ?: migratePreferences(
        dao, prefs.getString("habitline_store_json", null), clock.instant(), zone()
    ).profileId

    suspend fun snapshot() = db.withTransaction {
        val owner = profile()
        val today = localDate(clock.instant())
        backfillAwards(owner, today)
        readSnapshot(owner, today)
    }

    private fun readSnapshot(owner: String, today: LocalDate): TrackerSnapshot {
        val preferences = dao.preferences(owner).associate { it.key to it.value }
        val name = requireNotNull(dao.profile(owner)).displayName
        val settings = LocalSettings(
            name = name.takeUnless { it == "My profile" && preferences[PROFESSION] == null }.orEmpty(),
            profession = preferences[PROFESSION].orEmpty(),
            theme = ThemeChoice.entries.firstOrNull { it.name == preferences[THEME] } ?: ThemeChoice.SYSTEM
        )
        val habits = dao.habits()
        return TrackerSnapshot(
            habits, dao.revisions(), dao.completions(),
            dao.widgets().associate { it.widgetId to it.habitId }, today, settings, dao.links(),
            ProgressRecords(progress.goals(owner), progress.goalHabits(owner), progress.challenges(owner),
                progress.challengeHabits(owner), progress.events(owner), progress.milestones(owner)),
            readReminders(habits, preferences)
        )
    }

    /** Read only the data used by background reminders and RemoteViews. */
    internal suspend fun nativeSnapshot() = db.withTransaction {
        val now = clock.instant().atZone(zone())
        NativeSnapshot(now, readNative(profile(), now.toLocalDate()))
    }

    private fun readNative(owner: String, today: LocalDate): TrackerSnapshot {
        val habits = dao.habits().filter { it.profileId == owner }
        val preferences = dao.preferences(owner).associate { it.key to it.value }
        return TrackerSnapshot(
            habits, dao.revisions(), dao.completionsOn(today.toString()),
            dao.widgets().associate { it.widgetId to it.habitId }, today,
            reminders = readReminders(habits, preferences)
        )
    }

    private fun readReminders(habits: List<LocalHabit>, values: Map<String, String>): Map<String, ReminderState> =
        habits.mapNotNull { habit ->
            val time = habit.reminderTime?.let { runCatching { LocalTime.parse(it) }.getOrNull() }
                ?: return@mapNotNull null
            if (time.second != 0 || time.nano != 0) return@mapNotNull null
            val mask = values["$REMINDER_WEEKDAYS/${habit.id}"]?.toIntOrNull()?.takeIf { it in 1..DAILY_MASK } ?: DAILY_MASK
            val delivered = values["$REMINDER_DELIVERED/${habit.id}"]?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            habit.id to ReminderState(ReminderSettings(time, mask), delivered)
        }.toMap()

    suspend fun saveReminder(id: String, settings: ReminderSettings?) = db.withTransaction {
        val owner = profile()
        val habit = requireNotNull(dao.habit(id)?.takeIf { it.profileId == owner }) { "This habit was deleted." }
        val key = "$REMINDER_WEEKDAYS/$id"
        val oldMask = dao.preference(owner, key)?.value?.toIntOrNull() ?: DAILY_MASK
        if (habit.reminderTime == settings?.storedTime && (settings == null || oldMask == settings.weekdays)) return@withTransaction
        val saved = habit.copy(reminderTime = settings?.storedTime, updatedAt = clock.instant().toString())
        dao.update(saved)
        if (settings == null) dao.deletePreference(owner, key)
        else saveNativePreference(owner, key, settings.weekdays.toString())
        record(owner, "habit", id, "update", mapOf("habit" to saved, "reminderWeekdays" to settings?.weekdays))
    }

    internal suspend fun deliverReminder(ticket: ReminderTicket, publish: (LocalHabit) -> Boolean) = db.withTransaction {
        val owner = profile()
        val now = clock.instant().atZone(zone())
        val state = readNative(owner, now.toLocalDate())
        if (!state.acceptsReminder(ticket, now)) return@withTransaction false
        val through = state.reminders[ticket.habitId]?.deliveredThrough
        if (through != null && ticket.day <= through) return@withTransaction false
        val habit = state.habits.first { it.id == ticket.habitId }
        if (!publish(habit)) return@withTransaction false
        saveNativePreference(owner, "$REMINDER_DELIVERED/${ticket.habitId}", ticket.day.toString())
        true
    }

    internal suspend fun completeFromReminder(ticket: ReminderTicket) = db.withTransaction {
        val owner = profile()
        val now = clock.instant().atZone(zone())
        val state = readNative(owner, now.toLocalDate())
        val handled = dao.preference(owner, "$REMINDER_ACTION/${ticket.habitId}")?.value
        if (handled == ticket.day.toString() || !state.acceptsReminder(ticket, now) ||
            state.reminders[ticket.habitId]?.deliveredThrough != ticket.day) {
            return@withTransaction false
        }
        setCompleted(ticket.habitId, ticket.day, true)
        true
    }

    internal suspend fun completeFromWidget(mark: WidgetMark, limit: Int) = db.withTransaction {
        val owner = profile()
        val today = localDate(clock.instant())
        if (!readNative(owner, today).acceptsWidgetMark(mark, limit)) return@withTransaction false
        setCompleted(mark.habit, mark.day, mark.desired)
        true
    }

    private fun saveNativePreference(owner: String, key: String, value: String) {
        val id = dao.preference(owner, key)?.id ?: eventId("preference/$owner/$key")
        dao.save(ProfilePreference(id, owner, key, value))
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
            values.description, values.category, values.priority, xpValue = values.xpValue
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
            icon = values.icon, priority = values.priority, xpValue = values.xpValue
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

    suspend fun saveGoal(id: String, editing: Boolean, input: GoalInput) = db.withTransaction {
        input.validate()
        val owner = profile()
        val previous = progress.goal(owner, id)
        if (!editing && previous != null) return@withTransaction
        require(!editing || previous != null) { "This goal was deleted." }
        validateLinks(owner, input.habitIds)
        val row = LocalGoal(
            id, owner, input.title.trim(), input.description.trim(), input.target,
            input.start.toString(), input.end?.toString(), previous?.archivedOn
        )
        if (previous == null) progress.insert(row) else progress.update(row)
        val links = input.habitIds.map { GoalHabit(eventId("goal/$id/$it"), id, it) }
        progress.clearGoalLinks(id)
        progress.insert(links)
        val rules = MilestoneRules(readSnapshot(owner, localDate(clock.instant())))
        earn(owner, listOfNotNull(rules.goal(row)))
        record(owner, "goal", id, if (editing) "update" else "create", mapOf("goal" to row, "links" to links))
    }

    suspend fun saveChallenge(id: String, editing: Boolean, input: ChallengeInput) = db.withTransaction {
        val owner = profile()
        val previous = progress.challenge(owner, id)
        if (!editing && previous != null) return@withTransaction
        require(!editing || previous != null) { "This challenge was deleted." }
        require(previous == null || previous.kind == input.mode.key) { "The progress measure is fixed for an existing challenge." }
        val hadNoLinks = previous != null && progress.challengeHabits(owner).none { it.challengeId == id }
        input.validate(allowMissingLinks = hadNoLinks)
        validateLinks(owner, input.habitIds)
        val row = PersonalChallenge(
            id, owner, input.title.trim(), input.description.trim(), input.mode.key, input.target,
            input.start.toString(), input.end.toString(), previous?.archivedOn
        )
        if (previous == null) progress.insert(row) else progress.update(row)
        val links = input.habitIds.map { ChallengeHabit(eventId("challenge/$id/$it"), id, it) }
        progress.clearChallengeLinks(id)
        progress.insertChallenges(links)
        val rules = MilestoneRules(readSnapshot(owner, localDate(clock.instant())))
        earn(owner, listOfNotNull(rules.challenge(row)))
        record(owner, "challenge", id, if (editing) "update" else "create", mapOf("challenge" to row, "links" to links))
    }

    suspend fun archiveTarget(id: String, challenge: Boolean, archived: Boolean) = db.withTransaction {
        val owner = profile()
        val today = localDate(clock.instant())
        val operation = if (archived) "archive" else "restore"
        if (challenge) {
            val old = progress.challenge(owner, id) ?: return@withTransaction
            if ((old.archivedOn != null) == archived) return@withTransaction
            val row = old.copy(archivedOn = today.toString().takeIf { archived })
            progress.update(row)
            earn(owner, listOfNotNull(MilestoneRules(readSnapshot(owner, today)).challenge(row)))
            record(owner, "challenge", id, operation, row)
        } else {
            val old = progress.goal(owner, id) ?: return@withTransaction
            if ((old.archivedOn != null) == archived) return@withTransaction
            val row = old.copy(archivedOn = today.toString().takeIf { archived })
            progress.update(row)
            earn(owner, listOfNotNull(MilestoneRules(readSnapshot(owner, today)).goal(row)))
            record(owner, "goal", id, operation, row)
        }
    }

    suspend fun deleteTarget(id: String, challenge: Boolean) = db.withTransaction {
        val owner = profile()
        val deleted = if (challenge) progress.deleteChallenge(owner, id) else progress.deleteGoal(owner, id)
        if (deleted != 0) {
            val entity = if (challenge) "challenge" else "goal"
            dao.insert(Deletion(uuid(), owner, entity, id, clock.instant().toString()))
            record(owner, entity, id, "delete", mapOf("id" to id))
        }
    }

    private fun validateLinks(owner: String, ids: Set<String>) {
        require(ids.all { dao.habit(it)?.profileId == owner }) { "One or more linked habits were deleted." }
    }

    private fun earn(owner: String, awards: List<Award>) {
        if (awards.isEmpty()) return
        progress.insertMilestones(awards.map { award ->
            Milestone(
                eventId("milestone/$owner/${award.kind}/${award.subject}"),
                owner, award.kind, award.subject, award.title, award.description, award.day
            )
        })
    }

    private fun backfillAwards(owner: String, today: LocalDate) {
        if (dao.preferences(owner).any { it.key == AWARDS_BACKFILLED }) return
        earn(owner, MilestoneRules(readSnapshot(owner, today)).existingRecords())
        dao.save(ProfilePreference(eventId("preference/$owner/$AWARDS_BACKFILLED"), owner, AWARDS_BACKFILLED, "true"))
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
        backfillAwards(owner, day)
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
            earn(owner, MilestoneRules(readSnapshot(owner, day)).onMark(habit, reward))
            if (dao.preference(owner, "$REMINDER_DELIVERED/$id")?.value == key) {
                saveNativePreference(owner, "$REMINDER_ACTION/$id", key)
            }
        } else {
            undo(owner, requireNotNull(prior), stamp)
        }
    }

    suspend fun deleteHabit(id: String) = db.withTransaction {
        val owner = profile()
        if (dao.habit(id) == null) return@withTransaction
        val now = clock.instant()
        backfillAwards(owner, localDate(now))
        val stamp = now.toString()
        for (row in dao.habitCompletions(id)) undo(owner, row, stamp)
        dao.deleteHabit(id)
        dao.deletePreference(owner, "$REMINDER_WEEKDAYS/$id")
        dao.deletePreference(owner, "$REMINDER_DELIVERED/$id")
        dao.deletePreference(owner, "$REMINDER_ACTION/$id")
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
        const val REMINDER_WEEKDAYS = "reminder-weekdays"
        const val REMINDER_DELIVERED = "reminder-delivered"
        const val REMINDER_ACTION = "reminder-action"
        const val AWARDS_BACKFILLED = "awards-backfilled-stage-d"
    }
}
