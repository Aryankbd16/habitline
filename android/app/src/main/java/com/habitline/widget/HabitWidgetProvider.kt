package com.habitline.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.habitline.R
import com.habitline.data.TrackerSnapshot
import com.habitline.data.WidgetMark
import com.habitline.data.widgetToday
import com.habitline.nativework.NativeIntents
import com.habitline.nativework.NativeWork
import com.habitline.nativework.persistNative
import com.habitline.ui.WidgetConfigActivity

class HabitWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        persistNative { NativeWork.request(context) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, appWidgetId: Int, options: Bundle) {
        persistNative { NativeWork.request(context) }
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        persistNative { NativeWork.request(context, removed = ids) }
    }

    companion object {
        private val rowViews = listOf(
            Triple(R.id.widget_row_1, R.id.widget_habit_1, R.id.widget_check_1),
            Triple(R.id.widget_row_2, R.id.widget_habit_2, R.id.widget_check_2),
            Triple(R.id.widget_row_3, R.id.widget_habit_3, R.id.widget_check_3)
        )

        internal fun ids(context: Context): IntArray =
            AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, HabitWidgetProvider::class.java))

        internal fun rowLimit(context: Context, id: Int): Int {
            val height = AppWidgetManager.getInstance(context).getAppWidgetOptions(id)
                .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
            return when {
                height >= 194 -> 3
                height >= 150 -> 2
                else -> 1
            }
        }

        internal fun renderAll(context: Context, widgets: IntArray, state: TrackerSnapshot) {
            val manager = AppWidgetManager.getInstance(context)
            for (id in widgets) manager.updateAppWidget(id, render(context, id, state, rowLimit(context, id)))
        }

        internal fun showRecovery(context: Context, widgets: IntArray) {
            val manager = AppWidgetManager.getInstance(context)
            val views = RemoteViews(context.packageName, R.layout.widget_habit)
            views.setTextViewText(R.id.widget_progress, context.getString(R.string.storage_recovery_title))
            views.setTextViewText(R.id.widget_empty, context.getString(R.string.open_for_recovery))
            views.setOnClickPendingIntent(R.id.widget_root, NativeIntents.app(context))
            for (widget in widgets) manager.updateAppWidget(widget, views)
        }

        internal fun render(context: Context, widget: Int, state: TrackerSnapshot, limit: Int): RemoteViews {
            val today = state.widgetToday(widget, limit)
            val views = RemoteViews(context.packageName, R.layout.widget_habit)
            views.setTextViewText(R.id.widget_progress, context.getString(R.string.widget_progress_today, today.completed, today.scheduled))
            views.setViewVisibility(R.id.widget_empty, if (today.rows.isEmpty()) View.VISIBLE else View.GONE)
            views.setOnClickPendingIntent(R.id.widget_root, NativeIntents.app(context))
            val config = Intent(context, WidgetConfigActivity::class.java)
                .setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
                .setData(Uri.Builder().scheme("habitline").authority("widget-config").appendPath(widget.toString()).build())
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget)
            views.setOnClickPendingIntent(R.id.widget_configure, PendingIntent.getActivity(context, 0, config, PendingIntent.FLAG_IMMUTABLE))
            for ((index, rowIds) in rowViews.withIndex()) {
                val (row, name, check) = rowIds
                val occurrence = today.rows.getOrNull(index)
                views.setViewVisibility(row, if (occurrence == null) View.GONE else View.VISIBLE)
                if (occurrence == null) {
                    views.setOnClickPendingIntent(name, null)
                    views.setOnClickPendingIntent(check, null)
                    continue
                }
                val habit = occurrence.habit
                val done = occurrence.completion != null
                views.setTextViewText(name, context.getString(R.string.habit_row, habit.icon, habit.name))
                views.setImageViewResource(check, if (done) R.drawable.ic_check_filled else R.drawable.ic_check_outline)
                views.setContentDescription(check, context.getString(if (done) R.string.undo_habit else R.string.mark_habit, habit.name))
                val mark = WidgetMark(widget, today.focus, habit.id, state.today, !done, occurrence.completion?.id)
                val toggle = Intent(context, ToggleCompletionReceiver::class.java)
                    .setAction(ToggleCompletionReceiver.ACTION).setData(NativeIntents.widgetUri(mark))
                views.setOnClickPendingIntent(check, PendingIntent.getBroadcast(context, 0, toggle, PendingIntent.FLAG_IMMUTABLE))
                views.setOnClickPendingIntent(name, NativeIntents.habit(context, habit.id))
            }
            return views
        }
    }
}
