package com.habitline.ui

import android.app.DatePickerDialog
import android.os.Bundle
import android.text.InputFilter
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import androidx.annotation.StringRes
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import com.google.android.material.checkbox.MaterialCheckBox
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.habitline.R
import com.habitline.data.DAILY_MASK
import com.habitline.data.HabitInput
import com.habitline.data.LocalSettings
import com.habitline.data.ThemeChoice
import com.habitline.data.TrackerSnapshot
import com.habitline.databinding.ScreenEditorBinding
import com.habitline.databinding.ScreenProfileBinding
import java.text.DecimalFormatSymbols
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

@StringRes
private fun priorityResource(priority: String) = when (priority) {
    "high" -> R.string.priority_high
    "low" -> R.string.priority_low
    else -> R.string.priority_medium
}

internal fun MainActivity.priorityLabel(priority: String) = getString(priorityResource(priority))

internal fun MainActivity.editorScreen(): ScreenRenderer {
    val binding = ScreenEditorBinding.inflate(layoutInflater, content, false)
    content.addView(binding.root)
    binding.root.isFocusableInTouchMode = true
    binding.root.requestFocus()
    val initial = requireNotNull(model.editor)
    val separator = DecimalFormatSymbols.getInstance().decimalSeparator
    binding.inputName.filters = arrayOf(InputFilter.LengthFilter(maxOf(120, initial.getString("name").orEmpty().length)))
    binding.inputIcon.filters = arrayOf(InputFilter.LengthFilter(maxOf(24, initial.getString("icon").orEmpty().length)))
    binding.inputName.setText(initial.getString("name"))
    binding.inputDescription.setText(initial.getString("description"))
    binding.inputCategory.setText(initial.getString("category"), false)
    binding.inputIcon.setText(initial.getString("icon"))
    binding.inputPoints.setText(initial.getString("points").orEmpty().replace('.', separator))
    binding.inputPriority.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, HabitInput.priorities.map { priorityLabel(it) })
    binding.inputPriority.setSelection(HabitInput.priorities.indexOf(initial.getString("priority")).coerceAtLeast(0))
    binding.frequency.check(if (initial.getBoolean("daily")) R.id.daily else R.id.weekdays)
    binding.weekdayOptions.isVisible = !initial.getBoolean("daily")
    val fields = mapOf(
        "name" to binding.inputName, "description" to binding.inputDescription, "category" to binding.inputCategory,
        "icon" to binding.inputIcon, "points" to binding.inputPoints
    )
    fields.forEach { (key, field) ->
        field.doAfterTextChanged { value ->
            binding.editorError.isVisible = false
            model.changeDraft { putString(key, value.toString()) }
        }
    }
    binding.inputPriority.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
        override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
            val priority = HabitInput.priorities[position]
            if (priority != model.editor?.getString("priority")) model.changeDraft { putString("priority", priority) }
        }
        override fun onNothingSelected(parent: AdapterView<*>?) = Unit
    }
    binding.frequency.setOnCheckedChangeListener { _, id ->
        val daily = id == R.id.daily
        binding.weekdayOptions.isVisible = !daily
        binding.editorError.isVisible = false
        model.changeDraft { putBoolean("daily", daily) }
    }

    val dayIds = listOf(R.id.monday, R.id.tuesday, R.id.wednesday, R.id.thursday, R.id.friday, R.id.saturday, R.id.sunday)
    for (weekdays in DayOfWeek.values().asList().chunked(2)) {
        val row = LinearLayout(this)
        binding.weekdayOptions.addView(row)
        for (weekday in weekdays) {
            val mask = 1 shl (weekday.value % 7)
            val button = MaterialCheckBox(this).apply {
                id = dayIds[weekday.value - 1]
                text = weekday.getDisplayName(TextStyle.FULL, Locale.getDefault())
                minHeight = dp(48)
                isChecked = initial.getInt("weekdays") and mask != 0
                setOnCheckedChangeListener { _, checked ->
                    binding.editorError.isVisible = false
                    model.changeDraft {
                        val old = getInt("weekdays")
                        putInt("weekdays", if (checked) old or mask else old and mask.inv())
                    }
                }
            }
            row.addView(button, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        if (weekdays.size == 1) row.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
    }

    fun startDate() = LocalDate.parse(requireNotNull(model.editor?.getString("start")))
    fun updateStartLabel() { binding.startDate.text = getString(R.string.start_date, startDate().display()) }
    updateStartLabel()
    binding.startDate.setOnClickListener {
        val date = startDate()
        DatePickerDialog(this, { _, year, month, day ->
            model.changeDraft { putString("start", LocalDate.of(year, month + 1, day).toString()) }
            updateStartLabel()
        }, date.year, date.monthValue - 1, date.dayOfMonth).show()
    }

    fun showFormError(message: CharSequence) {
        binding.editorError.text = message
        binding.editorError.isVisible = true
    }
    var state: TrackerSnapshot? = null
    binding.saveHabit.setOnClickListener {
        val draft = requireNotNull(model.editor)
        val points = draft.getString("points").orEmpty().trim().replace(separator, '.').map { ch ->
            val digit = ch.digitToIntOrNull()
            digit?.digitToChar() ?: ch
        }.joinToString("").toDoubleOrNull()
        if (points == null) {
            showFormError(getString(R.string.invalid_points))
            return@setOnClickListener
        }
        val values = HabitInput(
            name = draft.getString("name").orEmpty(), startDate = startDate(),
            description = draft.getString("description").orEmpty(), category = draft.getString("category").orEmpty(),
            icon = draft.getString("icon").orEmpty(), priority = draft.getString("priority") ?: "medium",
            points = points, weekdayMask = if (draft.getBoolean("daily")) DAILY_MASK else draft.getInt("weekdays")
        )
        try {
            val original = state?.habits?.find { it.id == draft.getString("id") }
            values.validated(original, original?.let { state?.latestSchedule(it.id) })
            model.saveHabit(values)
        } catch (error: IllegalArgumentException) {
            showFormError(error.message.orEmpty())
            if (values.name.isBlank()) binding.inputName.requestFocus()
        }
    }

    return { snapshot, _, busy ->
        if (snapshot != state) {
            state = snapshot
            val categories = (HabitInput.categories + snapshot.habits.map { it.category })
                .filter(String::isNotBlank).distinctBy { it.lowercase(Locale.ROOT) }
            binding.inputCategory.setAdapter(ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, categories))
            binding.categoryChoices.setOnClickListener {
                MaterialAlertDialogBuilder(this).setTitle(R.string.choose_category)
                    .setItems(categories.toTypedArray()) { _, which -> binding.inputCategory.setText(categories[which], false) }
                    .setNegativeButton(R.string.cancel, null).show()
            }
        }
        binding.saveHabit.isEnabled = !busy
        fields.values.forEach { it.isEnabled = !busy }
        listOf(binding.categoryChoices, binding.inputPriority, binding.daily, binding.weekdays, binding.startDate).forEach { it.isEnabled = !busy }
        dayIds.forEach { binding.root.findViewById<View>(it).isEnabled = !busy }
    }
}

