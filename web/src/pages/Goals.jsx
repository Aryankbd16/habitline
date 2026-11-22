import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHabits } from '../context/HabitsContext'
import { useToday } from '../lib/useToday'
import { getGoals, saveGoal, deleteGoal } from '../lib/goalService'
import Modal from '../components/Modal'
import { Plus, Calendar, CheckCircle2, Target } from 'lucide-react'

const field = 'w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition font-medium'
const button = 'rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-bold text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-color-hover)] transition cursor-pointer disabled:opacity-50'
const panel = 'rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 sm:p-7 shadow-xs card-hover space-y-4'

export default function Goals() {
  const { habits } = useHabits()
  const today = useToday()
  const [goals, setGoals] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loadingError, setLoadingError] = useState('')
  const [writeError, setWriteError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoadingError('')
    return getGoals().then(setGoals).catch((error) => setLoadingError(error.message))
  }

  useEffect(() => {
    let active = true
    getGoals()
      .then((data) => {
        if (active) {
          setGoals(data)
          setLoadingError('')
        }
      })
      .catch((error) => {
        if (active) setLoadingError(error.message)
      })
    return () => {
      active = false
    }
  }, [today])

  async function write(action) {
    setWriteError('')
    setBusy(true)
    try {
      await action()
      setDraft(null)
      await load()
    } catch (error) {
      setWriteError(error.message)
    } finally {
      setBusy(false)
    }
  }

  function open(goal) {
    setWriteError('')
    setDraft(goal || { title: '', description: '', startDate: today, targetDate: '', target: '', habitIds: [] })
  }

  function submit(event) {
    event.preventDefault()
    const { title, description, startDate, targetDate, target, habitIds } = draft
    write(() => saveGoal({ title, description, startDate, targetDate: targetDate || null, target: Number(target), habitIds }, draft.id))
  }

  const change = (key, value) => setDraft((prior) => ({ ...prior, [key]: value }))

  return (
    <div className="space-y-8 animate-rise">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-main)]">Goals</h1>
          <p className="mt-1.5 text-xs sm:text-sm text-[var(--text-muted)] font-medium max-w-xl leading-relaxed">
            Each linked habit completion counts once toward a goal between its start and target dates. Habits can
            contribute to multiple goals independently.
          </p>
        </div>
        <button
          type="button"
          className="button-press flex items-center gap-2 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold text-sm px-5 py-3 shadow-lg shadow-[var(--accent)]/20 hover:brightness-110 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          disabled={busy || !goals}
          onClick={() => open()}
        >
          <Plus size={18} strokeWidth={2.8} /> New goal
        </button>
      </header>

      {loadingError && (
        <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center justify-between gap-3">
          <span>{loadingError}</span>
          <button className="underline font-bold" onClick={load}>Retry</button>
        </div>
      )}

      {!goals && !loadingError && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <p role="status" className="text-sm font-medium text-[var(--text-muted)]">Loading goals…</p>
        </div>
      )}

      {goals?.length === 0 && (
        <div className="p-12 text-center rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] mx-auto mb-4">
            <Target size={26} strokeWidth={2.2} />
          </div>
          <h2 className="text-lg font-bold text-[var(--text-main)] mb-1">No goals set yet</h2>
          <p className="text-sm font-medium text-[var(--text-muted)] max-w-md mx-auto mb-6">
            Create a goal to track what your habits are building toward.
          </p>
          <button
            type="button"
            className="button-press inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold text-xs px-5 py-3 shadow-md shadow-[var(--accent)]/25"
            onClick={() => open()}
          >
            <Plus size={16} strokeWidth={2.6} /> Set First Goal
          </button>
        </div>
      )}

      {writeError && !draft && (
        <p role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-medium">
          {writeError}
        </p>
      )}

      {goals?.map((goal) => (
        <article key={goal.id} className={panel}>
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-extrabold text-[var(--text-main)] tracking-tight">
                  {goal.title}
                </h2>
                {goal.archivedOn && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    Archived
                  </span>
                )}
                {goal.reachedOn && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Reached
                  </span>
                )}
              </div>
              {goal.description && (
                <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium whitespace-pre-wrap mt-1 leading-relaxed">
                  {goal.description}
                </p>
              )}
            </div>
            <span className="font-mono-num font-extrabold text-lg sm:text-xl text-[var(--accent)]">
              {goal.percent}%
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="font-mono-num text-[var(--text-main)]">
                {goal.completed} / {goal.target} completions
              </span>
              <span className="text-[var(--text-subtle)] font-mono-num">{goal.percent}%</span>
            </div>
            <progress
              value={goal.percent}
              max="100"
              aria-label={goal.title + ' progress'}
              className="w-full accent-[var(--accent)]"
            />
          </div>

          <div className="text-xs font-medium text-[var(--text-subtle)] flex items-center gap-2 flex-wrap">
            <Calendar size={13} className="text-[var(--accent)] shrink-0" />
            <span>
              From {goal.startDate}
              {goal.targetDate && ' · Target ' + goal.targetDate}
              {goal.reachedOn && ' · Reached ' + goal.reachedOn}
            </span>
          </div>

          <div className="pt-2 border-t border-[var(--border-color)]">
            <span className="text-[11px] font-bold text-[var(--text-subtle)] uppercase tracking-wider block mb-2">
              Contributing Habits
            </span>
            <ul className="flex flex-wrap gap-2 text-xs">
              {goal.habitIds.map((id) => {
                const habit = habits.find((item) => item.id === id)
                return (
                  habit && (
                    <li key={id}>
                      <Link
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                        to={'/analytics?habit=' + encodeURIComponent(id)}
                      >
                        <span>{habit.icon || '⭐'}</span>
                        <span>{habit.name}{habit.isArchived && ' (archived)'}</span>
                      </Link>
                    </li>
                  )
                )
              })}
            </ul>
            {!goal.habitIds.length && (
              <p className="text-xs text-[var(--text-muted)] font-medium">No linked habits.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button className={button} disabled={busy} onClick={() => open(goal)}>
              Edit goal
            </button>
            <button
              className={button}
              disabled={busy}
              onClick={() => write(() => saveGoal({ archived: !goal.archivedOn }, goal.id))}
            >
              {goal.archivedOn ? 'Restore goal' : 'Archive goal'}
            </button>
            <button
              className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                if (confirm('Delete this goal? Earned milestones will remain.')) write(() => deleteGoal(goal.id))
              }}
            >
              Delete goal
            </button>
          </div>
        </article>
      ))}

      {draft && (
        <Modal
          open
          onClose={() => {
            if (!busy) setDraft(null)
          }}
          title={draft.id ? 'Edit goal' : 'Create goal'}
        >
          <form className="space-y-4" onSubmit={submit}>
            <label className="block">
              <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
                Goal title
              </span>
              <input
                className={field}
                required
                maxLength={120}
                value={draft.title}
                onChange={(event) => change('title', event.target.value)}
                placeholder="e.g., Read 30 books this year"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
                Description
              </span>
              <textarea
                className={`${field} resize-none`}
                rows={2}
                maxLength={2000}
                value={draft.description}
                onChange={(event) => change('description', event.target.value)}
                placeholder="What milestone does this represent?"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
                Target completions
              </span>
              <input
                className={`${field} font-mono-num font-bold`}
                required
                type="number"
                min={1}
                max={1000000}
                value={draft.target}
                onChange={(event) => change('target', event.target.value)}
                placeholder="e.g., 50"
              />
            </label>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
                  Start date
                </span>
                <input
                  required
                  className={field}
                  type="date"
                  value={draft.startDate}
                  onChange={(event) => change('startDate', event.target.value)}
                />
              </label>

              <label className="block">
                <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
                  Target date (optional)
                </span>
                <input
                  className={field}
                  type="date"
                  min={draft.startDate}
                  value={draft.targetDate || ''}
                  onChange={(event) => change('targetDate', event.target.value)}
                />
              </label>
            </div>

            <fieldset className="p-4 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]">
              <legend className="font-bold text-xs text-[var(--text-subtle)] uppercase tracking-wider px-1">
                Linked habits
              </legend>
              {!habits.length && (
                <p className="text-xs text-[var(--text-muted)] font-medium mt-1">
                  Create a habit before linking it to a goal.
                </p>
              )}
              <div className="max-h-44 overflow-y-auto space-y-2 mt-2">
                {habits.map((habit) => (
                  <label
                    key={habit.id}
                    className="flex gap-2.5 items-center text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] p-2 rounded-xl transition cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={draft.habitIds.includes(habit.id)}
                      onChange={(event) =>
                        change(
                          'habitIds',
                          event.target.checked
                            ? [...draft.habitIds, habit.id]
                            : draft.habitIds.filter((id) => id !== habit.id)
                        )
                      }
                    />
                    <span className="text-base">{habit.icon || '⭐'}</span>
                    <span className="truncate">
                      {habit.name}
                      {habit.isArchived ? ' (archived)' : ''}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {writeError && (
              <p role="alert" className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
                {writeError}
              </p>
            )}

            <button
              className="button-press w-full rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] py-3.5 text-xs font-extrabold hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-[var(--accent)]/20 cursor-pointer disabled:opacity-50"
              disabled={busy}
              type="submit"
            >
              {busy ? 'Saving…' : 'Save goal'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
