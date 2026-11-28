package com.habitline.ui

import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.doOnDetach
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.tabs.TabLayout
import com.habitline.R
import com.habitline.data.AnalyticsComparison
import com.habitline.data.AnalyticsPeriod
import com.habitline.data.AnalyticsTotals
import com.habitline.data.ChallengeMode
import com.habitline.data.InsightKind
import com.habitline.data.LocalHabit
import com.habitline.data.ProgressAnalytics
import com.habitline.data.ProgressInsight
import com.habitline.data.ReportPeriod
import com.habitline.data.STREAK_TARGETS
import com.habitline.data.TRACKED_COMPLETION_TARGETS
import com.habitline.data.TargetProgress
import com.habitline.data.TargetProgressCalculator
import com.habitline.data.TrackerSnapshot
import com.habitline.data.levelFor
import com.habitline.data.trackedCompletions
import com.habitline.data.xp
import com.habitline.databinding.ScreenProgressBinding
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.roundToInt

internal fun MainActivity.progressScreen(): ScreenRenderer {
    val screen = ProgressScreen(this, ScreenProgressBinding.inflate(layoutInflater, content, false))
    content.addView(screen.binding.root)
    return { snapshot, _, busy -> screen.render(snapshot, busy) }
}

private class ProgressScreen(private val activity: MainActivity, val binding: ScreenProgressBinding) {
    private val model = activity.model
    private val content get() = binding.progressContent
    private var snapshot: TrackerSnapshot? = null
    private var busy = false
    private var analyticsJob: Job? = null

