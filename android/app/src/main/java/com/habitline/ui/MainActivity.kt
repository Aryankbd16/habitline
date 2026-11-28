package com.habitline.ui

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.isVisible
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.habitline.R
import com.habitline.data.ThemeChoice
import com.habitline.databinding.ActivityMainBinding
import com.habitline.databinding.ScreenStorageBinding
import com.habitline.nativework.NativeIntents
import com.habitline.nativework.NativeWork
import com.habitline.nativework.ReminderNotifications
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    internal lateinit var model: MainViewModel
        private set
    internal val content get() = binding.content
    private var activeRoute: String? = null
    private var renderer: ScreenRenderer? = null
    private var changingBar = false
    private var pendingNativeIntent: Intent? = null
    internal var refreshReminderPermission: (() -> Unit)? = null
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        refreshReminderPermission?.invoke()
        NativeWork.request(this)
    }
    private val timeChanges = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            model.refreshTime()
            if (intent.action == Intent.ACTION_DATE_CHANGED) NativeWork.request(context)
        }
    }

    private val exportLegacy = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val raw = getSharedPreferences("habitline_store", MODE_PRIVATE).getString("habitline_store_json", null)
                    checkNotNull(raw)
                    checkNotNull(contentResolver.openOutputStream(uri)).bufferedWriter(Charsets.UTF_8).use { it.write(raw) }
                }
                Toast.makeText(this@MainActivity, R.string.recovery_saved, Toast.LENGTH_LONG).show()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Toast.makeText(this@MainActivity, R.string.recovery_save_failed, Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        model = ViewModelProvider(this)[MainViewModel::class.java]
        binding = ActivityMainBinding.inflate(layoutInflater)
        if (savedInstanceState == null) openNativeHabit(intent)
        setContentView(binding.root)
        WindowInsetsControllerCompat(window, binding.root).isAppearanceLightNavigationBars =
            resources.getBoolean(R.bool.light_system_bars)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        binding.navigation.setOnItemSelectedListener { item ->
            tabItems.entries.firstOrNull { it.value == item.itemId }?.let {
                if (!changingBar) model.selectTab(it.key)
                true
            } ?: false
        }

        val back = object : OnBackPressedCallback(false) {
            override fun handleOnBackPressed() { navigateBack() }
        }
        onBackPressedDispatcher.addCallback(this, back)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    combine(model.storage, model.route, model.time, model.busy) { storage, route, time, busy ->
                        if (!busy) pendingNativeIntent?.let { pending ->
                            pendingNativeIntent = null
                            openNativeHabit(pending)
                        }
                        val result = (storage as? StorageState.Ready)?.snapshot
                        val snapshot = result?.let { if (it.today == time.toLocalDate()) it else it.copy(today = time.toLocalDate()) }
                        if (snapshot == null) {
                            showStorage(storage)
                            back.isEnabled = false
                        } else {
                            showRoute(route)
                            back.isEnabled = route != Tab.DASHBOARD.name
                            renderer?.invoke(snapshot, time, busy)
                            applyTheme(snapshot.settings.theme)
                        }
                    }.collect()
                }
                launch {
                    model.message.collect { message ->
                        if (!message.isNullOrBlank()) {
                            Snackbar.make(binding.root, message, Snackbar.LENGTH_LONG).apply {
                                if (binding.navigation.isVisible) setAnchorView(binding.navigation)
                            }.show()
                            model.clearMessage()
                        }
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshReminderPermission?.invoke()
        NativeWork.request(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openNativeHabit(intent)
    }

    internal fun enableReminderNotifications() {
        val notifications = ReminderNotifications(this)
        val prefs = getSharedPreferences("notification-permission", MODE_PRIVATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            notifications.runtimePermissionMissing() && !prefs.getBoolean("asked", false)
        ) {
            prefs.edit().putBoolean("asked", true).apply()
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }
    }

    private fun openNativeHabit(intent: Intent) {
        val id = NativeIntents.openHabit(intent) ?: return
        if (model.busy.value) {
            pendingNativeIntent = intent
            return
        }
        val discard = when (model.route.value) {
            "editor" -> if (model.editor?.getBoolean("dirty") == true) model::closeEditor else null
            "target" -> if (model.targetDraft?.getBoolean("dirty") == true) model::closeTarget else null
            "reminder" -> if (model.reminderDraft?.getBoolean("dirty") == true) model::closeReminder else null
            else -> null
        }
        if (discard == null) {
            model.openNativeHabit(id)
            return
        }
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.discard_changes)
            .setNegativeButton(R.string.keep_editing, null)
            .setPositiveButton(R.string.discard) { _, _ ->
                discard()
                model.openNativeHabit(id)
            }.show()
    }

    override fun onStart() {
        model.refreshTime()
        super.onStart()
        ContextCompat.registerReceiver(this, timeChanges, IntentFilter().apply {
            addAction(Intent.ACTION_TIME_TICK)
            addAction(Intent.ACTION_DATE_CHANGED)
            addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_TIMEZONE_CHANGED)
        }, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onStop() {
        unregisterReceiver(timeChanges)
        super.onStop()
    }

    private fun showStorage(state: StorageState) {
        val loading = state == StorageState.Loading
        val route = if (loading) "loading" else "unavailable"
        if (activeRoute == route) return
        switchScreen(route, R.string.app_name, back = false)
        binding.navigation.isVisible = false
        val status = ScreenStorageBinding.inflate(layoutInflater, content, false)
        content.addView(status.root)
        status.message.setText(if (loading) R.string.local_storage_loading else R.string.storage_recovery_message)
        status.loadingIndicator.isVisible = loading
        status.retry.isVisible = !loading
        status.retry.setOnClickListener { model.load() }
        status.export.isVisible = !loading && getSharedPreferences("habitline_store", MODE_PRIVATE).contains("habitline_store_json")
        status.export.setOnClickListener { exportLegacy.launch("habitline-legacy.json") }
    }

    private fun showRoute(route: String) {
        if (activeRoute == route) return
        val tab = Tab.entries.firstOrNull { it.name == route }
        val title = when (tab) {
            Tab.DASHBOARD -> R.string.app_name
            Tab.HABITS -> R.string.habits
            Tab.CALENDAR -> R.string.calendar
            Tab.PROFILE -> R.string.profile
            Tab.PROGRESS -> R.string.progress_hub
            null -> if (route == "reminder") R.string.reminder_settings else if (route == "target") targetTitle()
                else if (route.startsWith("detail/")) R.string.habit_detail
                else if (model.editor?.getBoolean("editing") == true) R.string.edit_habit else R.string.new_habit_title
        }
        switchScreen(route, title, back = tab == null)
        binding.navigation.isVisible = tab != null
        if (tab != null) {
            changingBar = true
            binding.navigation.selectedItemId = tabItems.getValue(tab)
            changingBar = false
        }
        renderer = when (tab) {
            Tab.DASHBOARD -> dashboardScreen()
            Tab.HABITS -> habitsScreen()
            Tab.CALENDAR -> calendarScreen()
            Tab.PROFILE -> profileScreen()
            Tab.PROGRESS -> progressScreen()
            null -> when {
                route == "target" -> targetScreen()
                route == "reminder" -> reminderScreen()
                route.startsWith("detail/") -> detailScreen(route.substringAfter('/'))
                else -> editorScreen()
            }
        }
    }

    private fun switchScreen(route: String, title: Int, back: Boolean) {
        WindowInsetsControllerCompat(window, binding.root).hide(WindowInsetsCompat.Type.ime())
        content.removeAllViews()
        renderer = null
        activeRoute = route
        binding.toolbar.setTitle(title)
        if (back) {
            binding.toolbar.setNavigationIcon(R.drawable.ic_back)
            binding.toolbar.setNavigationContentDescription(R.string.navigate_back)
            binding.toolbar.setNavigationIconTint(getColor(R.color.app_text))
            binding.toolbar.setNavigationOnClickListener { navigateBack() }
        } else binding.toolbar.navigationIcon = null
    }

    private fun navigateBack() {
        if (model.busy.value) return
        when {
            model.route.value == "editor" -> {
                if (model.editor?.getBoolean("dirty") != true) model.closeEditor()
                else MaterialAlertDialogBuilder(this)
                    .setTitle(R.string.discard_changes)
                    .setNegativeButton(R.string.keep_editing, null)
                    .setPositiveButton(R.string.discard) { _, _ -> model.closeEditor() }
                    .show()
            }
            model.route.value == "target" -> {
                if (model.targetDraft?.getBoolean("dirty") != true) model.closeTarget()
                else MaterialAlertDialogBuilder(this)
                    .setTitle(R.string.discard_changes)
                    .setNegativeButton(R.string.keep_editing, null)
                    .setPositiveButton(R.string.discard) { _, _ -> model.closeTarget() }
                    .show()
            }
            model.route.value == "reminder" -> {
                if (model.reminderDraft?.getBoolean("dirty") != true) model.closeReminder()
                else MaterialAlertDialogBuilder(this)
                    .setTitle(R.string.discard_changes)
                    .setNegativeButton(R.string.keep_editing, null)
                    .setPositiveButton(R.string.discard) { _, _ -> model.closeReminder() }
                    .show()
            }
            model.route.value.startsWith("detail/") -> model.closeDetail()
            else -> model.selectTab(Tab.DASHBOARD)
        }
    }

    private fun applyTheme(theme: ThemeChoice) {
        val mode = when (theme) {
            ThemeChoice.SYSTEM -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            ThemeChoice.LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
            ThemeChoice.DARK -> AppCompatDelegate.MODE_NIGHT_YES
        }
        if (delegate.localNightMode != mode) delegate.localNightMode = mode
    }

    private val tabItems = mapOf(
        Tab.DASHBOARD to R.id.nav_dashboard,
        Tab.HABITS to R.id.nav_habits,
        Tab.CALENDAR to R.id.nav_calendar,
        Tab.PROGRESS to R.id.nav_progress,
        Tab.PROFILE to R.id.nav_profile
    )
}
