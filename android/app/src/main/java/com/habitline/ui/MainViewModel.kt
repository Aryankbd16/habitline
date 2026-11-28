package com.habitline.ui

import android.app.Application
import android.os.Bundle
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.habitline.R
import com.habitline.data.ChallengeInput
import com.habitline.data.ChallengeMode
import com.habitline.data.DAILY_MASK
import com.habitline.data.GoalInput
import com.habitline.data.HabitInput
import com.habitline.data.HabitRepository
import com.habitline.data.LocalGoal
import com.habitline.data.LocalHabit
import com.habitline.data.PersonalChallenge
import com.habitline.data.ReportPeriod
import com.habitline.data.LocalSettings
import com.habitline.data.TrackerSnapshot
import com.habitline.widget.HabitWidgetProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit
import java.util.UUID

internal sealed interface StorageState {
    data object Loading : StorageState
    data object Unavailable : StorageState
    data class Ready(val snapshot: TrackerSnapshot) : StorageState
}

internal enum class Tab { DASHBOARD, HABITS, CALENDAR, PROGRESS, PROFILE }

internal enum class ProgressPanel { ANALYTICS, GOALS, REWARDS, CHALLENGES }

internal class MainViewModel(application: Application, private val saved: SavedStateHandle) : AndroidViewModel(application) {
    private val repository = HabitRepository(application)
    private val storageState = MutableStateFlow<StorageState>(StorageState.Loading)
    private val localTime = MutableStateFlow(hour())
    private val operationRunning = MutableStateFlow(false)
    private val operationMessage = MutableStateFlow<String?>(null)
    private var observation: Job? = null
    val storage = storageState.asStateFlow()
    val time = localTime.asStateFlow()
    val busy = operationRunning.asStateFlow()
    val message = operationMessage.asStateFlow()
    val route = saved.getStateFlow("route", Tab.DASHBOARD.name)

    var showArchived: Boolean
        get() = saved["archived"] ?: false
        set(value) { saved["archived"] = value }
    var calendarDate: LocalDate?
        get() = saved.get<String>("calendarDate")?.let(LocalDate::parse)
        set(value) { saved["calendarDate"] = value?.toString() }
    var profileDraft: Bundle?
        get() = saved["profileDraft"]
        set(value) { saved["profileDraft"] = value }
    val editor: Bundle? get() = saved["editor"]

    var progressPanel: ProgressPanel
        get() = ProgressPanel.valueOf(saved.get<String>("progressPanel") ?: ProgressPanel.ANALYTICS.name)
        set(value) { saved["progressPanel"] = value.name }
    var reportPeriod: ReportPeriod
        get() = ReportPeriod.valueOf(saved.get<String>("reportPeriod") ?: ReportPeriod.WEEK.name)
        set(value) { saved["reportPeriod"] = value.name }
    var reportOffset: Int
        get() = saved["reportOffset"] ?: 0
        set(value) { saved["reportOffset"] = value }
    var reportHabit: String?
        get() = saved["reportHabit"]
        set(value) { saved["reportHabit"] = value }
    val targetDraft: Bundle? get() = saved["targetDraft"]

    fun openAnalytics(habit: String) {
        reportHabit = habit
        progressPanel = ProgressPanel.ANALYTICS
        selectTab(Tab.PROGRESS)
    }

    fun openGoal(snapshot: TrackerSnapshot, goal: LocalGoal? = null) {
        openTarget(
            challenge = false, id = goal?.id, title = goal?.title, description = goal?.description,
            target = goal?.target, start = goal?.startDate ?: snapshot.today.toString(), end = goal?.targetDate,
            links = goal?.let { snapshot.progress.goalLinks(it.id) }.orEmpty()
        )
    }

    fun openChallenge(snapshot: TrackerSnapshot, challenge: PersonalChallenge? = null) {
        openTarget(
            challenge = true, id = challenge?.id, title = challenge?.title, description = challenge?.description,
            target = challenge?.target, start = challenge?.startDate ?: snapshot.today.toString(),
            end = challenge?.endDate ?: snapshot.today.plusDays(6).toString(),
            links = challenge?.let { snapshot.progress.challengeLinks(it.id) }.orEmpty(),
            mode = challenge?.kind ?: ChallengeMode.COUNT.key
        )
    }

    private fun openTarget(
        challenge: Boolean, id: String?, title: String?, description: String?, target: Int?,
        start: String, end: String?, links: Set<String>, mode: String = ChallengeMode.COUNT.key
    ) {
        if (operationRunning.value) return
        saved["targetDraft"] = Bundle().apply {
            putString("id", id ?: UUID.randomUUID().toString())
            putBoolean("editing", id != null)
            putBoolean("challenge", challenge)
            putString("title", title.orEmpty())
            putString("description", description.orEmpty())
            putString("target", target?.toString().orEmpty())
            putString("start", start)
            putString("end", end)
            putStringArrayList("links", ArrayList(links))
            putString("mode", mode)
        }
        saved["route"] = "target"
    }

    fun changeTargetDraft(change: Bundle.() -> Unit) {
        saved["targetDraft"] = Bundle(requireNotNull(targetDraft)).apply(change).apply { putBoolean("dirty", true) }
    }

    fun closeTarget() {
        selectTab(Tab.PROGRESS)
        saved.remove<Bundle>("targetDraft")
    }

    fun saveGoal(input: GoalInput) {
        val draft = requireNotNull(targetDraft)
        mutate(success = { closeTarget() }) {
            repository.saveGoal(requireNotNull(draft.getString("id")), draft.getBoolean("editing"), input)
        }
    }

