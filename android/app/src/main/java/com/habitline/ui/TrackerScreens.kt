package com.habitline.ui

import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.graphics.ColorUtils
import androidx.core.view.isVisible
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.habitline.R
import com.habitline.data.CalendarDay
import com.habitline.data.DAILY_MASK
import com.habitline.data.DayProgress
import com.habitline.data.HABIT_LINK_TYPES
import com.habitline.data.HabitInput
import com.habitline.data.LocalHabit
import com.habitline.data.TrackerSnapshot
import com.habitline.databinding.ItemHabitBinding
import com.habitline.databinding.ScreenCalendarBinding
import com.habitline.databinding.ScreenDashboardBinding
import com.habitline.databinding.ScreenDetailBinding
import com.habitline.databinding.ScreenHabitsBinding
import java.text.NumberFormat
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.roundToInt

internal fun View.dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()
internal fun LocalDate.display(style: FormatStyle = FormatStyle.MEDIUM): String =
    format(DateTimeFormatter.ofLocalizedDate(style))

private fun LocalHabit.categoryLabel() = category.ifBlank { "General" }

private fun MainActivity.scheduleLabel(mask: Int?): String = when (mask) {
    DAILY_MASK -> getString(R.string.daily)
    null -> ""
    else -> DayOfWeek.values().filter { (mask and (1 shl (it.value % 7))) != 0 }
        .joinToString(", ") { it.getDisplayName(TextStyle.SHORT, Locale.getDefault()) }
}

internal typealias ScreenRenderer = (TrackerSnapshot, LocalDateTime, Boolean) -> Unit

internal fun MainActivity.dashboardScreen(): ScreenRenderer {
    val binding = ScreenDashboardBinding.inflate(layoutInflater, content, false)
    content.addView(binding.root)
    var lastSnapshot: TrackerSnapshot? = null
    var buttons = emptyList<View>()
    return { state, now, busy ->
        val greeting = getString(when (now.hour) {
            in 5..11 -> R.string.good_morning
            in 12..17 -> R.string.good_afternoon
            else -> R.string.good_evening
        })
        binding.greeting.text = if (state.settings.name.isBlank()) greeting
            else getString(R.string.greeting_name, greeting, state.settings.name)
        binding.fabAdd.isEnabled = !busy
        if (state != lastSnapshot) {
            lastSnapshot = state
            binding.todayDate.text = state.today.display(FormatStyle.FULL)
            binding.fabAdd.setOnClickListener { model.openEditor(state) }
            val today = state.day(state.today)
            binding.dailyPercent.text = today.percent?.let { NumberFormat.getPercentInstance().format(it / 100.0) }.orEmpty()
            binding.dailyRing.setProgressCompat(today.percent ?: 0, true)
            binding.dailyRing.isVisible = today.percent != null
            (binding.dailyRing.parent as View).isVisible = today.percent != null
            binding.dailyTotals.text = if (today.scheduled == 0) getString(R.string.no_scheduled_today)
                else getString(R.string.daily_totals, today.scheduled, today.completedScheduled, today.remaining)
            binding.emptyState.isVisible = state.habits.isEmpty()
            binding.emptyState.setText(R.string.no_habits_dashboard)

            binding.habitRows.removeAllViews()
            buttons = today.occurrences.filter { it.scheduled }
                .sortedBy { HabitInput.priorities.indexOf(it.habit.priority) }.map { occurrence ->
                    val habit = occurrence.habit
                    val row = HabitRow(habit, habit.categoryLabel(), occurrence.completion != null)
                    addHabitRow(binding.habitRows, row, state.today).checkButton
                }
            val recent = (0L..6L).map { state.day(state.today.minusDays(it)) }
            val scheduled = recent.sumOf { it.scheduled }
            binding.weeklySummary.text = if (scheduled == 0) getString(R.string.weekly_empty)
                else getString(R.string.weekly_summary, recent.sumOf { it.completedScheduled }, scheduled)
            val best = state.habits.maxOfOrNull { state.streak(it.id) } ?: 0
            binding.streakSummary.isVisible = best > 0
            binding.streakSummary.text = resources.getQuantityString(R.plurals.best_streak, best, best)
            val last = state.completions.asSequence().filter { it.day <= state.today.toString() }
                .maxWithOrNull(compareBy({ it.day }, { it.completedAt.orEmpty() }))
            val habit = last?.let { completion -> state.habits.find { it.id == completion.habitId } }
            binding.recentCompletion.text = if (habit == null || last == null) getString(R.string.no_completions)
                else getString(R.string.recent_completion, habit.name, LocalDate.parse(last.day).display())
        }
        buttons.forEach { it.isEnabled = !busy }
    }
}

