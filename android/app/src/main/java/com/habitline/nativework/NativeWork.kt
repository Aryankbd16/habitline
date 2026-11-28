package com.habitline.nativework

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.Operation
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.habitline.data.HabitRepository
import com.habitline.data.nextReminder
import com.habitline.widget.HabitWidgetProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeUnit

internal object NativeWork {
    const val URI = "uri"
    const val FINISHED = "finished"
    const val REMOVED = "removed"
    const val REPLAN = "replan"
    const val TIMER_TAG = "habitline-native-timer"
    const val RECOVERY = "habitline-native-recovery"
    private const val REFRESH = "habitline-native-refresh"
    private const val ACTIONS = "habitline-native-actions"

    fun request(context: Context, finished: String? = null, removed: IntArray = intArrayOf(), replan: Boolean = false): Operation =
        WorkManager.getInstance(context).enqueueUniqueWork(
            REFRESH, ExistingWorkPolicy.APPEND_OR_REPLACE,
            OneTimeWorkRequestBuilder<NativeRefreshWorker>()
                .setInputData(workDataOf(FINISHED to finished, REMOVED to removed, REPLAN to replan)).build()
        )

    fun action(context: Context, uri: Uri): Operation = WorkManager.getInstance(context).enqueueUniqueWork(
        ACTIONS, ExistingWorkPolicy.APPEND_OR_REPLACE,
        OneTimeWorkRequestBuilder<NativeActionWorker>().setInputData(workDataOf(URI to uri.toString())).build()
    )
}

internal fun BroadcastReceiver.persistNative(operation: () -> Operation) {
    val pending = goAsync()
    val enqueued = try {
        operation()
    } catch (error: Exception) {
        Log.w("HabitlineNative", "Could not enqueue native request", error)
        pending.finish()
        return
    }
    CoroutineScope(Dispatchers.IO).launch {
        try {
            enqueued.result.get(8, TimeUnit.SECONDS)
        } catch (error: Exception) {
            Log.w("HabitlineNative", "Could not persist native request", error)
        } finally {
            pending.finish()
        }
    }
}

class NativeRefreshReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
                Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) return
        persistNative { NativeWork.request(context, replan = true) }
    }
}

class ReminderCompletionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != NativeIntents.COMPLETE || NativeIntents.readReminder(intent.data) == null) return
        val uri = requireNotNull(intent.data)
        persistNative { NativeWork.action(context, uri) }
    }
}

class NativeRefreshWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    private data class Timer(val key: String, val identity: String, val due: Instant, val payload: String?)

    override suspend fun doWork(): Result = nativeResult {
        val context = applicationContext
        val repository = HabitRepository(context)
        val widgets = HabitWidgetProvider.ids(context)
        val removed = (inputData.getIntArray(NativeWork.REMOVED) ?: intArrayOf()).filter { it !in widgets }
        if (removed.isNotEmpty()) repository.clearWidgets(removed.toIntArray())
        val native = try {
            repository.nativeSnapshot()
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            HabitWidgetProvider.showRecovery(context, widgets)
            throw error
        }
        val notifications = ReminderNotifications(context)
        val catchUp = notifications.available()
        notifications.dismissObsolete(native)
        HabitWidgetProvider.renderAll(context, widgets, native.tracker)

        val now = native.now
        val desired = native.tracker.habits.mapNotNull { habit ->
            nextReminder(native.tracker, habit, now, catchUp)?.let { ticket ->
                val payload = NativeIntents.reminderUri(ticket).toString()
                Timer("habitline-reminder/${habit.id}", payload, ticket.due, payload)
            }
        }.toMutableList()
        if (widgets.isNotEmpty()) {
            val midnight = now.toLocalDate().plusDays(1).atStartOfDay(now.zone).toInstant()
            desired.add(Timer("habitline-widget-midnight", "midnight/$midnight", midnight, null))
        }

        val manager = WorkManager.getInstance(context)
        val finished = inputData.getString(NativeWork.FINISHED)
        val existing = manager.getWorkInfosByTag(NativeWork.TIMER_TAG).get(15, TimeUnit.SECONDS)
            .filterNot { it.state.isFinished }.toMutableList()
        val replan = inputData.getBoolean(NativeWork.REPLAN, false)
        for (timer in desired) {
            val retained = if (replan) null else existing.firstOrNull { it.id.toString() != finished && timer.identity in it.tags }
            if (retained != null) {
                existing.remove(retained)
                continue
            }
            val delay = Duration.between(Instant.now(), timer.due).toMillis().coerceAtLeast(0)
            val request = OneTimeWorkRequestBuilder<NativeTimerWorker>()
                .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .setInputData(workDataOf(NativeWork.URI to timer.payload))
                .addTag(NativeWork.TIMER_TAG).addTag(timer.identity).build()
            manager.enqueueUniqueWork(timer.key, ExistingWorkPolicy.REPLACE, request).result.get(15, TimeUnit.SECONDS)
        }
        for (stale in existing) manager.cancelWorkById(stale.id).result.get(15, TimeUnit.SECONDS)

        if (desired.none { it.payload != null }) manager.cancelUniqueWork(NativeWork.RECOVERY).result.get(15, TimeUnit.SECONDS)
        else {
            val recovery = PeriodicWorkRequestBuilder<NativeRecoveryWorker>(1, TimeUnit.HOURS)
                .setInitialDelay(1, TimeUnit.HOURS).build()
            manager.enqueueUniquePeriodicWork(NativeWork.RECOVERY, ExistingPeriodicWorkPolicy.KEEP, recovery)
                .result.get(15, TimeUnit.SECONDS)
        }
    }
}

class NativeTimerWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = nativeResult {
        val context = applicationContext
        val ticket = inputData.getString(NativeWork.URI)?.let(Uri::parse)?.let(NativeIntents::readReminder)
        if (ticket != null) {
            val notifications = ReminderNotifications(context)
            HabitRepository(context).deliverReminder(ticket) { notifications.publish(it, ticket) }
        }
        NativeWork.request(context, finished = id.toString()).result.get(15, TimeUnit.SECONDS)
    }
}

class NativeRecoveryWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = nativeResult {
        NativeWork.request(applicationContext).result.get(15, TimeUnit.SECONDS)
    }
}

class NativeActionWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = nativeResult {
        val context = applicationContext
        val uri = inputData.getString(NativeWork.URI)?.let(Uri::parse)
        val repository = HabitRepository(context)
        val mark = NativeIntents.readWidgetMark(uri)
        val ticket = NativeIntents.readReminder(uri)
        if (mark != null && mark.widget in HabitWidgetProvider.ids(context)) {
            repository.completeFromWidget(mark, HabitWidgetProvider.rowLimit(context, mark.widget))
        }
        if (ticket != null) {
            repository.completeFromReminder(ticket)
            ReminderNotifications(context).dismiss(ticket)
        }
        NativeWork.request(context).result.get(15, TimeUnit.SECONDS)
    }
}

private suspend fun CoroutineWorker.nativeResult(operation: suspend () -> Unit): ListenableResult = withContext(Dispatchers.IO) {
    try {
        operation()
        ListenableResult.success()
    } catch (error: Exception) {
        if (error is CancellationException) throw error
        Log.w("HabitlineNative", "Native work failed", error)
        if (runAttemptCount < 3) ListenableResult.retry() else ListenableResult.failure()
    }
}

private typealias ListenableResult = androidx.work.ListenableWorker.Result
