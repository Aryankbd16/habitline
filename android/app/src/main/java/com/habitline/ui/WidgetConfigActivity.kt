package com.habitline.ui

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import com.habitline.R
import com.habitline.data.HabitRepository
import com.habitline.databinding.ActivityWidgetConfigBinding
import com.habitline.nativework.NativeWork
import com.habitline.widget.HabitWidgetProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

class WidgetConfigActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        val widget = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (intent.action != AppWidgetManager.ACTION_APPWIDGET_CONFIGURE || widget !in HabitWidgetProvider.ids(this)) {
            finish()
            return
        }
        val binding = ActivityWidgetConfigBinding.inflate(layoutInflater)
        setContentView(binding.root)
        WindowInsetsControllerCompat(window, binding.root).isAppearanceLightNavigationBars =
            resources.getBoolean(R.bool.light_system_bars)
        binding.openAppButton.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
        val repository = HabitRepository(this)
        var saving = false
        fun save(habit: String?) {
            if (saving || widget !in HabitWidgetProvider.ids(this)) return
            saving = true
            lifecycleScope.launch {
                try {
                    if (habit == null) repository.clearWidgets(intArrayOf(widget)) else repository.bindWidget(widget, habit)
                    // The host expects an initial update from the configuration activity.
                    HabitWidgetProvider.renderAll(this@WidgetConfigActivity, intArrayOf(widget), repository.nativeSnapshot().tracker)
                    NativeWork.request(this@WidgetConfigActivity)
                    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget))
                    finish()
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    Toast.makeText(this@WidgetConfigActivity, R.string.widget_save_error, Toast.LENGTH_LONG).show()
                } finally {
                    saving = false
                }
            }
        }
        binding.overviewButton.setOnClickListener { save(null) }
        lifecycleScope.launch {
            try {
                val state = repository.nativeSnapshot().tracker
                val habits = state.habits.filter { state.latestSchedule(it.id)?.archived == false }
                binding.emptyMessage.isVisible = habits.isEmpty()
                val titles = habits.map { getString(R.string.habit_row, it.icon, it.name) }
                binding.habitListView.adapter = ArrayAdapter(this@WidgetConfigActivity, android.R.layout.simple_list_item_1, titles)
                binding.habitListView.setOnItemClickListener { _, _, position, _ -> save(habits[position].id) }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                binding.emptyMessage.setText(R.string.storage_recovery_message)
                binding.emptyMessage.isVisible = true
            }
        }
    }
}
