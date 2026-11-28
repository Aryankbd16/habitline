package com.habitline.data

import java.time.LocalDate

val TRACKED_COMPLETION_TARGETS = listOf(1, 7, 100, 500)
val STREAK_TARGETS = listOf(3, 7, 14, 30, 100)

internal data class Award(
    val kind: String, val subject: String, val title: String, val description: String, val day: String
)

internal fun ProgressRecords.xp() = events.sumOf { it.amount.toLong() }

fun TrackerSnapshot.trackedCompletions(): List<HabitCompletion> {
    val tracked = progress.events.filter { it.kind == "award" }.mapTo(mutableSetOf()) { it.completionId }
    return completions.filter { it.id in tracked && it.day <= today.toString() }
        .sortedWith(compareBy({ it.day }, { it.id }))
}

internal class MilestoneRules(private val snapshot: TrackerSnapshot) {
    private val targets = TargetProgressCalculator(snapshot)
    private val byHabit = snapshot.completions.groupBy { it.habitId }

    fun goal(goal: LocalGoal): Award? = targets.goal(goal).reachedOn?.let {
        val label = if (goal.target == 1) "habit completion." else "habit completions."
        Award("goal-target", goal.id, goal.title, "Reached the goal target of ${goal.target} $label", it.toString())
    }

    fun challenge(challenge: PersonalChallenge): Award? = targets.challenge(challenge).reachedOn?.let {
        val label = if (challenge.kind == ChallengeMode.STREAK.key) "consecutive scheduled occurrences." else "completions."
        Award(
            "challenge-complete", challenge.id, challenge.title,
            "Reached the challenge target of ${challenge.target} $label", it.toString()
        )
    }

    fun onMark(habit: LocalHabit, reward: Int): List<Award> = buildList {
        val xp = snapshot.progress.xp()
        val before = levelFor(xp - reward).level
        val after = levelFor(xp).level
        for (level in before + 1..after) add(levelAward(level, snapshot.today.toString()))
        val tracked = snapshot.trackedCompletions()
        for (target in TRACKED_COMPLETION_TARGETS) {
            tracked.getOrNull(target - 1)?.let { add(trackedAward(target, it.day)) }
        }
        addAll(habitAwards(habit, true))
        addAll(snapshot.progress.goals.filter { habit.id in snapshot.progress.goalLinks(it.id) }.mapNotNull(::goal))
        addAll(snapshot.progress.challenges.filter { habit.id in snapshot.progress.challengeLinks(it.id) }.mapNotNull(::challenge))
    }

    fun existingRecords(): List<Award> = buildList {
        // Stage C already recorded reversible XP. Recover level crossings and tracked
        // completion badges from that ledger, including marks that were later reversed.
        var xp = 0L
        var highest = 1
        val active = mutableMapOf<String, String>()
        val remaining = TRACKED_COMPLETION_TARGETS.toMutableSet()
        for (event in snapshot.progress.events) {
            xp += event.amount
            val level = levelFor(xp).level
            for (earned in highest + 1..level) add(levelAward(earned, event.day))
            highest = maxOf(highest, level)
            if (event.kind == "award") {
                active[event.completionId] = event.day
                val reached = remaining.filter { it <= active.size }
                if (reached.isNotEmpty()) {
                    val dates = active.values.sorted()
                    for (target in reached) add(trackedAward(target, dates[target - 1]))
                    remaining.removeAll(reached.toSet())
                }
            } else if (event.kind == "reverse") active.remove(event.completionId)
        }
        val trackedHabits = snapshot.trackedCompletions().mapTo(mutableSetOf()) { it.habitId }
        for (habit in snapshot.habits) addAll(habitAwards(habit, habit.id in trackedHabits))
        addAll(snapshot.progress.goals.mapNotNull(::goal))
        addAll(snapshot.progress.challenges.mapNotNull(::challenge))
    }

    private fun habitAwards(habit: LocalHabit, tracked: Boolean): List<Award> = buildList {
        val days = byHabit[habit.id].orEmpty().filter { it.day <= snapshot.today.toString() }
            .map { LocalDate.parse(it.day) }.distinct().sorted()
        for (target in listOf(7, 30)) {
            val earned = days.getOrNull(target - 1) ?: continue
            add(Award("habit-$target", habit.id, habit.name, "Logged $target completed occurrences.", earned.toString()))
        }
        val eligible = if (tracked) STREAK_TARGETS else listOf(7)
        val marks = snapshot.streakMarks(habit.id, days).toList()
        for (target in eligible) {
            val earned = marks.firstOrNull { it.length == target } ?: continue
            val label = if (target == 7) "seven" else target.toString()
            add(Award(
                "streak-$target", habit.id, habit.name,
                "Completed $label consecutive scheduled occurrences.", earned.day.toString()
            ))
        }
    }

    private fun levelAward(level: Int, day: String) =
        Award("level", level.toString(), "Level $level", "Reached level $level through earned XP.", day)

    private fun trackedAward(target: Int, day: String): Award {
        val title = if (target == 1) "1 tracked completion" else "$target tracked completions"
        return Award("tracked-completions", target.toString(), title, "Logged $target in-app habit completions.", day)
    }
}
