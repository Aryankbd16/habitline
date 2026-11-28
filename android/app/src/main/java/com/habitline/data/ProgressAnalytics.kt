package com.habitline.data

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlin.math.roundToInt

enum class ReportPeriod { WEEK, MONTH, LIFETIME }

internal fun dateRange(start: LocalDate, end: LocalDate): Sequence<LocalDate> =
    generateSequence(start) { if (it < end) it.plusDays(1) else null }.takeWhile { it <= end }

fun calendarPeriod(today: LocalDate, unit: ReportPeriod, offset: Int = 0): List<LocalDate> {
    require(unit != ReportPeriod.LIFETIME)
    val start = if (unit == ReportPeriod.WEEK) {
        today.minusDays(today.dayOfWeek.value - 1L).plusWeeks(offset.toLong())
    } else today.withDayOfMonth(1).plusMonths(offset.toLong())
    val end = if (unit == ReportPeriod.WEEK) start.plusDays(6) else start.plusMonths(1).minusDays(1)
    return dateRange(start, minOf(today, end)).toList()
}

fun comparisonDates(today: LocalDate, unit: ReportPeriod, offset: Int = 0): Pair<List<LocalDate>, List<LocalDate>> {
    val current = calendarPeriod(today, unit, offset)
    val previous = calendarPeriod(today, unit, offset - 1)
    val length = minOf(current.size, previous.size)
    return current.take(length) to previous.take(length)
}

data class AnalyticsDay(
    val date: LocalDate, val scheduled: Int, val completed: Int, val points: Double,
    val possible: Double, val focus: Int?
) {
    val rate: Double? get() = if (scheduled == 0) null else completed.toDouble() / scheduled * 100
}

data class AnalyticsTotals(
    val scheduled: Int, val completed: Int, val missed: Int, val points: Double, val possible: Double
) {
    val rate: Double? get() = if (scheduled == 0) null else completed.toDouble() / scheduled * 100
    val focus: Double? get() = if (possible == 0.0) null else points / possible * 100
}

data class AnalyticsPeriod(val totals: AnalyticsTotals, val daily: List<AnalyticsDay>)

data class StreakMark(val day: LocalDate, val length: Int)

internal fun TrackerSnapshot.streakMarks(habitId: String, dates: Iterable<LocalDate>): Sequence<StreakMark> = sequence {
    val done = dates.filter { it <= today }.toSortedSet()
    if (done.isEmpty()) return@sequence
    var length = 0
    for (day in dateRange(done.first(), done.last())) {
        if (day in done) yield(StreakMark(day, ++length))
        else if (schedule(habitId, day).scheduledOn(day)) length = 0
    }
}

data class AnalyticsComparison(
    val currentDates: List<LocalDate>, val previousDates: List<LocalDate>,
    val current: AnalyticsTotals, val previous: AnalyticsTotals
) {
    val change: Double? get() = current.rate?.let { now -> previous.rate?.let { now - it } }
}

enum class InsightKind { MOVEMENT, CONSISTENCY, STREAK }

data class ProgressInsight(
    val habitId: String?, val kind: InsightKind, val unit: ReportPeriod?,
    val currentDates: List<LocalDate>, val previousDates: List<LocalDate> = emptyList(),
    val value: Int = 0, val scheduled: Int = 0, val attention: Boolean = false
)

fun qualifiedMovement(current: AnalyticsTotals, previous: AnalyticsTotals): Int? {
    if (minOf(current.scheduled, previous.scheduled) < 3) return null
    val movement = current.completed.toLong() * previous.scheduled - previous.completed.toLong() * current.scheduled
    val opportunities = current.scheduled.toLong() * previous.scheduled
    // Compare integer cross products before rounding. Ceiling division avoids a multiplied numerator.
    if (abs(movement) < (opportunities + 9) / 10) return null
    return (movement.toDouble() / opportunities * 100).roundToInt()
}

class ProgressAnalytics(private val snapshot: TrackerSnapshot) {
    private data class Opportunity(val earned: Double, val possible: Double, val scheduledPoints: Double, val done: Boolean)