internal fun MainActivity.habitsScreen(): ScreenRenderer {
    val binding = ScreenHabitsBinding.inflate(layoutInflater, content, false)
    content.addView(binding.root)
    val adapter = HabitListAdapter(model::openHabit)
    binding.habitList.layoutManager = LinearLayoutManager(this)
    binding.habitList.adapter = adapter
    var current: TrackerSnapshot? = null
    var busy = false

    fun updateList() {
        val state = current ?: return
        val archived = model.showArchived
        binding.activeHabits.isEnabled = archived
        binding.archivedHabits.isEnabled = !archived
        binding.activeHabits.isSelected = !archived
        binding.archivedHabits.isSelected = archived
        val rows = state.habits.filter { (state.latestSchedule(it.id)?.archived == true) == archived }.map {
            HabitRow(it, getString(R.string.meta_pair, it.categoryLabel(), scheduleLabel(state.latestSchedule(it.id)?.weekdayMask)))
        }
        binding.habitsEmpty.isVisible = rows.isEmpty()
        binding.habitsEmpty.setText(if (archived) R.string.empty_archived else R.string.empty_active)
        binding.newHabit.isEnabled = !busy
        adapter.submitList(rows)
    }

    binding.activeHabits.setOnClickListener { model.showArchived = false; updateList() }
    binding.archivedHabits.setOnClickListener { model.showArchived = true; updateList() }
    binding.newHabit.setOnClickListener { current?.let { model.openEditor(it) } }
    return { state, _, running ->
        if (current != state || busy != running) {
            current = state
            busy = running
            updateList()
        }
    }
}

