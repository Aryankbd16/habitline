package com.habitline.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.habitline.data.HabitRepository

/**
 * Handles the one-tap "mark today's habit complete" action directly from the
 * home screen, without launching the app (spec section 23: "Provide quick
 * completion action" / "Provide undo if technically practical"). Tapping
 * again undoes it, since toggleCompletion() flips state.
 */
class ToggleCompletionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_TOGGLE) return

        val habitId = intent.getStringExtra(EXTRA_HABIT_ID) ?: return
        val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)
        if (widgetId == -1) return

        val repo = HabitRepository(context)
        repo.toggleCompletion(habitId)

        val appWidgetManager = AppWidgetManager.getInstance(context)
        HabitWidgetProvider.updateWidget(context, appWidgetManager, widgetId)
    }

    companion object {
        const val ACTION_TOGGLE = "com.habitline.action.TOGGLE_COMPLETION"
        const val EXTRA_HABIT_ID = "extra_habit_id"
    }
}
