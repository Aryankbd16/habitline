package com.habitline.ui

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.habitline.R
import com.habitline.data.HabitRepository
import com.habitline.databinding.ActivityWidgetConfigBinding
import com.habitline.widget.HabitWidgetProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

class WidgetConfigActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        val widget = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        val manager = AppWidgetManager.getInstance(this)
        if (manager.getAppWidgetInfo(widget)?.provider != ComponentName(this, HabitWidgetProvider::class.java)) {
            finish()
            return
        }
        val binding = ActivityWidgetConfigBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.openAppButton.setOnClickListener { startActivity(Intent(this, MainActivity::class.java)); finish() }
        val repo = HabitRepository(this)
        lifecycleScope.launch {
            try {
                val state = repo.snapshot()
                val habits = state.habits.filter { state.latestSchedule(it.id)?.archived == false }
                binding.emptyMessage.visibility = if (habits.isEmpty()) View.VISIBLE else View.GONE
                binding.habitListView.adapter = ArrayAdapter(this@WidgetConfigActivity, android.R.layout.simple_list_item_1, habits.map { "${it.icon}  ${it.name}" })
                binding.habitListView.setOnItemClickListener { _, _, position, _ ->
                    lifecycleScope.launch {
                        try {
                            repo.bindWidget(widget, habits[position].id)
                            HabitWidgetProvider.refreshAll(this@WidgetConfigActivity)
                            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget))
                            finish()
                        } catch (error: Exception) {
                            if (error is CancellationException) throw error
                            Toast.makeText(this@WidgetConfigActivity, "Could not bind widget", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                binding.emptyMessage.setText(R.string.storage_recovery_message)
                binding.emptyMessage.visibility = View.VISIBLE
            }
        }
    }
}
