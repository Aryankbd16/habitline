package com.habitline.data

import android.content.Context
import com.google.gson.Gson
import java.text.SimpleDateFormat
import java.util.*

/**
 * IMPORTANT — read this before wiring up sync:
 *
 * This repository is intentionally **independent** from the web app's
 * IndexedDB storage. A browser's IndexedDB cannot be read by a native
 * Android process — they are different storage sandboxes on different
 * "sides" of the device (browser engine vs. native app), even on the same
 * phone. There is no API that lets a home-screen widget reach into another
 * app's (or a browser tab's) local database.
 *
 * Because of that, Phase 1 ships the widget as a genuinely separate, fully
 * working local prototype: you add/track habits directly in this Android
 * app, and the widget reads from THIS app's own storage
 * (SharedPreferences, as a single JSON blob for simplicity — see
 * HabitStore in Habit.kt).
 *
 * To actually mirror data between the web app and this widget today, export
 * a backup from the web app (Settings → Export) and manually re-create the
 * same habits here — there is no automated bridge yet.
 *
 * A future phase could add real sync via one of:
 *   - A small local HTTP server the web app exposes on localhost that this
 *     app polls (works only while a companion desktop process is running).
 *   - A shared account + lightweight cloud sync service.
 *   - Android's Storage Access Framework, having the user manually pick the
 *     exported JSON file, imported here (closest thing to a "one tap" bridge
 *     without a backend).
 * None of these are implemented in Phase 1; do not assume live sync exists.
 */
class HabitRepository(context: Context) {
    private val prefs = context.getSharedPreferences("habitline_store", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    fun today(): String = dateFormat.format(Date())

    fun load(): HabitStore {
        val json = prefs.getString(KEY_STORE, null) ?: return HabitStore()
        return try {
            gson.fromJson(json, HabitStore::class.java) ?: HabitStore()
        } catch (e: Exception) {
            HabitStore()
        }
    }

    fun save(store: HabitStore) {
        prefs.edit().putString(KEY_STORE, gson.toJson(store)).apply()
    }

    fun addHabit(name: String, icon: String, points: Int): Habit {
        val store = load()
        val habit = Habit(id = UUID.randomUUID().toString(), name = name, icon = icon, points = points)
        store.habits.add(habit)
        save(store)
        return habit
    }

    fun deleteHabit(habitId: String) {
        val store = load()
        store.habits.removeAll { it.id == habitId }
        store.completions.removeAll { it.habitId == habitId }
        store.widgetHabitMap.entries.removeAll { it.value == habitId }
        save(store)
    }

    fun isCompletedOn(habitId: String, date: String): Boolean {
        return load().completions.any { it.habitId == habitId && it.date == date }
    }

    /** Toggle completion; guarantees no duplicate completion rows, same rule as the web app. */
    fun toggleCompletion(habitId: String, date: String = today()): Boolean {
        val store = load()
        val existing = store.completions.find { it.habitId == habitId && it.date == date }
        val nowCompleted: Boolean
        if (existing != null) {
            store.completions.remove(existing)
            nowCompleted = false
        } else {
            store.completions.add(Completion(habitId, date))
            nowCompleted = true
        }
        save(store)
        return nowCompleted
    }

    fun currentStreak(habitId: String): Int {
        val store = load()
        val dates = store.completions.filter { it.habitId == habitId }.map { it.date }.toHashSet()
        var streak = 0
        val cal = Calendar.getInstance()
        // If today isn't completed yet, start counting from yesterday so an
        // unfinished "today" doesn't zero out an otherwise-intact streak.
        if (!dates.contains(today())) cal.add(Calendar.DAY_OF_YEAR, -1)
        repeat(3650) {
            val d = dateFormat.format(cal.time)
            if (dates.contains(d)) {
                streak++
                cal.add(Calendar.DAY_OF_YEAR, -1)
            } else {
                return streak
            }
        }
        return streak
    }

    fun recentCompletionDates(habitId: String, days: Int): List<String> {
        val store = load()
        return store.completions.filter { it.habitId == habitId }.map { it.date }
            .sortedDescending().take(days)
    }

    fun setWidgetHabit(widgetId: Int, habitId: String) {
        val store = load()
        store.widgetHabitMap[widgetId.toString()] = habitId
        save(store)
    }

    fun getWidgetHabitId(widgetId: Int): String? {
        return load().widgetHabitMap[widgetId.toString()]
    }

    fun clearWidget(widgetId: Int) {
        val store = load()
        store.widgetHabitMap.remove(widgetId.toString())
        save(store)
    }

    companion object {
        private const val KEY_STORE = "habitline_store_json"
    }
}
