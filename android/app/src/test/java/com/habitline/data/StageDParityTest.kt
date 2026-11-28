package com.habitline.data

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class StageDParityTest {
    private val fixture = requireNotNull(javaClass.getResourceAsStream("/stage-d-progress-v1.json"))
        .bufferedReader().use { JsonParser.parseReader(it).asJsonObject }
    private val today = LocalDate.parse(fixture["day"].asString)
    private val habits = fixture["habits"].asJsonArray.map { it.asJsonObject }
    private val snapshot = TrackerSnapshot(
        habits = habits.map { LocalHabit(it.text("id"), "owner", it.text("name"), "★", "", "") },
        schedules = habits.flatMap { habit ->
            habit["versions"].asJsonArray.map { raw ->
                val v = raw.asJsonObject
                ScheduleRevision(
                    habit.text("id") + v.text("from"), habit.text("id"), v.text("from"), habit.text("start"),
                    v["mask"].asInt, v["points"].asDouble, v["archived"]?.asBoolean == true
                )
            }
        },
        completions = fixture["completions"].asJsonArray.map { raw ->
            val row = raw.asJsonObject
            HabitCompletion(row.text("habitId") + row.text("date"), row.text("habitId"), row.text("date"), null,
                row["pointsEarned"].asDouble, null)
        },
        widgets = emptyMap(), today = today
    )

    @Test fun periodsStreaksFocusAndLocalDatesAgreeWithWeb() {
        val analytics = ProgressAnalytics(snapshot)
        for (entry in fixture["expected"].asJsonArray) {
            val row = entry.asJsonObject
            val period = if (row.text("period") == "week") ReportPeriod.WEEK else ReportPeriod.MONTH
            val offset = row["offset"].asInt
            val dates = calendarPeriod(today, period, offset)
            assertEquals(row.text("first"), dates.first().toString())
            assertEquals(row.text("last"), dates.last().toString())
            assertEquals(row["comparisonLength"].asInt, analytics.comparison(period, offset).currentDates.size)
            val actual = analytics.period(dates.asSequence()).totals
            assertEquals(row["scheduled"].asInt, actual.scheduled)
            assertEquals(row["completed"].asInt, actual.completed)
            assertEquals(row["missed"].asInt, actual.missed)
            assertEquals(row["points"].asDouble, actual.points, 0.001)
        }
        for ((id, value) in fixture["streaks"].asJsonObject.entrySet()) {
            val streak = value.asJsonObject
            assertEquals(streak["current"].asInt, analytics.currentStreak(id))
            assertEquals(streak["longest"].asInt, analytics.longestStreak(id))
        }
        assertNull(analytics.period(sequenceOf(LocalDate.parse("2026-02-01"))).totals.rate)
        assertEquals(100, analytics.period(sequenceOf(LocalDate.parse("2026-03-03"))).daily.single().focus)
        assertEquals(1, analytics.period(sequenceOf(LocalDate.parse("2026-03-03")), "walk").totals.completed)
        assertNull(analytics.period(sequenceOf(today), "stretch").daily.single().focus)
        assertTrue(analytics.period(sequenceOf(today.plusDays(1))).daily.isEmpty())
        val short = fixture["shortMonth"].asJsonObject
        val (current, previous) = comparisonDates(LocalDate.parse(short.text("day")), ReportPeriod.MONTH)
        assertEquals(short["length"].asInt, current.size)
        assertEquals(short.text("lastPrevious"), previous.last().toString())
        for (row in fixture["zones"].asJsonArray.map { it.asJsonObject }) {
            val day = Instant.parse(row.text("utc")).atZone(ZoneId.of(row.text("zone"))).toLocalDate()
            assertEquals(row.text("date"), day.toString())
        }
    }

    @Test fun insightThresholdsUseUnroundedRatesAndRequireThreeOpportunities() {
        for (entry in fixture["movement"].asJsonArray) {
            val row = entry.asJsonObject
            fun totals(key: String): AnalyticsTotals {
                val data = row[key].asJsonArray
                return AnalyticsTotals(data[1].asInt, data[0].asInt, 0, 0.0, 0.0)
            }
            val result = row["result"].takeUnless { it.isJsonNull }?.asInt
            assertEquals(result, qualifiedMovement(totals("current"), totals("previous")))
        }
        val week = ProgressAnalytics(snapshot).insights().first { it.habitId == null && it.unit == ReportPeriod.WEEK }
        assertEquals(33, week.value)
        assertFalse(ProgressAnalytics(snapshot).insights().any { it.habitId == "walk" })
    }

    @Test fun goalAndChallengeWindowsCountKnownCompletionsOnce() {
        val goal = LocalGoal("goal", "owner", "Read and walk", "", 3, "2026-03-02", "2026-03-05", null)
        val count = PersonalChallenge("count", "owner", "Read and walk", "", "count", 2, "2026-03-02", "2026-03-05", "2026-03-02")
        val streak = PersonalChallenge("streak", "owner", "Read", "", "streak", 2, "2026-03-03", "2026-03-05", null)
        val extra = HabitCompletion("after archive", "walk", "2026-03-04", null, 1.0, null)
        val state = snapshot.copy(
            completions = snapshot.completions + snapshot.completions.first() + extra,
            progress = ProgressRecords(listOf(goal), listOf(GoalHabit("g1", goal.id, "read"), GoalHabit("g2", goal.id, "walk")),
                listOf(count, streak), listOf(ChallengeHabit("c1", count.id, "walk"), ChallengeHabit("c2", streak.id, "read")))
        )
        val calculator = TargetProgressCalculator(state)
        assertEquals(TargetProgress(4, 3, LocalDate.parse("2026-03-03")), calculator.goal(goal))
        assertEquals(TargetProgress(1, 3, null), calculator.goal(goal.copy(archivedOn = "2026-03-02")))
        assertEquals(TargetProgress(1, 2, null), calculator.challenge(count))
        assertEquals(TargetProgress(2, 2, today), calculator.challenge(streak))
        assertEquals(TargetProgress(0, 2, null), calculator.challenge(streak.copy(startDate = "2026-03-06", endDate = "2026-03-10")))
        assertEquals(2, TargetProgressCalculator(state.copy(today = LocalDate.parse("2026-03-03"))).challenge(count.copy(archivedOn = null)).value)
    }

    @Test fun targetProgressAndXpThresholdsAgreeWithBackendRoutes() {
        for (raw in fixture["targets"].asJsonArray) {
            val row = raw.asJsonObject
            val id = row.text("id")
            val links = row["habitIds"].asJsonArray.map { it.asString }
            val target = row["target"].asInt
            val start = row.text("startDate")
            val title = row.text("title")
            val actual = if (id == "goal") {
                val goal = LocalGoal(id, "owner", title, "", target, start, row.text("targetDate"), null)
                val state = snapshot.copy(progress = ProgressRecords(
                    goals = listOf(goal), goalHabits = links.map { GoalHabit(it, id, it) }
                ))
                TargetProgressCalculator(state).goal(goal)
            } else {
                val challenge = PersonalChallenge(id, "owner", title, "", row.text("mode"), target, start, row.text("endDate"), null)
                val state = snapshot.copy(progress = ProgressRecords(
                    challenges = listOf(challenge), challengeHabits = links.map { ChallengeHabit(it, id, it) }
                ))
                TargetProgressCalculator(state).challenge(challenge)
            }
            val expected = row["expected"].asJsonObject
            assertEquals(expected["value"].asInt, actual.value)
            assertEquals(expected.text("reachedOn"), actual.reachedOn.toString())
        }
        for (raw in fixture["levels"].asJsonArray) {
            val row = raw.asJsonObject
            val xp = row["xp"].asLong
            assertEquals(LevelProgress(xp, row["level"].asInt, row["threshold"].asLong, row["next"].asLong), levelFor(xp))
        }
    }

    @Test fun levelsUseTheWebTriangularThresholds() {
        assertEquals(LevelProgress(0, 1, 0, 100), levelFor(0))
        assertEquals(1, levelFor(99).level)
        assertEquals(LevelProgress(100, 2, 100, 300), levelFor(100))
        assertEquals(LevelProgress(300, 3, 300, 600), levelFor(300))
        assertEquals(LevelProgress(150, 3, 150, 300), levelFor(150, 50))
    }

    private fun JsonObject.text(key: String) = get(key).asString
}
