package com.habitline.data

import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

internal fun uuid() = UUID.randomUUID().toString()
internal fun eventId(key: String) = UUID.nameUUIDFromBytes(key.toByteArray(Charsets.UTF_8)).toString()

/** Called inside the same Room transaction that first opens the local profile. */
internal fun migratePreferences(
    dao: TrackerDao, raw: String?, now: Instant, zone: ZoneId
): StorageMigration {
    check(!dao.hasProfile()) { "An existing profile is missing its migration record" }
    val legacy = raw?.let(LegacyStore::decode) ?: HabitStore()
    val profile = LocalProfile(uuid(), "My profile", now.toString())
    dao.insert(profile)
    val habits = legacy.habits.associateBy { it.id }
    for (habit in legacy.habits) {
        val created = Instant.ofEpochMilli(habit.createdAt)
        val start = created.atZone(zone).toLocalDate().toString()
        val mask = if (habit.frequencyType == "daily" || habit.weeklyDays.isEmpty()) 127
            else habit.weeklyDays.fold(0) { sum, weekday -> sum or (1 shl weekday) }
        dao.insert(LocalHabit(habit.id, profile.id, habit.name, habit.icon, created.toString(), created.toString()))
        dao.insert(ScheduleRevision(eventId("legacy-schedule/" + habit.id), habit.id, start, start, mask, habit.points.toDouble()))
    }
    for ((id, day) in legacy.completions) {
        // Phase 1 has only a date. Use the available habit points, as the laptop migration does.
        dao.insert(HabitCompletion(eventId("legacy-completion/$id/$day"), id, day, null, habits.getValue(id).points.toDouble(), null))
    }
    for ((widget, id) in legacy.widgetHabitMap) dao.insert(WidgetBinding(widget.toInt(), id))
    check(dao.habits().map { it.id }.toSet() == habits.keys)
    check(dao.revisions().map { it.habitId }.toSet() == habits.keys)
    check(dao.completions().map { Completion(it.habitId, it.day) }.toSet() == legacy.completions.toSet())
    check(dao.widgets().associate { it.widgetId.toString() to it.habitId } == legacy.widgetHabitMap)
    val digest = raw?.let {
        MessageDigest.getInstance("SHA-256").digest(it.toByteArray(Charsets.UTF_8)).joinToString("") { b -> "%02x".format(b) }
    }
    return StorageMigration("shared-prefs-v1", profile.id, now.toString(), digest).also { dao.insert(it) }
}