internal fun MainActivity.detailScreen(id: String): ScreenRenderer {
    val binding = ScreenDetailBinding.inflate(layoutInflater, content, false)
    content.addView(binding.root)
    return render@{ state, _, busy ->
        val habit = state.habits.find { it.id == id }
        val schedule = state.latestSchedule(id)
        if (habit == null || schedule == null) {
            binding.detailName.setText(R.string.habit_unavailable)
            listOf(binding.detailStatus, binding.detailDescription, binding.detailSchedule, binding.detailStart,
                binding.detailPoints, binding.editHabit, binding.habitAnalytics, binding.archiveHabit, binding.deleteHabit,
                binding.relationshipCard).forEach { it.isVisible = false }
            binding.detailHistory.setText(R.string.no_completions)
            return@render
        }
        binding.detailName.text = getString(R.string.habit_row, habit.icon, habit.name)
        val category = getString(R.string.meta_pair, habit.categoryLabel(), priorityLabel(habit.priority))
        binding.detailStatus.text = if (schedule.archived) getString(R.string.meta_pair, category, getString(R.string.archived)) else category
        binding.detailDescription.text = habit.description
        binding.detailDescription.isVisible = habit.description.isNotBlank()
        binding.detailSchedule.text = scheduleLabel(schedule.weekdayMask)
        binding.detailSchedule.setPadding(0, if (habit.description.isBlank()) 0 else binding.root.dp(12), 0, 0)
        binding.detailStart.text = getString(R.string.start_date, LocalDate.parse(schedule.startDate).display())
        val points = NumberFormat.getNumberInstance().apply { maximumFractionDigits = 340 }.format(schedule.points)
        binding.detailPoints.text = getString(R.string.points_and_xp_display, points, habit.xpValue)
        val history = state.completions.asReversed().asSequence()
            .filter { it.habitId == id && it.day <= state.today.toString() }.take(7)
            .joinToString("\n") { LocalDate.parse(it.day).display() }
        binding.detailHistory.text = history.ifEmpty { getString(R.string.no_completions) }
        showRelationships(binding, state, id, busy)
        binding.editHabit.isEnabled = !busy
        binding.archiveHabit.isEnabled = !busy
        binding.deleteHabit.isEnabled = !busy
        binding.archiveHabit.setText(if (schedule.archived) R.string.restore_habit else R.string.archive_habit)
        binding.editHabit.setOnClickListener { model.openEditor(state, habit) }
        binding.habitAnalytics.isEnabled = !busy
        binding.habitAnalytics.setOnClickListener { model.openAnalytics(habit.id) }
        binding.archiveHabit.setOnClickListener {
            if (schedule.archived) model.setArchived(id, false)
            else MaterialAlertDialogBuilder(this)
                .setTitle(R.string.archive_habit_title)
                .setMessage(getString(R.string.archive_habit_message, habit.name))
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.archive) { _, _ -> model.setArchived(id, true) }
                .show()
        }
        binding.deleteHabit.setOnClickListener {
            MaterialAlertDialogBuilder(this)
                .setTitle(R.string.delete_habit_title)
                .setMessage(getString(R.string.delete_habit_message, habit.name))
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.delete) { _, _ -> model.deleteHabit(id) }
                .show()
        }
    }
}

private fun MainActivity.showRelationships(binding: ScreenDetailBinding, state: TrackerSnapshot, id: String, busy: Boolean) {
    val links = state.links.filter { it.habitId == id || it.relatedHabitId == id }
    val connected = links.map { if (it.habitId == id) it.relatedHabitId else it.habitId }.toSet()
    val choices = state.habits.filter { it.id != id && it.id !in connected && state.latestSchedule(it.id)?.archived == false }
    binding.relationshipRows.removeAllViews()
    for (link in links) {
        val other = if (link.habitId == id) link.relatedHabitId else link.habitId
        val partner = state.habits.find { it.id == other } ?: continue
        val button = MaterialButton(this).apply {
            text = getString(R.string.meta_pair, partner.name, link.kind)
            setAllCaps(false)
            contentDescription = getString(R.string.remove_relationship, partner.name)
            minHeight = dp(48)
            isEnabled = !busy
            setOnClickListener {
                MaterialAlertDialogBuilder(this@showRelationships)
                    .setTitle(getString(R.string.remove_relationship, partner.name))
                    .setNegativeButton(R.string.cancel, null)
                    .setPositiveButton(R.string.remove) { _, _ -> model.unlinkHabits(link.id) }.show()
            }
        }
        binding.relationshipRows.addView(button)
    }
    binding.relationshipCard.isVisible = links.isNotEmpty() || choices.isNotEmpty()
    binding.addRelationship.isVisible = choices.isNotEmpty()
    binding.addRelationship.isEnabled = !busy
    binding.addRelationship.setOnClickListener {
        MaterialAlertDialogBuilder(this).setTitle(R.string.choose_related_habit)
            .setItems(choices.map { getString(R.string.habit_row, it.icon, it.name) }.toTypedArray()) { _, which ->
                val selection = choices[which]
                MaterialAlertDialogBuilder(this).setTitle(R.string.choose_relationship_type)
                    .setItems(HABIT_LINK_TYPES.toTypedArray()) { _, kind ->
                        model.linkHabits(id, selection.id, HABIT_LINK_TYPES[kind])
                    }.setNegativeButton(R.string.cancel, null).show()
            }.setNegativeButton(R.string.cancel, null).show()
    }
}

