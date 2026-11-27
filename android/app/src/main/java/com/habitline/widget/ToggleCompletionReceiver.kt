package com.habitline.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.habitline.data.HabitRepository
import java.time.LocalDate

class ToggleCompletionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION || !intent.hasExtra("desired")) return
        val id = intent.getStringExtra("habit") ?: return
        val date = intent.getStringExtra("day") ?: return
        val widget = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)
        if (widget <= 0) return
        runWidgetTask(context) {
            val today = LocalDate.now()
            if (date == today.toString()) HabitRepository(context).setCompleted(id, today, intent.getBooleanExtra("desired", false), widget)
            HabitWidgetProvider.refreshAll(context)
        }
    }

    companion object { const val ACTION = "com.habitline.widget.SET_COMPLETED" }
}
