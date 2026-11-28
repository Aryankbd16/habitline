package com.habitline.data

import android.app.NotificationManager
import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.widget.ImageButton
import android.widget.TextView
import androidx.room.Room
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.habitline.R
import com.habitline.nativework.NativeIntents
import com.habitline.nativework.NativeWork
import com.habitline.nativework.ReminderNotifications
import com.habitline.ui.MainActivity
import com.habitline.ui.WidgetConfigActivity
import com.habitline.widget.HabitWidgetProvider
import com.habitline.widget.ToggleCompletionReceiver
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Clock
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class NativeCapabilitiesTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    @Test fun remindersPersistAndOnlyOneValidatedClaimCanPublish() = runBlocking {
        val name = "native-test-${uuid()}"
        val preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE)
        val clock = Clock.fixed(Instant.parse("2026-03-02T09:30:00Z"), ZoneOffset.UTC)
        fun open() = Room.databaseBuilder(context, TrackerDatabase::class.java, name).build()
        var db = open()
        try {
            var repository = HabitRepository(context, db, clock, preferences) { ZoneOffset.UTC }
            val today = repository.nativeSnapshot().now.toLocalDate()
            val habit = repository.addHabit(uuid(), HabitInput("Reminder persistence", today))
            val morning = ReminderSettings(LocalTime.of(8, 0), 1 shl 1)
            repository.saveReminder(habit.id, morning)
            db.close()
            db = open()
            repository = HabitRepository(context, db, clock, preferences) { ZoneOffset.UTC }
            var data = repository.nativeSnapshot()
            val current = data.tracker.habits.first { it.id == habit.id }
            assertEquals(morning, data.tracker.reminders[habit.id]?.settings)
            val stale = requireNotNull(nextReminder(data.tracker, current, data.now, true))

            val updated = ReminderSettings(LocalTime.of(9, 0), 1 shl 1)
            repository.saveReminder(habit.id, updated)
            assertFalse(repository.deliverReminder(stale) { error("A changed reminder must never publish") })
            data = repository.nativeSnapshot()
            val edited = data.tracker.habits.first { it.id == habit.id }
            val ticket = requireNotNull(nextReminder(data.tracker, edited, data.now, true))
            assertFalse(repository.deliverReminder(ticket) { false })
            assertNull(repository.nativeSnapshot().tracker.reminders[habit.id]?.deliveredThrough)
            var published = 0
            assertTrue(repository.deliverReminder(ticket) { published++; true })
            assertFalse(repository.deliverReminder(ticket) { published++; true })
            assertEquals(1, published)

            assertTrue(repository.completeFromReminder(ticket))
            assertFalse(repository.completeFromReminder(ticket))
            assertEquals(1, repository.snapshot().progress.events.count { it.kind == "award" })
            repository.setCompleted(habit.id, today, false)
            assertFalse(repository.completeFromReminder(ticket))
            repository.setArchived(habit.id, true)
            assertFalse(repository.completeFromReminder(ticket))
            repository.saveReminder(habit.id, null)
            assertNull(repository.nativeSnapshot().tracker.reminders[habit.id])
            repository.deleteHabit(habit.id)
            assertFalse(repository.deliverReminder(ticket) { error("A deleted habit must never publish") })
        } finally {
            db.close()
            context.deleteDatabase(name)
            context.deleteSharedPreferences(name)
        }
    }

    @Test fun notificationAndTwoRealWidgetBindingsUseTheSameCompletionLedger() = runBlocking {
        val repo = HabitRepository(context)
        val host = AppWidgetHost(context, 737)
        val manager = AppWidgetManager.getInstance(context)
        val component = ComponentName(context, HabitWidgetProvider::class.java)
        val notifications = ReminderNotifications(context)
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        val now = repo.nativeSnapshot().now
        val first = repo.addHabit(uuid(), HabitInput("Native test first", now.toLocalDate()))
        val second = repo.addHabit(uuid(), HabitInput("Native test second", now.toLocalDate()))
        try {
            notifications.ensureChannel()
            assertEquals(NotificationManager.IMPORTANCE_DEFAULT,
                notificationManager.getNotificationChannel(ReminderNotifications.CHANNEL).importance)
            assertTrue("The emulator must allow notifications for this test", notifications.available())

            val firstWidget = host.allocateAppWidgetId()
            val secondWidget = host.allocateAppWidgetId()
            for (id in listOf(firstWidget, secondWidget)) {
                assertTrue("Grant the app-widget bind permission in the emulator shell", manager.bindAppWidgetIdIfAllowed(id, component))
                manager.updateAppWidgetOptions(id, Bundle().apply { putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 120) })
            }
            configure(firstWidget, first)
            configure(secondWidget, second)
            assertEquals(first.id, repo.nativeSnapshot().tracker.widgets[firstWidget])
            assertEquals(second.id, repo.nativeSnapshot().tracker.widgets[secondWidget])
            lateinit var firstView: android.appwidget.AppWidgetHostView
            instrumentation.runOnMainSync {
                host.startListening()
                firstView = host.createView(context, firstWidget, manager.getAppWidgetInfo(firstWidget))
            }
            ActivityScenario.launch<WidgetConfigActivity>(Intent(context, WidgetConfigActivity::class.java)
                .setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -99)).use { scenario ->
                assertEquals(androidx.lifecycle.Lifecycle.State.DESTROYED, scenario.state)
            }

            val invalid = WidgetMark(firstWidget, first.id, second.id, now.toLocalDate(), true)
            assertFalse(repo.completeFromWidget(invalid, 1))
            assertFalse(repo.completeFromWidget(invalid.copy(focus = null, habit = first.id), 1))
            val current = WidgetMark(secondWidget, second.id, second.id, now.toLocalDate(), true)
            val markIntent = Intent(context, ToggleCompletionReceiver::class.java)
                .setAction(ToggleCompletionReceiver.ACTION).setData(NativeIntents.widgetUri(current))
            context.sendBroadcast(markIntent)
            eventually { repo.nativeSnapshot().tracker.isDone(second.id) }
            context.sendBroadcast(markIntent)
            val markId = repo.nativeSnapshot().tracker.completions.single { it.habitId == second.id }.id
            val undo = NativeIntents.widgetUri(current.copy(desired = false, expectedCompletionId = markId))
            context.sendBroadcast(markIntent.setData(undo))
            eventually { !repo.nativeSnapshot().tracker.isDone(second.id) }

            val settingsTime = repo.nativeSnapshot().now.toLocalTime().truncatedTo(ChronoUnit.MINUTES)
            repo.saveReminder(first.id, ReminderSettings(settingsTime, DAILY_MASK))
            val native = repo.nativeSnapshot()
            val fresh = native.tracker.habits.first { it.id == first.id }
            val day = native.now.toLocalDate()
            val ticket = ReminderTicket(first.id, fresh.updatedAt, day, native.now.zone,
                settingsTime.atDate(day).atZone(native.now.zone).toInstant())
            repo.deliverReminder(ticket) { notifications.publish(it, ticket) }
            lateinit var posted: android.app.Notification
            eventually {
                notificationManager.activeNotifications.firstOrNull { it.tag == ReminderNotifications.tag(first.id) }
                    ?.notification?.also { posted = it } != null
            }
            assertEquals(first.name, posted.extras.getCharSequence(android.app.Notification.EXTRA_TITLE).toString())
            val action = posted.actions.single().actionIntent
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                assertTrue(action.isImmutable)
                assertTrue(posted.contentIntent.isImmutable)
            }
            val distinct = NativeIntents.completion(context, ticket.copy(habitId = second.id))
            assertNotEquals(action, distinct)
            assertEquals(ticket, NativeIntents.readReminder(NativeIntents.reminderUri(ticket)))
            assertNull(NativeIntents.readReminder(android.net.Uri.parse("habitline://reminder/arbitrary")))

            ActivityScenario.launch<MainActivity>(Intent(context, MainActivity::class.java)).use { scenario ->
                posted.contentIntent.send()
                pollActivity(scenario) {
                    it.findViewById<TextView>(R.id.detail_name)?.text?.contains(first.name) == true
                }
                action.send()
                action.send()
                eventually { repo.nativeSnapshot().tracker.isDone(first.id) }
                eventually { notificationManager.activeNotifications.none { it.tag == ReminderNotifications.tag(first.id) } }
            }

            eventually {
                var label: CharSequence? = null
                instrumentation.runOnMainSync {
                    label = firstView.findViewById<ImageButton>(R.id.widget_check_1)?.contentDescription
                }
                label == context.getString(R.string.undo_habit, first.name)
            }
            val state = repo.nativeSnapshot().tracker
            assertEquals(1, repo.snapshot().progress.events.count { it.habitId == first.id && it.kind == "award" })
            instrumentation.runOnMainSync {
                val focusedFirst = HabitWidgetProvider.render(context, firstWidget, state, 1)
                    .apply(context, android.widget.FrameLayout(context))
                val focusedSecond = HabitWidgetProvider.render(context, secondWidget, state, 1)
                    .apply(context, android.widget.FrameLayout(context))
                assertTrue(focusedFirst.findViewById<TextView>(R.id.widget_habit_1).text.contains(first.name))
                assertTrue(focusedSecond.findViewById<TextView>(R.id.widget_habit_1).text.contains(second.name))
                assertEquals(context.getString(R.string.undo_habit, first.name),
                    focusedFirst.findViewById<ImageButton>(R.id.widget_check_1).contentDescription)
                assertEquals(focusedFirst.findViewById<TextView>(R.id.widget_progress).text,
                    focusedSecond.findViewById<TextView>(R.id.widget_progress).text)
            }
            NativeWork.request(context).result.get(15, TimeUnit.SECONDS)
        } finally {
            host.stopListening()
            host.deleteHost()
            repo.deleteHabit(first.id)
            repo.deleteHabit(second.id)
            NativeWork.request(context)
        }
    }

    @Test fun oneTimerIsRetainedReplacedAndCancelledByRoomChanges() = runBlocking {
        val repository = HabitRepository(context)
        val manager = androidx.work.WorkManager.getInstance(context)
        val now = repository.nativeSnapshot().now
        val habit = repository.addHabit(uuid(), HabitInput("Native timer test", now.toLocalDate().plusDays(4)))
        val key = "habitline-reminder/${habit.id}"
        fun active() = manager.getWorkInfosForUniqueWork(key).get(5, TimeUnit.SECONDS)
            .filterNot { it.state.isFinished }
        suspend fun timerFor(time: LocalTime): java.util.UUID {
            val data = repository.nativeSnapshot()
            val saved = data.tracker.habits.first { it.id == habit.id }
            val ticket = nextReminder(data.tracker, saved, data.now, true)
            requireNotNull(ticket)
            assertEquals(time, data.tracker.reminders[habit.id]?.settings?.time)
            val identity = NativeIntents.reminderUri(ticket).toString()
            eventually { active().singleOrNull()?.tags?.contains(identity) == true }
            return active().single().id
        }
        try {
            val original = LocalTime.of(8, 0)
            repository.saveReminder(habit.id, ReminderSettings(original, DAILY_MASK))
            val firstRefresh = NativeWork.request(context, replan = true)
            firstRefresh.result.get(15, TimeUnit.SECONDS)
            val first = timerFor(original)
            NativeWork.request(context).result.get(15, TimeUnit.SECONDS)
            NativeWork.request(context).result.get(15, TimeUnit.SECONDS)
            eventually { manager.getWorkInfosForUniqueWork("habitline-native-refresh").get(5, TimeUnit.SECONDS).all { it.state.isFinished } }
            assertEquals(first, active().single().id)
            val edited = LocalTime.of(9, 15)
            repository.saveReminder(habit.id, ReminderSettings(edited, DAILY_MASK))
            NativeWork.request(context).result.get(15, TimeUnit.SECONDS)
            val replacement = timerFor(edited)
            assertNotEquals(first, replacement)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val originalZone = repository.nativeSnapshot().now.zone.id
                val alternate = if (originalZone == "Asia/Tokyo") "America/New_York" else "Asia/Tokyo"
                try {
                    changeZone(alternate)
                    eventually { repository.nativeSnapshot().now.zone.id == alternate }
                    assertNotEquals(replacement, timerFor(edited))
                } finally {
                    changeZone(originalZone)
                    eventually { repository.nativeSnapshot().now.zone.id == originalZone }
                }
                timerFor(edited)
            } else {
                NativeWork.request(context, replan = true).result.get(15, TimeUnit.SECONDS)
                eventually { active().singleOrNull()?.let { it.id != replacement } == true }
            }
            repository.setArchived(habit.id, true)
            NativeWork.request(context).result.get(15, TimeUnit.SECONDS)
            eventually { active().isEmpty() }
            repository.setArchived(habit.id, false)
            NativeWork.request(context).result.get(15, TimeUnit.SECONDS)
            timerFor(edited)
            repository.saveReminder(habit.id, null)
            NativeWork.request(context).result.get(15, TimeUnit.SECONDS)
            eventually { active().isEmpty() }
        } finally {
            repository.deleteHabit(habit.id)
            NativeWork.request(context)
        }
    }

    private fun changeZone(zone: String) {
        val descriptor = instrumentation.uiAutomation.executeShellCommand("cmd alarm set-timezone $zone")
        val output = android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptor).bufferedReader().use { it.readText() }
        assertFalse(output.contains("Exception") || output.contains("Unknown command"))
    }

    private fun configure(widget: Int, habit: LocalHabit) {
        val intent = Intent(context, WidgetConfigActivity::class.java).setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget)
        ActivityScenario.launch<WidgetConfigActivity>(intent).use { scenario ->
            pollActivity(scenario) { activity ->
                val list = activity.findViewById<android.widget.ListView>(R.id.habitListView)
                val position = (0 until list.count).firstOrNull { list.getItemAtPosition(it).toString().endsWith(habit.name) }
                if (position == null) false else list.performItemClick(null, position, list.getItemIdAtPosition(position))
            }
            val deadline = SystemClock.elapsedRealtime() + 10_000
            while (scenario.state != androidx.lifecycle.Lifecycle.State.DESTROYED && SystemClock.elapsedRealtime() < deadline) {
                SystemClock.sleep(50)
            }
            assertEquals(androidx.lifecycle.Lifecycle.State.DESTROYED, scenario.state)
        }
    }

    private fun <T : android.app.Activity> pollActivity(scenario: ActivityScenario<T>, ready: (T) -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 10_000
        while (SystemClock.elapsedRealtime() < deadline) {
            var result = false
            scenario.onActivity { result = ready(it) }
            if (result) return
            SystemClock.sleep(50)
        }
        error("Expected activity state did not appear")
    }

    private suspend fun eventually(check: suspend () -> Boolean) {
        withTimeout(25_000) { while (!check()) delay(100) }
    }
}