internal fun MainActivity.calendarScreen(): ScreenRenderer {
    val binding = ScreenCalendarBinding.inflate(layoutInflater, content, false)
    content.addView(binding.root)
    var current: TrackerSnapshot? = null
    var busy = false
    var buttons = emptyList<View>()

    fun draw() {
        val state = current ?: return
        val selected = model.calendarDate ?: state.today
        val month = YearMonth.from(selected)
        binding.monthLabel.text = month.format(DateTimeFormatter.ofPattern("LLLL uuuu"))
        binding.previousMonth.isEnabled = month > YearMonth.of(1, 1)
        binding.nextMonth.isEnabled = month < YearMonth.of(9999, 12)
        binding.monthGrid.removeAllViews()
        val days = cellsRow(binding.monthGrid)
        for (weekday in DayOfWeek.values()) {
            val header = TextView(this).apply {
                text = weekday.getDisplayName(TextStyle.NARROW_STANDALONE, Locale.getDefault())
                contentDescription = weekday.getDisplayName(TextStyle.FULL, Locale.getDefault())
                gravity = Gravity.CENTER
                setTextColor(getColor(R.color.app_muted))
            }
            days.addView(header, LinearLayout.LayoutParams(0, header.dp(28), 1f))
        }
        for (week in state.month(month).chunked(7)) {
            val row = cellsRow(binding.monthGrid)
            for (day in week) {
                val cell = if (day == null) View(this) else calendarCell(day, selected, state.today) {
                    model.calendarDate = it
                    draw()
                }
                val height = maxOf(cell.dp(48), (cell.dp(35) * resources.configuration.fontScale).roundToInt())
                row.addView(cell, LinearLayout.LayoutParams(0, height, 1f).apply {
                    setMargins(cell.dp(1), cell.dp(1), cell.dp(1), cell.dp(1))
                })
            }
        }
        val progress = state.day(selected)
        binding.calendarDate.text = selected.display(FormatStyle.FULL)
        binding.calendarSummary.text = calendarSummary(progress, selected > state.today)
        binding.calendarRows.removeAllViews()
        buttons = progress.occurrences.map { occurrence ->
            val done = occurrence.completion != null
            val status = when {
                done && !occurrence.scheduled -> R.string.recorded_completion
                done -> R.string.complete_status
                selected < state.today -> R.string.missed_status
                else -> R.string.scheduled_status
            }
            val habit = occurrence.habit
            val row = HabitRow(habit, getString(R.string.meta_pair, habit.categoryLabel(), getString(status)),
                if (selected == state.today) done else null)
            addHabitRow(binding.calendarRows, row, selected).checkButton.also { it.isEnabled = !busy }
        }
    }

    fun shift(months: Long) {
        val day = model.calendarDate ?: current?.today ?: return
        model.calendarDate = day.plusMonths(months)
        draw()
    }
    binding.previousMonth.setOnClickListener { shift(-1) }
    binding.nextMonth.setOnClickListener { shift(1) }
    binding.showToday.setOnClickListener {
        model.calendarDate = null
        draw()
    }
    return { state, _, running ->
        busy = running
        if (current != state) {
            current = state
            draw()
        }
        buttons.forEach { it.isEnabled = !running }
    }
}

private fun MainActivity.calendarSummary(progress: DayProgress, future: Boolean): String = when {
    progress.occurrences.isEmpty() -> getString(R.string.calendar_no_activity)
    future -> getString(R.string.calendar_scheduled_count, progress.scheduled)
    progress.scheduled == 0 -> getString(R.string.calendar_completed_count, progress.completed)
    else -> getString(R.string.calendar_counts, progress.completedScheduled, progress.scheduled)
}

private fun MainActivity.cellsRow(grid: LinearLayout) = LinearLayout(this).also { grid.addView(it) }