    private val habits = snapshot.habits.mapTo(mutableSetOf()) { it.id }
    private val byHabit = snapshot.completions.filter { it.day <= snapshot.today.toString() && it.habitId in habits }
        .groupBy { it.habitId }.mapValues { (_, rows) -> rows.associateBy { LocalDate.parse(it.day) } }
    private val cache = object : LinkedHashMap<LocalDate, List<Opportunity>>(128, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<LocalDate, List<Opportunity>>) = size > 128
    }
    private val streaks = mutableMapOf<String, List<StreakMark>>()
    private val first = minOf(
        snapshot.today,
        snapshot.schedules.minOfOrNull { LocalDate.parse(it.startDate) } ?: snapshot.today,
        byHabit.values.mapNotNull { it.keys.minOrNull() }.minOrNull() ?: snapshot.today
    )

    fun dates(unit: ReportPeriod, offset: Int = 0): Sequence<LocalDate> =
        if (unit == ReportPeriod.LIFETIME) dateRange(first, snapshot.today)
        else calendarPeriod(snapshot.today, unit, offset).asSequence()

    fun earliestOffset(unit: ReportPeriod): Int = when (unit) {
        ReportPeriod.WEEK -> (ChronoUnit.DAYS.between(
            snapshot.today.minusDays(snapshot.today.dayOfWeek.value - 1L), first.minusDays(first.dayOfWeek.value - 1L)
        ) / 7).toInt()
        ReportPeriod.MONTH -> ChronoUnit.MONTHS.between(snapshot.today.withDayOfMonth(1), first.withDayOfMonth(1)).toInt()
        ReportPeriod.LIFETIME -> 0
    }

    private fun day(date: LocalDate, habitId: String?): AnalyticsDay {
        val eligible = if (habitId == null) cache.getOrPut(date) { habits.mapNotNull { opportunity(it, date) } }
        else listOfNotNull(if (habitId in habits) opportunity(habitId, date) else null)
        val completed = eligible.count { it.done }
        val earned = eligible.sumOf { it.earned }
        val possible = eligible.sumOf { it.possible }
        val focus = if (habitId != null) {
            // Individual daily focus uses the schedule's points in web progress.js.
            if (eligible.firstOrNull()?.scheduledPoints?.let { it != 0.0 } == true) {
                if (completed == 0) 0 else 100
            } else null
        } else if (possible != 0.0) (earned / possible * 100).roundToInt() else null
        return AnalyticsDay(date, eligible.size, completed, earned, possible, focus)
    }

    private fun opportunity(habit: String, date: LocalDate): Opportunity? {
        val recorded = byHabit[habit]?.get(date)
        val schedule = snapshot.schedule(habit, date)
        // A persisted mark represents a known opportunity even without a matching schedule.
        if (recorded == null && !schedule.scheduledOn(date)) return null
        val points = schedule?.points ?: snapshot.latestSchedule(habit)?.points ?: 0.0
        return Opportunity(recorded?.pointsEarned ?: 0.0, recorded?.pointsEarned ?: points, points, recorded != null)
    }

    fun period(dates: Sequence<LocalDate>, habitId: String? = null, chartLimit: Int = 90): AnalyticsPeriod {
        var scheduled = 0
        var completed = 0
        var missed = 0
        var points = 0.0
        var possible = 0.0
        val daily = ArrayDeque<AnalyticsDay>()
        for (date in dates) {
            if (date > snapshot.today) continue
            val row = day(date, habitId)
            scheduled += row.scheduled
            completed += row.completed
            if (date < snapshot.today) missed += row.scheduled - row.completed
            points += row.points
            possible += row.possible
            if (chartLimit > 0) {
                if (daily.size == chartLimit) daily.removeFirst()
                daily.addLast(row)
            }
        }
        return AnalyticsPeriod(AnalyticsTotals(scheduled, completed, missed, points, possible), daily.toList())
    }

    fun comparison(unit: ReportPeriod, offset: Int = 0, habitId: String? = null): AnalyticsComparison {
        val (now, previous) = comparisonDates(snapshot.today, unit, offset)
        return AnalyticsComparison(
            now, previous, period(now.asSequence(), habitId, 0).totals, period(previous.asSequence(), habitId, 0).totals
        )
    }

    fun currentStreak(habitId: String) = snapshot.streak(habitId)

    fun longestStreak(habitId: String): Int = streaks.getOrPut(habitId) {
        snapshot.streakMarks(habitId, byHabit[habitId]?.keys.orEmpty()).toList()
    }.maxOfOrNull { it.length } ?: 0

    fun insights(habitId: String? = null): List<ProgressInsight> = buildList {
        val habits = snapshot.habits.filter { habitId == null || it.id == habitId }
        val subjects = habits.filterNot { snapshot.latestSchedule(it.id)?.archived == true }.map { it.id }
        val comparisons = if (habitId == null) listOf(null) + subjects else subjects
        val observed = mutableSetOf<Triple<String?, List<LocalDate>, List<LocalDate>>>()
        for (unit in listOf(ReportPeriod.WEEK, ReportPeriod.MONTH)) {
            for (id in comparisons) {
                val span = comparison(unit, habitId = id)
                if (minOf(span.current.scheduled, span.previous.scheduled) < 3) continue
                val key = Triple(id, span.currentDates, span.previousDates)
                if (key in observed) continue
                val movement = qualifiedMovement(span.current, span.previous)
                val rate = requireNotNull(span.current.rate)
                val insight = when {
                    movement != null -> ProgressInsight(id, InsightKind.MOVEMENT, unit, span.currentDates,
                        span.previousDates, movement, attention = movement < 0)
                    id != null && unit == ReportPeriod.MONTH && (rate >= 80 || rate <= 40) ->
                        ProgressInsight(id, InsightKind.CONSISTENCY, unit, span.currentDates,
                            span.previousDates, span.current.completed, span.current.scheduled, rate <= 40)
                    else -> null
                }
                if (insight != null) {
                    observed.add(key)
                    add(insight)
                }
            }
        }
        for (habit in habits) {
            val streak = currentStreak(habit.id)
            if (streak >= 7) add(ProgressInsight(habit.id, InsightKind.STREAK, null, listOf(snapshot.today), value = streak))
        }
    }
}
