package com.habitline.data

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.sqrt

enum class ChallengeMode(val key: String) { COUNT("count"), STREAK("streak") }

data class GoalInput(
    val title: String, val description: String, val target: Int, val start: LocalDate,
    val end: LocalDate?, val habitIds: Set<String>
) {
    internal fun validate() {
        validateTarget(title, description, target, start, end, 2000, 1_000_000)
        require(habitIds.size <= 200) { "Choose up to 200 habits." }
    }
}

data class ChallengeInput(
    val title: String, val description: String, val target: Int, val start: LocalDate,
    val end: LocalDate, val mode: ChallengeMode, val habitIds: Set<String>
) {
    internal fun validate(allowMissingLinks: Boolean) {
        validateTarget(title, description, target, start, end, 1000, 10_000)
        require(ChronoUnit.DAYS.between(start, end) <= 366) { "Choose a date window of up to 367 days." }
        require(habitIds.size <= 50) { "Choose up to 50 habits." }
        if (allowMissingLinks && habitIds.isEmpty()) return
        require(if (mode == ChallengeMode.STREAK) habitIds.size == 1 else habitIds.isNotEmpty()) {
            if (mode == ChallengeMode.STREAK) "Link exactly one habit for a streak challenge." else "Link at least one habit."
        }
    }
}

private fun validateTarget(
    title: String, description: String, target: Int, start: LocalDate, end: LocalDate?,
    maxDescription: Int, maxTarget: Int
) {
    require(title.isNotBlank() && title.length <= 120) { "Enter a title between 1 and 120 characters." }
    require(description.length <= maxDescription) { "Keep the description within $maxDescription characters." }
    require(target in 1..maxTarget) { "Choose a whole-number target from 1 to $maxTarget." }
    require(start.year in 1..9999 && (end == null || (end.year in 1..9999 && end >= start))) {
        "Choose valid dates with the end on or after the start."
    }
}

data class ProgressRecords(
    val goals: List<LocalGoal> = emptyList(), val goalHabits: List<GoalHabit> = emptyList(),
    val challenges: List<PersonalChallenge> = emptyList(), val challengeHabits: List<ChallengeHabit> = emptyList(),
    val events: List<XpEvent> = emptyList(), val milestones: List<Milestone> = emptyList()
) {
    private val byGoal = goalHabits.groupBy { it.goalId }.mapValues { (_, links) -> links.map { it.habitId }.toSet() }
    private val byChallenge = challengeHabits.groupBy { it.challengeId }.mapValues { (_, links) -> links.map { it.habitId }.toSet() }
    fun goalLinks(id: String) = byGoal[id].orEmpty()
    fun challengeLinks(id: String) = byChallenge[id].orEmpty()
}

data class TargetProgress(val value: Int, val target: Int, val reachedOn: LocalDate?) {
    val complete get() = reachedOn != null
    val percent get() = (value.toLong() * 100 / target).coerceAtMost(100).toInt()
}

class TargetProgressCalculator(private val snapshot: TrackerSnapshot) {
    private val byHabit = snapshot.completions.distinctBy { it.habitId to it.day }.groupBy { it.habitId }

    fun goal(goal: LocalGoal): TargetProgress {
        val upper = end(goal.targetDate, goal.archivedOn)
        val records = snapshot.progress.goalLinks(goal.id).flatMap { id ->
            val archive = snapshot.archiveStart(id)?.toString()
            window(id, goal.startDate, if (archive == null) upper else minOf(archive, upper))
        }.sortedWith(compareBy({ it.day }, { it.habitId }))
        return count(records, goal.target)
    }

    fun challenge(challenge: PersonalChallenge): TargetProgress {
        val upper = end(challenge.endDate, challenge.archivedOn)
        val ids = snapshot.progress.challengeLinks(challenge.id)
        if (challenge.kind != ChallengeMode.STREAK.key) {
            val records = ids.flatMap { window(it, challenge.startDate, upper) }.sortedWith(compareBy({ it.day }, { it.id }))
            return count(records, challenge.target)
        }
        val habit = ids.singleOrNull() ?: return TargetProgress(0, challenge.target, null)
        val dates = window(habit, challenge.startDate, upper).map { LocalDate.parse(it.day) }
        val marks = snapshot.streakMarks(habit, dates).toList()
        return TargetProgress(
            marks.maxOfOrNull { it.length } ?: 0,
            challenge.target,
            marks.firstOrNull { it.length == challenge.target }?.day
        )
    }

    private fun end(date: String?, archived: String?) = listOfNotNull(snapshot.today.toString(), date, archived).min()
    private fun window(id: String, start: String, end: String) = byHabit[id].orEmpty().filter { it.day in start..end }
    private fun count(rows: List<HabitCompletion>, target: Int) =
        TargetProgress(rows.size, target, rows.getOrNull(target - 1)?.day?.let(LocalDate::parse))
}

const val DEFAULT_XP_LEVEL_STEP = 100

data class LevelProgress(val xp: Long, val level: Int, val threshold: Long, val nextLevelAt: Long)

fun levelFor(xp: Long, step: Int = DEFAULT_XP_LEVEL_STEP): LevelProgress {
    require(step in 1..100_000)
    val total = xp.coerceAtLeast(0)
    val level = ((1 + sqrt(1 + 8.0 * total / step)) / 2).toInt()
    val threshold = step.toLong() * level * (level - 1) / 2
    return LevelProgress(total, level, threshold, threshold + step.toLong() * level)
}