    fun saveChallenge(input: ChallengeInput) {
        val draft = requireNotNull(targetDraft)
        mutate(success = { closeTarget() }) {
            repository.saveChallenge(requireNotNull(draft.getString("id")), draft.getBoolean("editing"), input)
        }
    }

    fun archiveTarget(id: String, challenge: Boolean, archived: Boolean) = mutate {
        repository.archiveTarget(id, challenge, archived)
    }

    fun deleteTarget(id: String, challenge: Boolean) = mutate {
        repository.deleteTarget(id, challenge)
    }

    init { load() }

    fun load() {
        if (observation?.isActive == true) return
        storageState.value = StorageState.Loading
        observation = viewModelScope.launch {
            try {
                repository.observe().collect { snapshot ->
                    val draft = editor
                    if (!operationRunning.value && route.value == "editor" && draft?.getBoolean("editing") == false &&
                        snapshot.habits.any { it.id == draft.getString("id") }
                    ) closeEditor()
                    val previous = (storageState.value as? StorageState.Ready)?.snapshot
                    if (previous != null) {
                        val earned = previous.progress.milestones.mapTo(mutableSetOf()) { it.id }
                        snapshot.progress.milestones.firstOrNull { it.id !in earned }?.let {
                            operationMessage.value = getApplication<Application>().getString(R.string.achievement_earned, it.title)
                        }
                    }
                    storageState.value = StorageState.Ready(snapshot)
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Log.e(TAG, "Could not open local records", error)
                storageState.value = StorageState.Unavailable
            }
        }
    }

    fun refreshTime() { localTime.value = hour() }
    fun clearMessage() { operationMessage.value = null }

    fun selectTab(tab: Tab) { saved["route"] = tab.name }
    fun openHabit(id: String) {
        if (operationRunning.value) return
        saved["detailParent"] = route.value
        saved["route"] = "detail/$id"
    }

    fun openEditor(snapshot: TrackerSnapshot, habit: LocalHabit? = null) {
        if (operationRunning.value) return
        val schedule = habit?.let { snapshot.latestSchedule(it.id) }
        saved["editorParent"] = route.value
        saved["editor"] = Bundle().apply {
            putString("id", habit?.id ?: UUID.randomUUID().toString())
            putBoolean("editing", habit != null)
            putString("name", habit?.name.orEmpty())
            putString("description", habit?.description.orEmpty())
            putString("category", habit?.category ?: "General")
            putString("icon", habit?.icon ?: "⭐")
            putString("priority", habit?.priority ?: "medium")
            putString("xp", (habit?.xpValue ?: 10).toString())
            putString("points", (schedule?.points ?: 10.0).toBigDecimal().stripTrailingZeros().toPlainString())
            putString("start", schedule?.startDate ?: snapshot.today.toString())
            putBoolean("daily", schedule == null || schedule.weekdayMask == DAILY_MASK)
            putInt("weekdays", if (schedule == null || schedule.weekdayMask == DAILY_MASK) 62 else schedule.weekdayMask)
        }
        saved["route"] = "editor"
    }

    fun changeDraft(change: Bundle.() -> Unit) {
        saved["editor"] = Bundle(requireNotNull(editor)).apply(change).apply { putBoolean("dirty", true) }
    }

    fun closeEditor() {
        saved["route"] = saved.get<String>("editorParent") ?: Tab.HABITS.name
        saved.remove<Bundle>("editor")
    }

    fun closeDetail() { saved["route"] = saved.get<String>("detailParent") ?: Tab.HABITS.name }

    fun saveHabit(input: HabitInput) {
        val draft = requireNotNull(editor)
        val id = requireNotNull(draft.getString("id"))
        val editing = draft.getBoolean("editing")
        mutate(widgets = true, success = { closeEditor() }) {
            if (editing) repository.updateHabit(id, input) else repository.addHabit(id, input)
        }
    }

    fun setCompleted(id: String, date: LocalDate, desired: Boolean) = mutate(widgets = true) {
        repository.setCompleted(id, date, desired)
    }

    fun setArchived(id: String, archived: Boolean) = mutate(widgets = true) {
        repository.setArchived(id, archived)
    }

    fun deleteHabit(id: String) = mutate(widgets = true, success = { closeDetail() }) {
        repository.deleteHabit(id)
    }

    fun linkHabits(first: String, second: String, kind: String) = mutate { repository.linkHabits(first, second, kind) }

    fun unlinkHabits(id: String) = mutate { repository.unlinkHabits(id) }

    fun saveSettings(settings: LocalSettings, confirmation: String) = mutate(success = {
        profileDraft = null
        operationMessage.value = confirmation
    }) { repository.saveSettings(settings) }

    private fun mutate(widgets: Boolean = false, success: () -> Unit = {}, action: suspend () -> Unit) {
        if (operationRunning.value) return
        operationRunning.value = true
        viewModelScope.launch {
            try {
                action()
                success()
                if (widgets) {
                    try {
                        HabitWidgetProvider.refreshAll(getApplication())
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        Log.w(TAG, "Could not refresh home-screen widgets", error)
                    }
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Log.e(TAG, "Could not save local change", error)
                operationMessage.value = if (error is IllegalArgumentException) error.message.orEmpty() else "Could not save the change. Try again."
            } finally {
                operationRunning.value = false
            }
        }
    }

    private companion object {
        const val TAG = "Habitline"
        fun hour() = LocalDateTime.now().truncatedTo(ChronoUnit.HOURS)
    }
}
