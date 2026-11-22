package com.habitline.data

/**
 * Mirrors the shape of a habit in the web app's data model (see
 * web/src/db/db.js and web/src/lib/habitService.js) so that a future JSON
 * import/export bridge between the two is a straightforward mapping rather
 * than a redesign. Fields not yet used by the Phase-1 widget (e.g. category,
 * priority) are kept so the model doesn't need to change later.
 */
data class Habit(
    val id: String,
    var name: String,
    var icon: String = "⭐",
    var points: Int = 10,
    // Simplified for the widget prototype: daily, or specific weekdays
    // (0 = Sunday ... 6 = Saturday), matching the web app's convention.
    var frequencyType: String = "daily", // "daily" | "weekly"
    var weeklyDays: List<Int> = listOf(1, 2, 3, 4, 5),
    var createdAt: Long = System.currentTimeMillis()
)

/**
 * A single completion record for a habit on a given local date
 * ("yyyy-MM-dd"), matching the web app's date format exactly.
 */
data class Completion(
    val habitId: String,
    val date: String
)

/**
 * The full local store persisted to SharedPreferences as JSON. Kept as one
 * blob (rather than many keys) to make manual export/import trivial and to
 * match the "batch related data together" pattern used by the web app's own
 * storage layer.
 */
data class HabitStore(
    var habits: MutableList<Habit> = mutableListOf(),
    var completions: MutableList<Completion> = mutableListOf(),
    // widgetId -> habitId, so each home-screen widget instance can show a
    // different habit.
    var widgetHabitMap: MutableMap<String, String> = mutableMapOf()
)