internal fun MainActivity.profileScreen(): ScreenRenderer {
    val binding = ScreenProfileBinding.inflate(layoutInflater, content, false)
    content.addView(binding.root)
    binding.root.isFocusableInTouchMode = true
    binding.root.requestFocus()
    val version = packageManager.getPackageInfo(packageName, 0).versionName.orEmpty()
    binding.appVersion.text = getString(R.string.version_format, version)
    var displayed: LocalSettings? = null
    var bindingValues = false
    fun saveDraft() {
        if (bindingValues) return
        model.profileDraft = Bundle().apply {
            putString("name", binding.profileName.text.toString())
            putString("profession", binding.profession.text.toString())
            putString("theme", binding.themeChoice().name)
        }
    }
    binding.profileName.doAfterTextChanged { saveDraft() }
    binding.profession.doAfterTextChanged { saveDraft() }
    binding.theme.setOnCheckedChangeListener { _, _ -> saveDraft() }
    binding.saveProfile.setOnClickListener {
        val settings = LocalSettings(binding.profileName.text.toString(), binding.profession.text.toString(), binding.themeChoice())
        model.saveSettings(settings, getString(R.string.profile_saved))
    }
    return { snapshot, _, busy ->
        if (displayed != snapshot.settings) {
            displayed = snapshot.settings
            val draft = model.profileDraft
            bindingValues = true
            binding.profileName.setText(draft?.getString("name") ?: snapshot.settings.name)
            binding.profession.setText(draft?.getString("profession") ?: snapshot.settings.profession)
            val theme = draft?.getString("theme")?.let { ThemeChoice.valueOf(it) } ?: snapshot.settings.theme
            binding.theme.check(when (theme) {
                ThemeChoice.LIGHT -> R.id.theme_light
                ThemeChoice.DARK -> R.id.theme_dark
                ThemeChoice.SYSTEM -> R.id.theme_system
            })
            bindingValues = false
        }
        listOf(binding.saveProfile, binding.profileName, binding.profession, binding.themeSystem,
            binding.themeLight, binding.themeDark).forEach { it.isEnabled = !busy }
    }
}

private fun ScreenProfileBinding.themeChoice() = when (theme.checkedRadioButtonId) {
    R.id.theme_light -> ThemeChoice.LIGHT
    R.id.theme_dark -> ThemeChoice.DARK
    else -> ThemeChoice.SYSTEM
}
