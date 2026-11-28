package com.habitline.data

import java.time.LocalDate

const val DAILY_MASK = 127
val HABIT_LINK_TYPES = listOf("Related", "Supports", "Paired")

data class HabitInput(
    val name: String,
    val startDate: LocalDate,
    val description: String = "",
    val category: String = "General",
    val icon: String = "⭐",
    val priority: String = "medium",
    val weekdayMask: Int = DAILY_MASK,
    val points: Double = 10.0,
    val xpValue: Int = 10
) {
    fun validated(existing: LocalHabit? = null, revision: ScheduleRevision? = null) = copy(
        name = if (name == existing?.name) name else name.trim(), description = description.trim(),
        category = category.trim().ifEmpty { "General" },
        icon = if (icon == existing?.icon) icon else icon.trim().ifEmpty { "⭐" }
    ).also {
        require(it.name.isNotBlank() && (it.name.length <= 120 || it.name == existing?.name)) { "Enter a habit name between 1 and 120 characters." }
        require(it.description.length <= 2000) { "Keep the description within 2,000 characters." }
        require(it.category.length <= 60) { "Keep the category within 60 characters." }
        require(it.icon.length <= 24 || it.icon == existing?.icon) { "Keep the icon within 24 characters." }
        require(it.priority in priorities) { "Choose a valid priority." }
        require(it.weekdayMask in 1..DAILY_MASK) { "Select at least one weekday." }
        require(it.xpValue in 0..100) { "Choose a whole-number XP reward from 0 to 100." }
        require(it.startDate.year in 1..9999) { "Choose a valid start date." }
        require(it.points in 0.0..1_000_000.0 || it.points == revision?.points) { "Enter points between 0 and 1,000,000." }
    }

    companion object {
        val priorities = listOf("high", "medium", "low")
        val categories = listOf(
            "General", "Study", "Coding", "Projects", "Fitness", "Health", "Sleep", "Nutrition",
            "Reading", "Finance", "Productivity", "Career", "Personal", "DSA", "Clinical Preparation",
            "Revision", "Other"
        )
    }
}

enum class ThemeChoice { SYSTEM, LIGHT, DARK }

data class LocalSettings(
    val name: String = "",
    val profession: String = "",
    val theme: ThemeChoice = ThemeChoice.SYSTEM
)
