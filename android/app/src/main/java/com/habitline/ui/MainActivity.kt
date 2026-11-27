package com.habitline.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Spinner
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.habitline.R
import com.habitline.data.HabitRepository
import com.habitline.data.LocalHabit
import com.habitline.data.TrackerSnapshot
import com.habitline.data.scheduledOn
import com.habitline.databinding.ActivityMainBinding
import com.habitline.databinding.ItemHabitBinding
import com.habitline.widget.HabitWidgetProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private val repo by lazy { HabitRepository(this) }
    private val exportLegacy = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val raw = getSharedPreferences("habitline_store", MODE_PRIVATE).getString("habitline_store_json", null)
                    checkNotNull(raw) { "No legacy JSON found." }
                    checkNotNull(contentResolver.openOutputStream(uri)).bufferedWriter(Charsets.UTF_8).use { it.write(raw) }
                }
                Toast.makeText(this@MainActivity, "Recovery copy saved", Toast.LENGTH_LONG).show()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Toast.makeText(this@MainActivity, "Could not save the recovery copy", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        val adapter = HabitAdapter(
            onToggle = { habit, state ->
                mutate { repo.setCompleted(habit.id, state.today, !state.isDone(habit.id)) }
            },
            onDelete = { habit ->
                MaterialAlertDialogBuilder(this)
                    .setTitle(R.string.delete_habit_title)
                    .setMessage(getString(R.string.delete_habit_message, habit.name))
                    .setNegativeButton(R.string.cancel, null)
                    .setPositiveButton(R.string.delete) { _, _ -> mutate { repo.deleteHabit(habit.id) } }
                    .show()
            }
        )
        binding.habitList.layoutManager = LinearLayoutManager(this)
        binding.habitList.adapter = adapter
        binding.emptyState.visibility = View.GONE
        binding.fabAdd.isEnabled = false
        binding.fabAdd.setOnClickListener { showAddHabitDialog() }
        binding.helpText.setText(R.string.local_storage_loading)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                try {
                    repo.observe().collect { state ->
                        adapter.submit(state)
                        binding.helpText.setText(R.string.sync_limitation_notice)
                        binding.emptyState.visibility = if (state.habits.isEmpty()) View.VISIBLE else View.GONE
                        binding.fabAdd.isEnabled = true
                    }
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    binding.fabAdd.isEnabled = false
                    binding.emptyState.visibility = View.GONE
                    binding.helpText.setText(R.string.storage_recovery_message)
                    MaterialAlertDialogBuilder(this@MainActivity)
                        .setTitle(R.string.storage_recovery_title)
                        .setMessage(R.string.storage_recovery_message)
                        .setNeutralButton(R.string.save_original) { _, _ -> exportLegacy.launch("habitline-legacy.json") }
                        .setPositiveButton(R.string.retry_storage) { _, _ -> recreate() }
                        .show()
                }
            }
        }
    }

    private fun mutate(action: suspend () -> Unit) = lifecycleScope.launch {
        try {
            action()
            HabitWidgetProvider.refreshAll(this@MainActivity)
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Toast.makeText(this@MainActivity, error.message ?: "Could not update habit", Toast.LENGTH_LONG).show()
        }
    }

    private fun showAddHabitDialog() {
        val view = layoutInflater.inflate(R.layout.dialog_add_habit, null)
        val nameInput = view.findViewById<TextInputEditText>(R.id.input_name)
        val pointsInput = view.findViewById<TextInputEditText>(R.id.input_points)
        val icons = view.findViewById<Spinner>(R.id.input_icon)
        icons.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("⭐", "📚", "💪", "🧘", "💧", "🏃", "🎯", "🛌"))
        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle(R.string.new_habit_title).setView(view)
            .setNegativeButton(R.string.cancel, null).setPositiveButton(R.string.create, null).create()
        dialog.setOnShowListener {
            dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val name = nameInput.text?.toString()?.trim().orEmpty()
                val points = pointsInput.text?.toString()?.toIntOrNull()
                if (name.isEmpty()) nameInput.error = "Enter a habit name"
                else if (points == null || points < 0) pointsInput.error = "Enter nonnegative whole points"
                else {
                    val icon = icons.selectedItem.toString()
                    mutate { repo.addHabit(name, icon, points) }
                    dialog.dismiss()
                }
            }
        }
        dialog.show()
    }
}

private class HabitAdapter(
    val onToggle: (LocalHabit, TrackerSnapshot) -> Unit,
    val onDelete: (LocalHabit) -> Unit
) : RecyclerView.Adapter<HabitAdapter.VH>() {
    private var state: TrackerSnapshot? = null

    fun submit(value: TrackerSnapshot) {
        state = value
        notifyDataSetChanged()
    }

    class VH(val binding: ItemHabitBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = VH(
        ItemHabitBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: VH, position: Int) {
        val snapshot = requireNotNull(state)
        val habit = snapshot.habits[position]
        val schedule = snapshot.schedule(habit.id)
        val completed = snapshot.isDone(habit.id)
        with(holder.binding) {
            habitName.text = "${habit.icon}  ${habit.name}"
            habitMeta.text = root.context.getString(R.string.habit_meta_decimal, schedule?.points ?: 0.0, snapshot.streak(habit.id))
            checkButton.isSelected = completed
            checkButton.isEnabled = completed || schedule.scheduledOn(snapshot.today)
            checkButton.setImageResource(if (completed) R.drawable.ic_check_filled else R.drawable.ic_check_outline)
            checkButton.setContentDescription(root.context.getString(if (completed) R.string.undo_complete else R.string.toggle_complete))
            checkButton.setOnClickListener { onToggle(habit, snapshot) }
            root.setOnLongClickListener { onDelete(habit); true }
        }
    }

    override fun getItemCount() = state?.habits?.size ?: 0
}
