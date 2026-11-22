package com.habitline.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.habitline.R
import com.habitline.data.Habit
import com.habitline.data.HabitRepository
import com.habitline.databinding.ActivityMainBinding
import com.habitline.databinding.ItemHabitBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText

/**
 * A minimal local habit list so the widget has something to display. This is
 * NOT the full Phase-1 experience — that's the web app. This screen exists
 * so the Android widget is a genuinely working, self-contained prototype
 * rather than a mockup with nothing behind it, per the spec's "do not fake
 * synchronization" requirement.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var repo: HabitRepository
    private lateinit var adapter: HabitAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        repo = HabitRepository(this)

        adapter = HabitAdapter(
            onToggle = { habit ->
                repo.toggleCompletion(habit.id)
                refresh()
            },
            onDelete = { habit ->
                MaterialAlertDialogBuilder(this)
                    .setTitle(getString(R.string.delete_habit_title))
                    .setMessage(getString(R.string.delete_habit_message, habit.name))
                    .setNegativeButton(R.string.cancel, null)
                    .setPositiveButton(R.string.delete) { _, _ ->
                        repo.deleteHabit(habit.id)
                        refresh()
                    }
                    .show()
            }
        )
        binding.habitList.layoutManager = LinearLayoutManager(this)
        binding.habitList.adapter = adapter

        binding.fabAdd.setOnClickListener { showAddHabitDialog() }

        binding.helpText.text = getString(R.string.sync_limitation_notice)

        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val store = repo.load()
        adapter.submit(store.habits, repo)
        binding.emptyState.visibility = if (store.habits.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun showAddHabitDialog() {
        val dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_add_habit, null)
        val nameInput = dialogView.findViewById<TextInputEditText>(R.id.input_name)
        val pointsInput = dialogView.findViewById<TextInputEditText>(R.id.input_points)
        val iconSpinner = dialogView.findViewById<android.widget.Spinner>(R.id.input_icon)

        val icons = listOf("⭐", "📚", "💪", "🧘", "💧", "🏃", "🎯", "🛌")
        iconSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, icons)

        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.new_habit_title)
            .setView(dialogView)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.create) { _, _ ->
                val name = nameInput.text?.toString()?.trim().orEmpty()
                val points = pointsInput.text?.toString()?.toIntOrNull() ?: 10
                val icon = icons[iconSpinner.selectedItemPosition]
                if (name.isNotEmpty()) {
                    repo.addHabit(name, icon, points)
                    refresh()
                }
            }
            .show()
    }
}

private class HabitAdapter(
    val onToggle: (Habit) -> Unit,
    val onDelete: (Habit) -> Unit
) : RecyclerView.Adapter<HabitAdapter.VH>() {

    private var items: List<Habit> = emptyList()
    private lateinit var repo: HabitRepository

    fun submit(newItems: List<Habit>, repository: HabitRepository) {
        items = newItems
        repo = repository
        notifyDataSetChanged()
    }

    inner class VH(val binding: ItemHabitBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemHabitBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val habit = items[position]
        val completed = repo.isCompletedOn(habit.id, repo.today())
        val streak = repo.currentStreak(habit.id)
        holder.binding.habitName.text = "${habit.icon}  ${habit.name}"
        holder.binding.habitMeta.text = holder.itemView.context.getString(
            R.string.habit_meta_format, habit.points, streak
        )
        holder.binding.checkButton.isSelected = completed
        holder.binding.checkButton.setOnClickListener { onToggle(habit) }
        holder.binding.root.setOnLongClickListener { onDelete(habit); true }
    }

    override fun getItemCount() = items.size
}