    init {
        val labels = listOf(R.string.analytics, R.string.goals, R.string.rewards, R.string.challenges)
        for (label in labels) binding.progressTabs.addTab(binding.progressTabs.newTab().setText(label))
        binding.progressTabs.getTabAt(model.progressPanel.ordinal)?.select()
        binding.progressTabs.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                model.progressPanel = ProgressPanel.entries[tab.position]
                redraw(resetScroll = true)
            }
            override fun onTabUnselected(tab: TabLayout.Tab) = Unit
            override fun onTabReselected(tab: TabLayout.Tab) = Unit
        })
        binding.root.doOnDetach { analyticsJob?.cancel() }
    }

    fun render(state: TrackerSnapshot, running: Boolean) {
        val changed = snapshot != state
        val controlsChanged = running != busy
        snapshot = state
        busy = running
        if (changed || (controlsChanged && model.progressPanel in listOf(ProgressPanel.GOALS, ProgressPanel.CHALLENGES))) {
            redraw(resetScroll = false)
        }
    }

    private fun redraw(resetScroll: Boolean) {
        val state = snapshot ?: return
        analyticsJob?.cancel()
        content.removeAllViews()
        if (resetScroll) binding.progressScroll.scrollTo(0, 0)
        when (model.progressPanel) {
            ProgressPanel.ANALYTICS -> analytics(state)
            ProgressPanel.GOALS -> targets(state, false)
            ProgressPanel.REWARDS -> rewards(state)
            ProgressPanel.CHALLENGES -> targets(state, true)
        }
    }

    private fun analytics(state: TrackerSnapshot) {
        if (state.habits.isEmpty()) {
            content.line(string(R.string.report_empty_habits))
            return
        }
        val selected = state.habits.firstOrNull { it.id == model.reportHabit }
        val range = model.reportPeriod
        val filters = content.card()
        filters.action(selected?.let { label(state, it) } ?: string(R.string.all_habits), R.id.analytics_habit) {
            val choices = listOf(string(R.string.all_habits)) + state.habits.map { label(state, it) }
            choose(R.string.analytics, choices) { i ->
                model.reportHabit = state.habits.getOrNull(i - 1)?.id
                redraw(resetScroll = false)
            }
        }
        filters.action(periodLabel(range), R.id.analytics_range) {
            choose(R.string.analytics, ReportPeriod.entries.map(::periodLabel)) { i ->
                model.reportPeriod = ReportPeriod.entries[i]
                model.reportOffset = 0
                redraw(resetScroll = false)
            }
        }
        val output = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        content.addView(output, LinearLayout.LayoutParams(-1, -2))
        output.line(string(R.string.report_computing))
        val requestedOffset = model.reportOffset
        analyticsJob = activity.lifecycleScope.launch {
            try {
                val report = withContext(Dispatchers.Default) { report(state, range, selected?.id, requestedOffset) }
                output.removeAllViews()
                if (range != ReportPeriod.LIFETIME) {
                    filters.action(string(R.string.report_previous)) {
                        model.reportOffset = report.offset - 1
                        redraw(resetScroll = false)
                    }.isEnabled = report.offset > report.firstOffset
                    filters.action(string(R.string.report_next)) {
                        model.reportOffset = report.offset + 1
                        redraw(resetScroll = false)
                    }.isEnabled = report.offset < 0
                }
                showReport(output, state, range, report)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                android.util.Log.e("Habitline", "Could not calculate progress", error)
                output.removeAllViews()
                output.line(string(R.string.report_unavailable))
            }
        }
    }

    private fun report(state: TrackerSnapshot, range: ReportPeriod, id: String?, requested: Int): AnalyticsReport {
        val analytics = ProgressAnalytics(state)
        val earliest = analytics.earliestOffset(range)
        val offset = requested.coerceIn(earliest, 0)
        val selectedDates = { analytics.dates(range, offset) }
        val habits = state.habits.filter { id == null || it.id == id }
        val consistency = if (id == null) state.habits.map { habit ->
            habit to analytics.period(selectedDates(), habit.id, 0).totals
        }.filter { it.second.rate != null } else emptyList()
        val selected = analytics.period(selectedDates(), id)
        val lifetime = if (range == ReportPeriod.LIFETIME) selected else analytics.period(analytics.dates(ReportPeriod.LIFETIME), id, 0)
        return AnalyticsReport(
            selected, lifetime,
            analytics.comparison(ReportPeriod.WEEK, habitId = id), analytics.comparison(ReportPeriod.MONTH, habitId = id),
            if (range == ReportPeriod.LIFETIME) null else analytics.comparison(range, offset, id),
            habits.maxOfOrNull { analytics.currentStreak(it.id) } ?: 0,
            habits.maxOfOrNull { analytics.longestStreak(it.id) } ?: 0,
            analytics.insights(id), consistency, earliest, offset
        )
    }

    private fun showReport(output: LinearLayout, state: TrackerSnapshot, range: ReportPeriod, report: AnalyticsReport) {
        val stats = output.card()
        val totals = report.selected.totals
        val lifetime = report.lifetime.totals
        stats.line(
            if (range == ReportPeriod.LIFETIME) string(R.string.report_lifetime)
            else span(report.selected.daily.map { it.date }), heading = true
        )
        stats.line(string(R.string.report_completion, percent(totals.rate))).id = R.id.analytics_completion
        stats.line(string(R.string.report_counts, totals.completed, totals.scheduled, totals.missed))
        stats.line(string(R.string.report_points, number(totals.points), number(totals.possible), percent(totals.focus)))
        stats.line(string(R.string.report_streaks, report.currentStreak, report.longestStreak))
        stats.line(string(R.string.report_lifetime_stats, lifetime.completed, number(lifetime.points), percent(lifetime.rate)))
        stats.line(comparison(R.string.report_week_over_week, report.week))
        stats.line(comparison(R.string.report_month_over_month, report.month))
        report.matched?.let { stats.line(comparison(R.string.report_matched, it)) }
        if (totals.scheduled == 0) stats.line(string(R.string.report_no_opportunities))

        if (report.selected.daily.any { it.scheduled > 0 }) {
            val chart = output.card()
            chart.line(string(R.string.report_daily_chart), heading = true)
            if (range == ReportPeriod.LIFETIME) chart.line(string(R.string.report_recent_chart))
            chart.line(string(R.string.report_chart_legend))
            chart.addView(ProgressChart(activity, report.selected.daily, points = false), LinearLayout.LayoutParams(-1, chart.dp(132)))
            chart.line(span(report.selected.daily.map { it.date }))
            chart.line(string(R.string.report_points_chart), heading = true)
            chart.addView(ProgressChart(activity, report.selected.daily, points = true), LinearLayout.LayoutParams(-1, chart.dp(92)))
            chart.action(string(R.string.report_daily_details)) {
                val days = report.selected.daily.map {
                    string(R.string.report_day_line, it.date.display(), it.completed, it.scheduled,
                        percent(it.focus?.toDouble()), number(it.points))
                }.toTypedArray()
                MaterialAlertDialogBuilder(activity).setTitle(R.string.report_daily_details)
                    .setItems(days, null).setPositiveButton(android.R.string.ok, null).show()
            }
            chart.action(string(R.string.report_open_calendar)) { model.selectTab(Tab.CALENDAR) }
        }

        if (report.consistency.isNotEmpty()) {
            val card = output.card()
            card.line(string(R.string.report_consistency), heading = true)
            val ranked = report.consistency.sortedByDescending { it.second.rate }
            if (ranked.size > 1) card.line(string(R.string.report_high_low, ranked.first().first.name, ranked.last().first.name))
            for ((habit, details) in ranked) {
                card.action(string(R.string.report_habit_line, label(state, habit), details.completed, details.scheduled, percent(details.rate))) {
                    model.reportHabit = habit.id
                    redraw(resetScroll = true)
                }
            }
        }

        val insights = output.card()
        insights.line(string(R.string.report_insights), heading = true)
        if (report.insights.isEmpty()) insights.line(string(R.string.report_insights_empty))
        for (item in report.insights) insight(insights, state, item)
    }

    private fun insight(card: LinearLayout, state: TrackerSnapshot, insight: ProgressInsight) {
        val title = state.habits.firstOrNull { it.id == insight.habitId }?.name ?: string(R.string.all_habits)
        val label = when (insight.kind) {
            InsightKind.STREAK -> R.string.report_current_streak
            InsightKind.CONSISTENCY -> R.string.report_consistency_month
            InsightKind.MOVEMENT -> if (insight.unit == ReportPeriod.WEEK) R.string.report_week_over_week else R.string.report_month_over_month
        }
        card.line(string(R.string.report_insight_heading, title, string(label)), heading = true)
        card.line(if (insight.previousDates.isEmpty()) string(R.string.report_as_of, insight.currentDates.first().display())
            else string(R.string.report_insight_periods, span(insight.currentDates), span(insight.previousDates)))
        card.line(when (insight.kind) {
            InsightKind.STREAK -> string(R.string.report_streak_pattern, insight.value)
            InsightKind.CONSISTENCY -> string(R.string.report_occurrences, insight.value, insight.scheduled)
            InsightKind.MOVEMENT -> activity.resources.getQuantityString(
                if (insight.attention) R.plurals.report_move_down else R.plurals.report_move_up,
                abs(insight.value), abs(insight.value)
            )
        })
        if (insight.kind == InsightKind.CONSISTENCY && insight.attention) card.line(string(R.string.report_schedule_attention))
    }

    private fun targets(state: TrackerSnapshot, challenge: Boolean) {
        val calculator = TargetProgressCalculator(state)
        content.action(string(if (challenge) R.string.new_challenge else R.string.new_goal), R.id.progress_add) {
            if (challenge) model.openChallenge(state) else model.openGoal(state)
        }.isEnabled = !busy
        if (challenge) content.line(string(R.string.local_challenges_notice))
        val rows = if (challenge) {
            state.progress.challenges.map {
                TargetRow(it.id, it.title, it.description, it.startDate, it.endDate, it.archivedOn,
                    state.progress.challengeLinks(it.id), calculator.challenge(it), it.kind) { model.openChallenge(state, it) }
            }
        } else state.progress.goals.map {
            TargetRow(it.id, it.title, it.description, it.startDate, it.targetDate, it.archivedOn,
                state.progress.goalLinks(it.id), calculator.goal(it), null) { model.openGoal(state, it) }
        }
        if (rows.isEmpty()) content.line(string(if (challenge) R.string.challenges_empty else R.string.goals_empty))
        val today = state.today.toString()
        val sections = rows.groupBy {
            when {
                it.archived != null -> R.string.target_section_history
                it.progress.complete -> R.string.target_section_complete
                it.end != null && it.end < today -> R.string.target_section_history
                else -> R.string.target_section_active
            }
        }
        for (heading in listOf(R.string.target_section_active, R.string.target_section_complete, R.string.target_section_history)) {
            val entries = sections[heading] ?: continue
            content.line(string(heading), heading = true)
            for (row in entries) targetCard(state, row, challenge)
        }
    }

    private fun targetCard(state: TrackerSnapshot, row: TargetRow, challenge: Boolean) {
        val card = content.card()
        val today = state.today.toString()
        card.line(row.title, heading = true)
        if (row.description.isNotBlank()) card.line(row.description)
        card.line(string(R.string.report_range, LocalDate.parse(row.start).display(),
            row.end?.let { LocalDate.parse(it).display() } ?: string(R.string.report_dash)))
        if (challenge) card.line(string(if (row.mode == ChallengeMode.STREAK.key) R.string.challenge_streak else R.string.challenge_count))
        card.line(string(R.string.target_progress_display, row.progress.value, row.progress.target, percent(row.progress.percent.toDouble())))
        card.meter(row.progress.percent)
        row.progress.reachedOn?.let { card.line(string(R.string.target_completed_on, it.display())) }
        when {
            row.archived != null -> card.line(string(R.string.target_archived))
            row.start > today -> card.line(string(R.string.target_upcoming))
            row.end != null && row.end < today -> card.line(string(R.string.target_ended))
        }
        val names = state.habits.filter { it.id in row.links }.joinToString(", ") { label(state, it) }
        card.line(if (names.isEmpty()) string(R.string.target_no_links) else string(R.string.target_link_names, names))
        card.action(string(if (challenge) R.string.edit_challenge else R.string.edit_goal)) { row.edit() }.isEnabled = !busy
        card.action(string(if (row.archived != null) R.string.target_restore else R.string.target_archive)) {
            model.archiveTarget(row.id, challenge, row.archived == null)
        }.isEnabled = !busy
        card.action(string(R.string.delete)) {
            MaterialAlertDialogBuilder(activity).setTitle(R.string.delete)
                .setMessage(string(R.string.target_delete_message, row.title))
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.delete) { _, _ -> model.deleteTarget(row.id, challenge) }.show()
        }.isEnabled = !busy
    }

    private fun rewards(state: TrackerSnapshot) {
        val level = levelFor(state.progress.xp())
        val card = content.card()
        card.line(string(R.string.rewards_level, level.level), heading = true).id = R.id.rewards_level
        card.line(string(R.string.rewards_xp, number(level.xp), number(level.nextLevelAt - level.xp), level.level + 1))
        card.meter(((level.xp - level.threshold) * 100 / (level.nextLevelAt - level.threshold)).toInt())

        val next = content.card()
        next.line(string(R.string.rewards_next), heading = true)
        val earned = state.progress.milestones.mapTo(mutableSetOf()) { it.kind to it.subjectId }
        val upcoming = TRACKED_COMPLETION_TARGETS.firstOrNull { ("tracked-completions" to it.toString()) !in earned }
        if (upcoming == null) next.line(string(R.string.rewards_all_reached))
        else next.line(string(R.string.rewards_next_tracked, state.trackedCompletions().size, upcoming))
        for (habit in state.habits.filterNot { state.latestSchedule(it.id)?.archived == true }) {
            val target = STREAK_TARGETS.firstOrNull { ("streak-$it" to habit.id) !in earned } ?: continue
            next.line(string(R.string.rewards_next_streak, habit.name, state.streak(habit.id), target))
        }

        val awards = content.card()
        awards.line(string(R.string.rewards_achievements), heading = true)
        if (state.progress.milestones.isEmpty()) awards.line(string(R.string.rewards_empty))
        for (milestone in state.progress.milestones) {
            awards.line(milestone.title, heading = true)
            awards.line(milestone.description)
            awards.line(LocalDate.parse(milestone.earnedOn).display())
        }
        val history = content.card()
        history.line(string(R.string.rewards_history), heading = true)
        if (state.progress.events.isEmpty()) history.line(string(R.string.rewards_none))
        for (event in state.progress.events.asReversed().take(25)) {
            val habit = state.habits.firstOrNull { it.id == event.habitId }?.name ?: string(R.string.rewards_deleted_habit)
            val kind = if (event.kind == "award") R.string.rewards_event_award else R.string.rewards_event_reverse
            history.line(string(R.string.rewards_event, string(kind), event.amount, habit, LocalDate.parse(event.day).display()))
        }
    }

    private fun choose(title: Int, labels: List<String>, selected: (Int) -> Unit) {
        MaterialAlertDialogBuilder(activity).setTitle(title).setItems(labels.toTypedArray()) { _, which -> selected(which) }.show()
    }

    private fun label(state: TrackerSnapshot, habit: LocalHabit) =
        if (state.latestSchedule(habit.id)?.archived == true) string(R.string.archived_habit_name, habit.name) else habit.name

    private fun span(dates: List<LocalDate>): String = if (dates.isEmpty()) string(R.string.report_dash)
        else string(R.string.report_range, dates.first().display(), dates.last().display())

    private fun comparison(label: Int, result: AnalyticsComparison): String = string(
        R.string.report_comparison, string(label),
        result.change?.roundToInt()?.let {
            activity.resources.getQuantityString(R.plurals.report_change, abs(it), it)
        } ?: string(R.string.report_insufficient)
    )

    private fun periodLabel(period: ReportPeriod) = string(when (period) {
        ReportPeriod.WEEK -> R.string.report_week
        ReportPeriod.MONTH -> R.string.report_month
        ReportPeriod.LIFETIME -> R.string.report_lifetime
    })

    private fun percent(value: Double?) = value?.let { string(R.string.report_percent, it.roundToInt()) } ?: string(R.string.report_dash)
    private fun number(value: Number) = NumberFormat.getNumberInstance().apply { maximumFractionDigits = 2 }.format(value)
    private fun string(id: Int, vararg args: Any) = activity.getString(id, *args)
}

