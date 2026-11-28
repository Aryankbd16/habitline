package com.habitline.nativework

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.core.content.ContextCompat
import com.habitline.R
import com.habitline.data.LocalHabit
import com.habitline.data.NativeSnapshot
import com.habitline.data.ReminderTicket
import com.habitline.data.acceptsReminder

internal class ReminderNotifications(private val context: Context) {
    private val manager = context.getSystemService(NotificationManager::class.java)

    fun ensureChannel() {
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.reminder_channel), NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = context.getString(R.string.reminder_channel_description) }
        )
    }

    fun runtimePermissionMissing() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED

    fun available(): Boolean {
        ensureChannel()
        return !runtimePermissionMissing() && manager.areNotificationsEnabled() &&
            manager.getNotificationChannel(CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE
    }

    fun publish(habit: LocalHabit, ticket: ReminderTicket): Boolean {
        if (!available()) return false
        val action = Notification.Action.Builder(
            Icon.createWithResource(context, R.drawable.ic_reminder),
            context.getString(R.string.reminder_complete_action),
            NativeIntents.completion(context, ticket)
        ).build()
        val notification = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_reminder)
            .setContentTitle(habit.name)
            .setContentText(context.getString(R.string.reminder_notification_message))
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(NativeIntents.habit(context, habit.id))
            .addAction(action)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setWhen(ticket.due.toEpochMilli())
            .addExtras(Bundle().apply { putString(TICKET, NativeIntents.reminderUri(ticket).toString()) })
            .build()
        // Permission may be revoked while the worker is building the notification.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return try {
            manager.notify(tag(habit.id), NOTIFICATION_ID, notification)
            true
        } catch (error: SecurityException) {
            Log.d("HabitlineReminder", "Notification access changed", error)
            false
        }
    }

    fun dismissObsolete(native: NativeSnapshot) {
        // Delivery and receipt can race a parallel refresh. Cancel only the notification
        // whose current payload is stale, never a replacement for the same habit.
        for (entry in manager.activeNotifications) {
            if (entry.id != NOTIFICATION_ID || !entry.tag.orEmpty().startsWith(PREFIX) ||
                entry.postTime > native.now.toInstant().toEpochMilli()) continue
            val raw = entry.notification.extras.getString(TICKET)
            val ticket = NativeIntents.readReminder(raw?.let(android.net.Uri::parse))
            if (ticket != null && native.tracker.acceptsReminder(ticket, native.now)) continue
            val current = manager.activeNotifications.firstOrNull { it.id == entry.id && it.tag == entry.tag }
            if (current?.notification?.extras?.getString(TICKET) == raw) manager.cancel(entry.tag, entry.id)
        }
    }

    fun dismiss(ticket: ReminderTicket) {
        val tag = tag(ticket.habitId)
        val current = manager.activeNotifications.firstOrNull { it.id == NOTIFICATION_ID && it.tag == tag }
        if (current?.notification?.extras?.getString(TICKET) == NativeIntents.reminderUri(ticket).toString()) {
            manager.cancel(tag, NOTIFICATION_ID)
        }
    }

    companion object {
        const val CHANNEL = "habit-reminders"
        internal const val NOTIFICATION_ID = 1
        private const val PREFIX = "habitline-reminder:"
        private const val TICKET = "com.habitline.reminder.ticket"
        internal fun tag(habit: String) = PREFIX + habit
    }
}
