package com.habitline.ui

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import androidx.appcompat.app.AppCompatActivity
import com.habitline.R
import com.habitline.data.HabitRepository
import com.habitline.databinding.ActivityWidgetConfigBinding
import com.habitline.widget.HabitWidgetProvider

/**
 * Shown automatically by the Android launcher when the user drags the
 * Habitline widget onto their home screen (per the manifest's
 * APPWIDGET_CONFIGURE intent-filter). Lets them choose which of their local
 * habits this particular widget instance should track — home screens
 * support placing multiple widgets, each pinned to a different habit.
 */
class WidgetConfigActivity : AppCompatActivity() {

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val binding = ActivityWidgetConfigBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // If the user backs out without picking a habit, the widget should
        // not be added.
        setResult(RESULT_CANCELED)

        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        val repo = HabitRepository(this)
        val habits = repo.load().habits

        if (habits.isEmpty()) {
            binding.emptyMessage.visibility = android.view.View.VISIBLE
            binding.habitListView.visibility = android.view.View.GONE
            binding.openAppButton.setOnClickListener {
                startActivity(Intent(this, MainActivity::class.java))
                finish()
            }
            return
        }

        val labels = habits.map { "${it.icon}  ${it.name}" }
        binding.habitListView.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, labels)
        binding.habitListView.setOnItemClickListener { _, _, position, _ ->
            val chosen = habits[position]
            repo.setWidgetHabit(widgetId, chosen.id)

            val appWidgetManager = AppWidgetManager.getInstance(this)
            HabitWidgetProvider.updateWidget(this, appWidgetManager, widgetId)

            val resultValue = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            setResult(RESULT_OK, resultValue)
            finish()
        }
    }
}
