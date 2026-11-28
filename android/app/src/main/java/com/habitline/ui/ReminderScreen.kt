package com.habitline.ui

import android.app.TimePickerDialog
import android.text.format.DateFormat
import android.widget.LinearLayout
import androidx.core.view.doOnDetach
import androidx.core.view.isVisible
import com.google.android.material.checkbox.MaterialCheckBox
import com.habitline.R
import com.habitline.data.ReminderSettings
import com.habitline.databinding.ScreenReminderBinding
import com.habitline.nativework.ReminderNotifications
import java.time.DayOfWeek
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

internal fun MainActivity.reminderScreen(): ScreenRenderer {
    val binding = ScreenReminderBinding.inflate(layoutInflater, content, false)
    content.addView(binding.root)
    val draft = requireNotNull(model.reminderDraft)
    val id = requireNotNull(draft.getString("id"))
    val notifications = ReminderNotifications(this)
    val formatter = DateTimeFormatter.ofPattern(if (DateFormat.is24HourFormat(this)) "HH:mm" else "h:mm a")
    val ids = listOf(R.id.monday, R.id.tuesday, R.id.wednesday, R.id.thursday, R.id.friday, R.id.saturday, R.id.sunday)
    val dayChecks = mutableListOf<MaterialCheckBox>()

    fun settingsDraft() = requireNotNull(model.reminderDraft)
    fun time() = LocalTime.parse(requireNotNull(settingsDraft().getString("time")))
    fun updatePermission() {
        binding.reminderPermission.isVisible = binding.reminderEnabled.isChecked && !notifications.available()
        binding.reminderPermissionMessage.isVisible = binding.reminderPermission.isVisible
    }
    refreshReminderPermission = ::updatePermission
    binding.root.doOnDetach { refreshReminderPermission = null }
    binding.reminderPermission.setOnClickListener { enableReminderNotifications() }

    binding.reminderEnabled.isChecked = draft.getBoolean("enabled")
    binding.reminderOptions.isVisible = binding.reminderEnabled.isChecked
    binding.reminderEnabled.setOnCheckedChangeListener { _, checked ->
        model.changeReminder { putBoolean("enabled", checked) }
        binding.reminderOptions.isVisible = checked
        binding.reminderError.isVisible = false
        updatePermission()
    }
    binding.reminderTime.text = getString(R.string.reminder_time_display, time().format(formatter))
    binding.reminderTime.setOnClickListener {
        val current = time()
        TimePickerDialog(this, { _, hour, minute ->
            val newTime = LocalTime.of(hour, minute)
            model.changeReminder { putString("time", newTime.toString()) }
            binding.reminderTime.text = getString(R.string.reminder_time_display, newTime.format(formatter))
        }, current.hour, current.minute, DateFormat.is24HourFormat(this)).show()
    }
    for (weekday in DayOfWeek.values()) {
        val bit = 1 shl (weekday.value % 7)
        val day = MaterialCheckBox(this).apply {
            this.id = ids[weekday.value - 1]
            text = weekday.getDisplayName(TextStyle.FULL, Locale.getDefault())
            minHeight = dp(48)
            isChecked = draft.getInt("days") and bit != 0
            setOnCheckedChangeListener { _, checked ->
                model.changeReminder {
                    val mask = getInt("days")
                    putInt("days", if (checked) mask or bit else mask and bit.inv())
                }
                binding.reminderError.isVisible = false
            }
        }
        dayChecks.add(day)
        binding.reminderDays.addView(day, LinearLayout.LayoutParams(-1, -2))
    }
    binding.saveReminder.setOnClickListener {
        val current = settingsDraft()
        val enabled = current.getBoolean("enabled")
        val days = current.getInt("days")
        if (enabled && days == 0) {
            binding.reminderError.isVisible = true
            return@setOnClickListener
        }
        model.saveReminder(id, if (enabled) ReminderSettings(time(), days) else null)
    }
    updatePermission()
    return { snapshot, _, busy ->
        val habit = snapshot.habits.firstOrNull { it.id == id }
        binding.reminderHabit.text = habit?.name ?: getString(R.string.habit_unavailable)
        val editable = !busy && habit != null
        listOf(binding.reminderEnabled, binding.reminderTime, binding.saveReminder, binding.reminderPermission).forEach { it.isEnabled = editable }
        dayChecks.forEach { it.isEnabled = editable }
    }
}
