import { useState, useEffect, useId } from 'react'
import Modal from './Modal'
import { useHabits } from '../context/HabitsContext'
import { todayStr } from '../lib/dateUtils'
import { Archive } from 'lucide-react'

const ICON_GROUPS = [
  { name: 'All', icons: ['⭐', '📚', '💪', '🧘', '💧', '🏃', '🧑‍💻', '🎯', '🎨', '🛌', '🍎', '✍️', '📖', '🧠', '✏️', '🎓', '💻', '🧮', '🏋️', '🚴', '⚽', '🏊', '🥗', '😴', '❤️', '🩺', '✅', '⏱️', '📅', '📝', '🔥', '🌱', '🎸', '🎵', '🗣️', '💰', '💳', '📈', '🏦', '☀️', '🌙', '🏠', '🧹', '🛒'] },
  { name: 'Education', icons: ['📚', '📖', '🧠', '✏️', '🎓', '💻', '🧮', '✍️', '🧑‍💻'] },
  { name: 'Fitness', icons: ['🏃', '🏋️', '🚴', '🧘', '⚽', '🏊', '💪'] },
  { name: 'Health', icons: ['💧', '🥗', '😴', '❤️', '🩺', '🍎', '🛌'] },
  { name: 'Productivity', icons: ['🎯', '✅', '⏱️', '📅', '📝', '🔥', '⭐'] },
  { name: 'Personal', icons: ['🌱', '🎸', '🎨', '🎵', '🗣️'] },
  { name: 'Finance', icons: ['💰', '💳', '📈', '🏦'] },
  { name: 'Lifestyle', icons: ['☀️', '🌙', '🏠', '🧹', '🛒'] },
]

const CATEGORIES = ['Study', 'Coding', 'Projects', 'Fitness', 'Health', 'Sleep', 'Nutrition', 'Reading', 'Finance', 'Productivity', 'Career', 'Personal', 'General', 'Other']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const emptyForm = {
  name: '',
  description: '',
  category: 'General',
  icon: '⭐',
  frequencyType: 'daily',
  days: [1, 2, 3, 4, 5],
  points: 10,
  xpValue: 10,
  priority: 'medium',
  startDate: todayStr(),
  reminderTime: '',
}

