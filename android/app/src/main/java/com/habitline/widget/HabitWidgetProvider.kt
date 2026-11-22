package com.habitline.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.habitline.R
import com.habitline.data.HabitRepository
import com.habitline.ui.MainActivity
import com.habitline.ui.WidgetConfigActivity
import android.app.PendingIntent

class HabitWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (widgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId)
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        val repo = HabitRepository(context)
        for (id in appWidgetIds) repo.clearWidget(id)
    }

    companion object {
        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            val repo = HabitRepository(context)
            val views = RemoteViews(context.packageName, R.layout.widget_habit)
            val habitId = repo.getWidgetHabitId(widgetId)
            val store = repo.load()
            val habit = store.habits.find { it.id == habitId }

            if (habit == null) {
                // No habit chosen yet (or it was deleted) — prompt to configure.
                views.setTextViewText(R.id.widget_habit_name, context.getString(R.string.widget_not_configured))
                views.setTextViewText(R.id.widget_streak, "")
                views.setImageViewResource(R.id.widget_check, R.drawable.ic_check_outline)

                val configIntent = Intent(context, WidgetConfigActivity::class.java).apply {
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                }
                val pending = PendingIntent.getActivity(
                    context, widgetId, configIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_root, pending)
                appWidgetManager.updateAppWidget(widgetId, views)
                return
            }

            val today = repo.today()
            val completedToday = repo.isCompletedOn(habit.id, today)
            val streak = repo.currentStreak(habit.id)

            views.setTextViewText(R.id.widget_habit_name, "${habit.icon}  ${habit.name}")
            views.setTextViewText(
                R.id.widget_streak,
                if (streak > 0) context.getString(R.string.widget_streak_format, streak) else context.getString(R.string.widget_no_streak)
            )
            views.setImageViewResource(
                R.id.widget_check,
                if (completedToday) R.drawable.ic_check_filled else R.drawable.ic_check_outline
            )

            // Recent activity strip: last 10 days, filled dot if completed.
            val recent = repo.recentCompletionDates(habit.id, 3650).toHashSet()
            val cal = java.util.Calendar.getInstance()
            val fmt = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
            val dotIds = intArrayOf(
                R.id.dot0, R.id.dot1, R.id.dot2, R.id.dot3, R.id.dot4,
                R.id.dot5, R.id.dot6, R.id.dot7, R.id.dot8, R.id.dot9
            )
            for (i in dotIds.indices.reversed()) {
                val d = fmt.format(cal.time)
                views.setImageViewResource(
                    dotIds[i],
                    if (recent.contains(d)) R.drawable.dot_filled else R.drawable.dot_empty
                )
                cal.add(java.util.Calendar.DAY_OF_YEAR, -1)
            }

            // Tapping the check circle toggles completion without opening the app.
            val toggleIntent = Intent(context, ToggleCompletionReceiver::class.java).apply {
                action = ToggleCompletionReceiver.ACTION_TOGGLE
                putExtra(ToggleCompletionReceiver.EXTRA_HABIT_ID, habit.id)
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            }
            val togglePending = PendingIntent.getBroadcast(
                context, widgetId, toggleIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_check, togglePending)

            // Tapping the rest of the widget opens the app.
            val openIntent = Intent(context, MainActivity::class.java)
            val openPending = PendingIntent.getActivity(
                context, widgetId + 100000, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, openPending)

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
