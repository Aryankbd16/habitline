import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { BarChart3, Check, Flame, Link2 } from 'lucide-react'
import { useHabits } from '../context/HabitsContext'
import { frequencyLabel } from '../lib/schedule'
import { currentStreak } from '../lib/calculations'
import { todayStr } from '../lib/dateUtils'

export default function HabitCard({
  habit,
  isCompleted,
  date = todayStr(),
  completionDatesSet,
  onEdit,
  relatedHabits = [],
  onRelationships,
  canComplete = true,
}) {
  const { setCompletion } = useHabits()
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const changeCompletion = async () => {
    if (pending.current) return
    pending.current = true
    setSaving(true)
    setError('')
    try {
      await setCompletion(habit.id, date, !isCompleted)
    } catch (error) {
      setError(error.message)
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  const streak = completionDatesSet ? currentStreak(habit, completionDatesSet, date) : 0

  return (
    <div
      className={`group relative flex items-center gap-3.5 sm:gap-4 p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 animate-rise ${
        isCompleted
          ? 'bg-[var(--accent)]/[0.08] border-[var(--accent)]/35 shadow-sm'
          : 'bg-[var(--bg-surface)] border-[var(--border-color)] hover:border-[var(--border-color-hover)] hover:bg-[var(--bg-surface-hover)] shadow-xs card-hover'
      }`}
      style={{
        boxShadow: isCompleted
          ? '0 4px 18px -2px var(--accent-glow)'
          : undefined,
      }}
    >
      {/* Icon container */}
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-transform duration-200 group-hover:scale-105 select-none ${
          isCompleted
            ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30'
            : 'bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]'
        }`}
      >
        {habit.icon}
      </div>

      {/* Habit Details (Click to edit) */}
      <button
        type="button"
        onClick={() => onEdit?.(habit)}
        className="min-w-0 flex-1 text-left cursor-pointer outline-none"
        aria-label={`Edit ${habit.name}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={`font-bold text-sm sm:text-base tracking-tight truncate transition-colors ${
              isCompleted
                ? 'text-[var(--text-main)] line-through decoration-[var(--accent)]/50 opacity-90'
                : 'text-[var(--text-main)] group-hover:text-[var(--accent)]'
            }`}
          >
            {habit.name}
          </p>
          {habit.category && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-surface-elevated)] text-[var(--text-subtle)] border border-[var(--border-color)]">
              {habit.category}
            </span>
          )}
        </div>

        {error && <p role="alert" className="text-xs text-rose-500 mt-1 font-semibold">{error}</p>}

        {habit.description && (
          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 font-medium">
            {habit.description}
          </p>
        )}

        {/* Badges / Chips */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="px-2 py-0.5 rounded-md bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] text-[11px] font-mono-num font-bold border border-[var(--border-color)]">
            +{habit.points} pts
          </span>

          {!canComplete && (
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              {habit.isArchived ? 'Archived' : frequencyLabel(habit.frequency)}
            </span>
          )}

          {streak > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/12 text-amber-500 border border-amber-500/25 text-[11px] font-mono-num font-extrabold shadow-2xs">
              <Flame size={12} className="fill-amber-500 animate-pulse" />
              <span>{streak}d streak</span>
            </span>
          )}

          {relatedHabits.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] truncate bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded-md border border-[var(--border-color)]">
              <Link2 size={12} className="text-[var(--accent)] shrink-0" />
              <span className="truncate">{relatedHabits.map((related) => related.name).join(', ')}</span>
            </span>
          )}
        </div>
      </button>

      {/* Analytics Shortcut */}
      <Link
        to={'/analytics?habit=' + encodeURIComponent(habit.id)}
        aria-label={'View performance for ' + habit.name}
        className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition cursor-pointer"
      >
        <BarChart3 size={17} />
      </Link>

      {/* Relationships Button */}
      <button
        onClick={() => onRelationships?.(habit)}
        aria-label={`Manage relationships for ${habit.name}`}
        className="shrink-0 w-8 h-8 rounded-xl border border-[var(--border-color)] flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 cursor-pointer transition"
      >
        <Link2 size={16} />
      </button>

      {/* Completion Button */}
      {canComplete && (
        <button
          disabled={saving}
          onClick={changeCompletion}
          aria-pressed={isCompleted}
          aria-label={isCompleted ? `Mark ${habit.name} as not done` : `Mark ${habit.name} as done`}
          className={`shrink-0 w-11 h-11 rounded-2xl border-2 flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer ${
            isCompleted
              ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-fg)] shadow-md shadow-[var(--accent)]/30 animate-pop'
              : 'border-[var(--border-color-hover)] bg-[var(--bg-surface-elevated)] text-transparent hover:border-[var(--accent)] hover:bg-[var(--accent)]/15 hover:text-[var(--accent)]/30'
          }`}
        >
          <Check size={22} strokeWidth={3} />
        </button>
      )}
    </div>
  )
}
