package com.habitline.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews
import com.habitline.R
import com.habitline.data.HabitRepository
import com.habitline.data.TrackerSnapshot
import com.habitline.data.scheduledOn
import com.habitline.ui.MainActivity
import com.habitline.ui.WidgetConfigActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

internal fun BroadcastReceiver.runWidgetTask(context: Context, task: suspend () -> Unit) {
    val pending = goAsync()
    CoroutineScope(Dispatchers.IO).launch {
        try {
            task()
        } catch (error: Exception) {
            Log.e("HabitlineWidget", "Local widget operation failed", error)
            HabitWidgetProvider.showRecovery(context)
        } finally {
            pending.finish()
        }
    }
}

class HabitWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        runWidgetTask(context) { refreshAll(context) }
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        runWidgetTask(context) { HabitRepository(context).clearWidgets(ids) }
    }

    companion object {
        private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        private val dots = intArrayOf(R.id.dot0, R.id.dot1, R.id.dot2, R.id.dot3, R.id.dot4, R.id.dot5, R.id.dot6, R.id.dot7, R.id.dot8, R.id.dot9)

        suspend fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, HabitWidgetProvider::class.java))
            if (ids.isEmpty()) return
            val state = HabitRepository(context).snapshot()
            for (id in ids) manager.updateAppWidget(id, render(context, state, id))
        }

        internal fun showRecovery(context: Context) {
            val views = RemoteViews(context.packageName, R.layout.widget_habit)
            views.setTextViewText(R.id.widget_habit_name, context.getString(R.string.storage_recovery_title))
            views.setTextViewText(R.id.widget_streak, context.getString(R.string.open_for_recovery))
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), FLAGS))
            AppWidgetManager.getInstance(context).updateAppWidget(ComponentName(context, HabitWidgetProvider::class.java), views)
        }

        private fun render(context: Context, state: TrackerSnapshot, widget: Int): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_habit)
            val habit = state.habits.find { it.id == state.widgets[widget] }
            if (habit == null) {
                views.setTextViewText(R.id.widget_habit_name, context.getString(R.string.widget_not_configured))
                views.setTextViewText(R.id.widget_streak, "")
                val intent = Intent(context, WidgetConfigActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget)
                views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, widget, intent, FLAGS))
                views.setOnClickPendingIntent(R.id.widget_check, null)
                return views
            }
            val done = state.isDone(habit.id)
            val streak = state.streak(habit.id)
            views.setTextViewText(R.id.widget_habit_name, "${habit.icon}  ${habit.name}")
            views.setTextViewText(R.id.widget_streak, if (streak > 0) context.getString(R.string.widget_streak_format, streak) else context.getString(R.string.widget_no_streak))
            views.setImageViewResource(R.id.widget_check, if (done) R.drawable.ic_check_filled else R.drawable.ic_check_outline)
            for ((i, dot) in dots.withIndex()) {
                val day = state.today.minusDays((dots.lastIndex - i).toLong())
                views.setImageViewResource(dot, if (state.isDone(habit.id, day)) R.drawable.dot_filled else R.drawable.dot_empty)
            }
            val toggle = Intent(context, ToggleCompletionReceiver::class.java)
                .setAction(ToggleCompletionReceiver.ACTION)
                .setData(android.net.Uri.Builder().scheme("habitline").authority("widget")
                    .appendPath(widget.toString()).appendPath(habit.id).appendPath(state.today.toString()).appendPath((!done).toString()).build())
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget)
                .putExtra("habit", habit.id).putExtra("day", state.today.toString()).putExtra("desired", !done)
            val enabled = done || state.schedule(habit.id).scheduledOn(state.today)
            views.setOnClickPendingIntent(R.id.widget_check, if (enabled) PendingIntent.getBroadcast(context, widget, toggle, FLAGS) else null)
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, widget, Intent(context, MainActivity::class.java), FLAGS))
            return views
        }
    }
}