private data class AnalyticsReport(
    val selected: AnalyticsPeriod, val lifetime: AnalyticsPeriod, val week: AnalyticsComparison,
    val month: AnalyticsComparison, val matched: AnalyticsComparison?, val currentStreak: Int, val longestStreak: Int,
    val insights: List<ProgressInsight>, val consistency: List<Pair<LocalHabit, AnalyticsTotals>>,
    val firstOffset: Int, val offset: Int
)

private data class TargetRow(
    val id: String, val title: String, val description: String, val start: String, val end: String?,
    val archived: String?, val links: Set<String>, val progress: TargetProgress, val mode: String?, val edit: () -> Unit
)

private fun LinearLayout.card(): LinearLayout {
    val shell = MaterialCardView(context).apply {
        radius = dp(16).toFloat()
        cardElevation = 0f
        strokeWidth = dp(1)
        strokeColor = context.getColor(R.color.app_outline)
        setCardBackgroundColor(context.getColor(R.color.app_surface))
    }
    addView(shell, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12) })
    val padding = dp(16)
    return LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(padding, padding, padding, padding)
        shell.addView(this)
    }
}

private fun LinearLayout.line(label: CharSequence, heading: Boolean = false): TextView = TextView(context).apply {
    text = label
    setTextAppearance(if (heading) R.style.Habitline_Section else R.style.Habitline_Body)
    ViewCompat.setAccessibilityHeading(this, heading)
    this@line.addView(this, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(6) })
}

private fun LinearLayout.action(label: String, viewId: Int = View.NO_ID, click: () -> Unit): MaterialButton =
    MaterialButton(context).apply {
        id = viewId
        text = label
        setAllCaps(false)
        minHeight = dp(48)
        setOnClickListener { click() }
        this@action.addView(this, LinearLayout.LayoutParams(-1, -2))
    }

private fun LinearLayout.meter(percent: Int) {
    val view = LinearProgressIndicator(context).apply {
        max = 100
        progress = percent
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    addView(view, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) })
}
