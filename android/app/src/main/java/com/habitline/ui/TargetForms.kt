package com.habitline.ui

import android.app.DatePickerDialog
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.habitline.R
import com.habitline.data.ChallengeInput
import com.habitline.data.ChallengeMode
import com.habitline.data.GoalInput
import com.habitline.data.TrackerSnapshot
import com.habitline.databinding.ScreenTargetBinding
import java.time.LocalDate

internal fun wholeNumber(value: String?): Int? =
    value.orEmpty().trim().map { it.digitToIntOrNull()?.digitToChar() ?: it }.joinToString("").toIntOrNull()

internal fun MainActivity.targetTitle(): Int {
    val draft = requireNotNull(model.targetDraft)
    val challenge = draft.getBoolean("challenge")
    val editing = draft.getBoolean("editing")
    return when {
        challenge && editing -> R.string.edit_challenge
        challenge -> R.string.new_challenge
        editing -> R.string.edit_goal
        else -> R.string.new_goal
    }
}

internal fun MainActivity.targetScreen(): ScreenRenderer {
    val binding = ScreenTargetBinding.inflate(layoutInflater, content, false)
    content.addView(binding.root)
    binding.root.isFocusableInTouchMode = true
    binding.root.requestFocus()
    val draft = requireNotNull(model.targetDraft)
    val challenge = draft.getBoolean("challenge")
    val editing = draft.getBoolean("editing")
    binding.targetTitle.setText(draft.getString("title"))
    binding.targetDescription.setText(draft.getString("description"))
    binding.targetCount.setText(draft.getString("target"))
    binding.targetMode.isVisible = challenge
    binding.targetClearEnd.isVisible = !challenge
    var snapshot: TrackerSnapshot? = null

    fun current() = requireNotNull(model.targetDraft)
    fun date(key: String) = current().getString(key)?.let(LocalDate::parse)
    fun links() = current().getStringArrayList("links").orEmpty().toSet()
    fun mode() = ChallengeMode.entries.first { it.key == current().getString("mode") }
    fun labels() {
        binding.targetStart.text = getString(R.string.start_date, requireNotNull(date("start")).display())
        binding.targetEnd.text = date("end")?.let { getString(R.string.target_end_display, it.display()) }
            ?: getString(R.string.target_no_end)
        binding.targetMode.setText(if (mode() == ChallengeMode.COUNT) R.string.challenge_count else R.string.challenge_streak)
        val count = links().size
        binding.targetLinks.text = resources.getQuantityString(R.plurals.linked_habit_count, count, count)
    }

    fun selectDate(key: String) {
        val initial = date(key) ?: requireNotNull(date("start"))
        DatePickerDialog(this, { _, year, month, day ->
            model.changeTargetDraft { putString(key, LocalDate.of(year, month + 1, day).toString()) }
            labels()
        }, initial.year, initial.monthValue - 1, initial.dayOfMonth).show()
    }

    labels()
    binding.targetTitle.doAfterTextChanged { model.changeTargetDraft { putString("title", it.toString()) } }
    binding.targetDescription.doAfterTextChanged { model.changeTargetDraft { putString("description", it.toString()) } }
    binding.targetCount.doAfterTextChanged { model.changeTargetDraft { putString("target", it.toString()) } }
    binding.targetStart.setOnClickListener { selectDate("start") }
    binding.targetEnd.setOnClickListener { selectDate("end") }
    binding.targetClearEnd.setOnClickListener {
        model.changeTargetDraft { putString("end", null) }
        labels()
    }
    binding.targetMode.setOnClickListener {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.challenge_measure)
            .setItems(arrayOf(getString(R.string.challenge_count), getString(R.string.challenge_streak))) { _, index ->
                model.changeTargetDraft { putString("mode", ChallengeMode.entries[index].key) }
                labels()
            }
            .show()
    }
    binding.targetLinks.setOnClickListener {
        val state = snapshot ?: return@setOnClickListener
        val habits = state.habits
        val selected = links().intersect(habits.mapTo(mutableSetOf()) { it.id }).toMutableSet()
        val names = habits.map {
            if (state.latestSchedule(it.id)?.archived == true) getString(R.string.archived_habit_name, it.name) else it.name
        }.toTypedArray()
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.link_habits)
            .setMultiChoiceItems(names, BooleanArray(habits.size) { habits[it].id in selected }) { _, index, checked ->
                if (checked) selected.add(habits[index].id) else selected.remove(habits[index].id)
            }
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.apply_selection) { _, _ ->
                model.changeTargetDraft { putStringArrayList("links", ArrayList(selected)) }
                labels()
            }
            .show()
    }
    binding.targetSave.setOnClickListener {
        val input = current()
        val count = wholeNumber(input.getString("target"))
        val start = requireNotNull(date("start"))
        val end = date("end")
        val title = input.getString("title").orEmpty()
        val description = input.getString("description").orEmpty()
        val state = snapshot ?: return@setOnClickListener
        val selected = links().intersect(state.habits.mapTo(mutableSetOf()) { it.id })
        try {
            requireNotNull(count) { getString(R.string.target_whole_number) }
            if (challenge) {
                val requiredEnd = requireNotNull(end) { getString(R.string.target_end_required) }
                val values = ChallengeInput(title, description, count, start, requiredEnd, mode(), selected)
                values.validate(editing && state.progress.challengeLinks(input.getString("id").orEmpty()).isEmpty())
                model.saveChallenge(values)
            } else {
                val values = GoalInput(title, description, count, start, end, selected)
                values.validate()
                model.saveGoal(values)
            }
            binding.targetError.isVisible = false
        } catch (error: IllegalArgumentException) {
            binding.targetError.text = error.message
            binding.targetError.isVisible = true
        }
    }
    return { state, _, busy ->
        snapshot = state
        listOf(binding.targetTitle, binding.targetDescription, binding.targetCount, binding.targetStart,
            binding.targetEnd, binding.targetClearEnd, binding.targetSave).forEach { it.isEnabled = !busy }
        binding.targetMode.isEnabled = !busy && !editing
        binding.targetLinks.isEnabled = !busy && state.habits.isNotEmpty()
    }
}