export default function AddHabitModal({ open, onClose, editingHabit }) {
  const { addHabit, editHabit, habits } = useHabits()
  const [form, setForm] = useState(() => ({ ...emptyForm, startDate: todayStr() }))
  const [activeIconGroup, setActiveIconGroup] = useState('All')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editingHabit) {
      setForm({
        name: editingHabit.name,
        description: editingHabit.description || '',
        category: editingHabit.category || 'General',
        icon: editingHabit.icon || '⭐',
        frequencyType: editingHabit.frequency?.type || 'daily',
        days: editingHabit.frequency?.days || [1, 2, 3, 4, 5],
        points: editingHabit.points ?? 10,
        xpValue: editingHabit.xpValue ?? 10,
        priority: editingHabit.priority || 'medium',
        startDate: editingHabit.startDate || todayStr(),
        reminderTime: editingHabit.reminderTime || '',
      })
    } else if (open) {
      setForm({ ...emptyForm, startDate: todayStr() })
      setError('')
      setActiveIconGroup('All')
    }
  }, [editingHabit, open])

  const toggleDay = (d) => {
    setForm((f) => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort(),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.frequencyType !== 'daily' && !form.days.length) return setError('Select at least one weekday.')
    if (!form.name.trim()) return setError('Give your habit a name.')
    const points = Number(form.points)
    if (!Number.isFinite(points) || points < 0) return setError('Points must be a non-negative number.')

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description,
        category: form.category,
        icon: form.icon,
        points,
        xpValue: Number(form.xpValue),
        priority: form.priority,
        startDate: form.startDate,
        reminderTime: form.reminderTime || null,
        frequency:
          form.frequencyType === 'daily'
            ? { type: 'daily' }
            : { type: 'weekly', days: form.days },
      }
      if (editingHabit) {
        await editHabit(editingHabit.id, payload)
      } else {
        await addHabit(payload)
      }
      onClose()
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const categoryList = useId()
  const categories = [...new Set([...CATEGORIES, 'DSA', 'Clinical Preparation', 'Revision', ...habits.map((habit) => habit.category)])]
  const currentIcons = ICON_GROUPS.find((g) => g.name === activeIconGroup)?.icons || ICON_GROUPS[0].icons

  return (
    <Modal open={open} onClose={onClose} title={editingHabit ? 'Edit habit' : 'Create new habit'} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Habit Name & Current Icon */}
        <div>
          <label className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
            Habit Name & Icon
          </label>
          <div className="flex gap-3 items-center">
            <div className="w-13 h-13 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/40 flex items-center justify-center text-2xl shrink-0 shadow-sm shadow-[var(--accent)]/15">
              {form.icon}
            </div>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Morning Meditation"
              className="flex-1 bg-[var(--bg-surface-elevated)] text-[var(--text-main)] placeholder-[var(--text-subtle)] rounded-2xl px-4 py-3.5 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition font-medium"
            />
          </div>
        </div>

        {/* Icon Picker */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">Select Icon</span>
            <div className="flex gap-1 overflow-x-auto pb-1 max-w-[280px] sm:max-w-none scrollbar-none">
              {ICON_GROUPS.map((g) => (
                <button
                  type="button"
                  key={g.name}
                  onClick={() => setActiveIconGroup(g.name)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                    activeIconGroup === g.name
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)]'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 p-2.5 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] max-h-36 overflow-y-auto">
            {currentIcons.map((ic) => (
              <IconButton key={ic} icon={ic} selected={form.icon === ic} onClick={() => setForm((f) => ({ ...f, icon: ic }))} />
            ))}
          </div>
        </div>

        {/* Description */}
        <Field label="Description (optional)">
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Why do you want to build this habit?"
            rows={2}
            className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] placeholder-[var(--text-subtle)] rounded-2xl px-4 py-3 text-sm outline-none resize-none border border-[var(--border-color)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition font-medium"
          />
        </Field>

        {/* Category & Points Reward */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <input
              list={categoryList}
              maxLength={60}
              required
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] rounded-2xl px-3.5 py-3 text-sm border border-[var(--border-color)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition font-medium outline-none"
            />
            <datalist id={categoryList}>
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
          <Field label="Points Reward">
            <input
              type="number"
              min="0"
              max="1000000"
              step="any"
              value={form.points}
              onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
              className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] rounded-2xl px-3.5 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 font-mono-num font-bold transition"
            />
          </Field>
        </div>

        {/* XP Reward */}
        <Field label="XP reward">
          <input
            type="number"
            min="0"
            max="100"
            required
            value={form.xpValue}
            onChange={(event) => setForm((prior) => ({ ...prior, xpValue: event.target.value }))}
            className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] text-[var(--text-main)] px-3.5 py-3 text-sm font-mono-num font-bold outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition"
          />
        </Field>

        {/* Schedule Frequency */}
        <Field label="Schedule Frequency">
          <div className="flex gap-2 mb-2.5">
            {['daily', 'weekly'].map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setForm((f) => ({ ...f, frequencyType: t }))}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition cursor-pointer ${
                  form.frequencyType === t
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs'
                    : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)]'
                }`}
              >
                {t === 'daily' ? 'Every day' : 'Custom days'}
              </button>
            ))}
          </div>
          {form.frequencyType === 'weekly' && (
            <div className="flex gap-1.5 justify-between pt-1">
              {WEEKDAYS.map((label, i) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => toggleDay(i)}
                  className={`w-10 h-10 rounded-xl text-xs font-bold transition cursor-pointer ${
                    form.days.includes(i)
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs scale-105'
                      : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-color)] hover:border-[var(--accent)]'
                  }`}
                >
                  {label[0]}
                </button>
              ))}
            </div>
          )}
        </Field>

        {/* Priority & Reminder Time */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] rounded-2xl px-3.5 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] transition cursor-pointer font-medium"
            >
              <option value="low" className="bg-[var(--bg-surface)] text-[var(--text-main)]">Low Priority</option>
              <option value="medium" className="bg-[var(--bg-surface)] text-[var(--text-main)]">Medium Priority</option>
              <option value="high" className="bg-[var(--bg-surface)] text-[var(--text-main)]">High Priority</option>
            </select>
          </Field>
          <Field label="Reminder Time">
            <input
              type="time"
              value={form.reminderTime}
              onChange={(e) => setForm((f) => ({ ...f, reminderTime: e.target.value }))}
              className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] rounded-2xl px-3.5 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] font-mono-num font-medium transition"
            />
          </Field>
        </div>

        {error && (
          <p className="text-sm font-semibold text-rose-500 bg-rose-500/10 p-3.5 rounded-2xl border border-rose-500/20">
            {error}
          </p>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={saving}
          className="button-press w-full bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold py-3.5 rounded-2xl hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-[var(--accent)]/25 cursor-pointer disabled:opacity-60 text-sm"
        >
          {saving ? 'Saving…' : editingHabit ? 'Save changes' : 'Create habit'}
        </button>

        {/* Archive / Restore Button */}
        {editingHabit && (
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              setError('')
              try {
                await editHabit(editingHabit.id, { isArchived: !editingHabit.isArchived })
                onClose()
              } catch (error) {
                setError(error.message)
              } finally {
                setSaving(false)
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition cursor-pointer border border-rose-500/20"
          >
            <Archive size={15} /> {editingHabit.isArchived ? 'Restore this habit' : 'Archive this habit'}
          </button>
        )}
      </form>
    </Modal>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">{label}</span>
      {children}
    </label>
  )
}

function IconButton({ icon, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition cursor-pointer ${
        selected
          ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs scale-105'
          : 'hover:bg-[var(--bg-surface-hover)] text-[var(--text-main)]'
      }`}
    >
      {icon}
    </button>
  )
}
