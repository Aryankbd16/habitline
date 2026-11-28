package com.habitline.nativework

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.habitline.data.ReminderTicket
import com.habitline.data.WidgetMark
import com.habitline.ui.MainActivity
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

internal object NativeIntents {
    const val OPEN = "com.habitline.OPEN_HABIT"
    const val COMPLETE = "com.habitline.REMINDER_COMPLETE"
    private const val SCHEME = "habitline"

    fun reminderUri(ticket: ReminderTicket): Uri = Uri.Builder().scheme(SCHEME).authority("reminder")
        .appendPath(ticket.habitId).appendPath(ticket.updatedAt).appendPath(ticket.day.toString())
        .appendPath(ticket.zone.id).appendPath(ticket.due.toString()).build()

    fun readReminder(uri: Uri?): ReminderTicket? {
        val fields = fields(uri, "reminder", 5) ?: return null
        val habit = validId(fields[0]) ?: return null
        return runCatching {
            ReminderTicket(habit, fields[1], LocalDate.parse(fields[2]), ZoneId.of(fields[3]), Instant.parse(fields[4]))
        }.getOrNull()
    }

    fun widgetUri(mark: WidgetMark): Uri = Uri.Builder().scheme(SCHEME).authority("widget-mark")
        .appendPath(mark.widget.toString()).appendPath(mark.focus ?: "-").appendPath(mark.habit)
        .appendPath(mark.day.toString()).appendPath(mark.desired.toString())
        .appendPath(mark.expectedCompletionId ?: "-").build()

    fun readWidgetMark(uri: Uri?): WidgetMark? {
        val fields = fields(uri, "widget-mark", 6) ?: return null
        val widget = fields[0].toIntOrNull()?.takeIf { it > 0 } ?: return null
        val focus = if (fields[1] == "-") null else validId(fields[1]) ?: return null
        val habit = validId(fields[2]) ?: return null
        val day = runCatching { LocalDate.parse(fields[3]) }.getOrNull() ?: return null
        val desired = fields[4].toBooleanStrictOrNull() ?: return null
        val expected = if (fields[5] == "-") null else validId(fields[5]) ?: return null
        if (desired == (expected != null)) return null
        return WidgetMark(widget, focus, habit, day, desired, expected)
    }

    fun habit(context: Context, habit: String): PendingIntent = PendingIntent.getActivity(
        context, 0, Intent(context, MainActivity::class.java).setAction(OPEN)
            .setData(Uri.Builder().scheme(SCHEME).authority("habit").appendPath(habit).build())
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE
    )

    fun app(context: Context): PendingIntent = PendingIntent.getActivity(
        context, 0, Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE
    )

    fun openHabit(intent: Intent): String? {
        if (intent.action != OPEN) return null
        return fields(intent.data, "habit", 1)?.single()?.let(::validId)
    }

    fun completion(context: Context, ticket: ReminderTicket): PendingIntent = PendingIntent.getBroadcast(
        context, 0, Intent(context, ReminderCompletionReceiver::class.java)
            .setAction(COMPLETE).setData(reminderUri(ticket)),
        PendingIntent.FLAG_IMMUTABLE
    )

    private fun fields(uri: Uri?, authority: String, count: Int): List<String>? =
        uri?.takeIf { it.scheme == SCHEME && it.authority == authority && it.query == null && it.fragment == null }
            ?.pathSegments?.takeIf { it.size == count }

    private fun validId(raw: String): String? = runCatching {
        raw.takeIf { UUID.fromString(it).toString().equals(it, ignoreCase = true) }
    }.getOrNull()
}