private fun MainActivity.calendarCell(day: CalendarDay, selected: LocalDate, today: LocalDate, select: (LocalDate) -> Unit): View {
    val (mark, fill) = when {
        day.completed > 0 && day.completedScheduled == day.scheduled -> "✓" to R.color.calendar_done
        day.completed > 0 -> "◐" to R.color.calendar_partial
        day.scheduled > 0 -> "○" to R.color.calendar_scheduled
        else -> "" to R.color.app_surface
    }
    return TextView(this).apply {
        val dayNumber = NumberFormat.getIntegerInstance().format(day.date.dayOfMonth)
        text = if (mark.isEmpty()) dayNumber else getString(R.string.calendar_cell_status, dayNumber, mark)
        textSize = 14f
        gravity = Gravity.CENTER
        includeFontPadding = false
        setTextColor(getColor(R.color.app_text))
        isFocusable = true
        isSelected = day.date == selected
        if (day.date == today) setTypeface(typeface, Typeface.BOLD)
        val shape = GradientDrawable().apply {
            cornerRadius = dp(8).toFloat()
            setColor(getColor(fill))
            if (day.date == selected) setStroke(dp(2), getColor(R.color.app_primary))
        }
        val ripple = ColorUtils.setAlphaComponent(getColor(R.color.app_primary), 42)
        background = RippleDrawable(ColorStateList.valueOf(ripple), shape, null)
        val summary = when {
            day.scheduled == 0 && day.completed == 0 -> getString(R.string.calendar_no_activity)
            day.future -> getString(R.string.calendar_scheduled_count, day.scheduled)
            day.scheduled == 0 -> getString(R.string.calendar_completed_count, day.completed)
            else -> getString(R.string.calendar_counts, day.completedScheduled, day.scheduled)
        }
        contentDescription = getString(R.string.calendar_day_description, day.date.display(FormatStyle.FULL), summary)
        setOnClickListener { select(day.date) }
    }
}

private data class HabitRow(val habit: LocalHabit, val subtitle: String, val done: Boolean? = null)

private fun MainActivity.addHabitRow(parent: LinearLayout, row: HabitRow, date: LocalDate): ItemHabitBinding {
    val item = ItemHabitBinding.inflate(layoutInflater, parent, false)
    parent.addView(item.root)
    item.bindRow(row, model::openHabit)
    row.done?.let { done -> item.checkButton.setOnClickListener { model.setCompleted(row.habit.id, date, !done) } }
    return item
}

private fun ItemHabitBinding.bindRow(row: HabitRow, open: (String) -> Unit) {
    val context = root.context
    habitName.text = context.getString(R.string.habit_row, row.habit.icon, row.habit.name)
    habitMeta.text = row.subtitle
    habitDetail.setOnClickListener { open(row.habit.id) }
    checkButton.isVisible = row.done != null
    checkButton.isSelected = row.done == true
    checkButton.setImageResource(if (row.done == true) R.drawable.ic_core_done else R.drawable.ic_core_pending)
    checkButton.contentDescription = context.getString(if (row.done == true) R.string.undo_habit else R.string.mark_habit, row.habit.name)
}

private class HabitListAdapter(private val open: (String) -> Unit) : ListAdapter<HabitRow, HabitListAdapter.Holder>(Diff) {
    class Holder(val binding: ItemHabitBinding) : RecyclerView.ViewHolder(binding.root)
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        Holder(ItemHabitBinding.inflate(LayoutInflater.from(parent.context), parent, false))
    override fun onBindViewHolder(holder: Holder, position: Int) = holder.binding.bindRow(getItem(position), open)

    private object Diff : DiffUtil.ItemCallback<HabitRow>() {
        override fun areItemsTheSame(oldItem: HabitRow, newItem: HabitRow) = oldItem.habit.id == newItem.habit.id
        override fun areContentsTheSame(oldItem: HabitRow, newItem: HabitRow) = oldItem == newItem
    }
}
