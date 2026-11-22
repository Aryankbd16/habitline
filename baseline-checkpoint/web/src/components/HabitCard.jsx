import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { BarChart3, Check, Flame, Link2 } from 'lucide-react'
import { useHabits } from '../context/HabitsContext'
import { frequencyLabel } from '../lib/schedule'
import { currentStreak } from '../lib/calculations'
import { todayStr } from '../lib/dateUtils'

export default function HabitCard({ habit, isCompleted, date = todayStr(), completionDatesSet, onEdit, relatedHabits = [], onRelationships, canComplete = true }) {
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
      className={`group flex items-center gap-3.5 p-4 rounded-2xl border transition-all duration-200 animate-rise ${
        isCompleted
          ? 'bg-[var(--accent)]/10 border-[var(--accent)]/35 shadow-xs'
          : 'bg-[var(--bg-surface)] border-[var(--border-color)] hover:border-[var(--border-color-hover)] hover:bg-[var(--bg-surface-hover)] shadow-xs'
      }`}
    >
      <div className="w-12 h-12 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] flex items-center justify-center text-2xl shrink-0 shadow-xs group-hover:scale-105 transition-transform duration-200">
        {habit.icon}
      </div>

      <button
        type="button"
        onClick={() => onEdit?.(habit)}
        className="min-w-0 flex-1 text-left cursor-pointer"
        aria-label={`Edit ${habit.name}`}
      >
        <div className="flex items-center gap-2">
          <p className="font-bold text-sm text-[var(--text-main)] truncate group-hover:text-[var(--accent)] transition-colors">
            {habit.name}
          </p>
          {habit.category && (
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-surface-elevated)] text-[var(--text-subtle)] border border-[var(--border-color)]">
              {habit.category}
            </span>
          )}
        </div>
        
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
        {habit.description && (
          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
            {habit.description}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1">
          <span className="px-2 py-0.5 rounded-md bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] text-[11px] font-mono-num font-semibold border border-[var(--border-color)]">
            +{habit.points} pts
          </span>
          {!canComplete && <span className="text-xs text-[var(--text-muted)]">{habit.isArchived ? 'Archived' : frequencyLabel(habit.frequency)}</span>}
          {streak > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/12 text-amber-500 border border-amber-500/20 text-[11px] font-mono-num font-extrabold">
              <Flame size={12} className="fill-amber-500 animate-pulse" />
              <span>{streak}d streak</span>
            </span>
          )}
          {relatedHabits.length > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] truncate"><Link2 size={12} className="text-[var(--accent)]" />{relatedHabits.map((related) => related.name).join(', ')}</span>}
        </div>
      </button>

      <Link to={'/analytics?habit=' + encodeURIComponent(habit.id)} aria-label={'View performance for ' + habit.name} className="shrink-0 rounded-lg p-1.5 text-[var(--accent)]"><BarChart3 size={16} /></Link>
      <button onClick={() => onRelationships?.(habit)} aria-label={`Manage relationships for ${habit.name}`} className="shrink-0 w-9 h-9 rounded-xl border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer transition"><Link2 size={16} /></button>

      {canComplete && <button
        disabled={saving}
        onClick={changeCompletion}
        aria-pressed={isCompleted}
        aria-label={isCompleted ? `Mark ${habit.name} as not done` : `Mark ${habit.name} as done`}
        className={`shrink-0 w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer ${
          isCompleted
            ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-fg)] shadow-md shadow-[var(--accent)]/25 animate-pop'
            : 'border-[var(--border-color-hover)] text-transparent hover:border-[var(--accent)] hover:bg-[var(--accent)]/10'
        }`}
      >
        <Check size={20} strokeWidth={3} />
      </button>}
    </div>
  )
}
