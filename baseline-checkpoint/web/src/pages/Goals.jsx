import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHabits } from '../context/HabitsContext'
import { useToday } from '../lib/useToday'
import { getGoals, saveGoal, deleteGoal } from '../lib/goalService'
import Modal from '../components/Modal'

const field = 'w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-3 py-2'
const button = 'rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm font-semibold disabled:opacity-50'
const primary = button + ' bg-[var(--accent)] text-[var(--accent-fg)]'
const panel = 'rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5'

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
    getGoals().then((data) => { if (active) { setGoals(data); setLoadingError('') } })
      .catch((error) => { if (active) setLoadingError(error.message) })
    return () => { active = false }
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

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-extrabold">Goals</h1>
      <button type="button" className={primary} disabled={busy || !goals} onClick={() => open()}>New goal</button>
    </header>
    <p className="text-sm text-[var(--text-muted)]">Each linked habit completion counts once toward a goal between its start and target dates. Habits can contribute to multiple goals independently.</p>
    {loadingError && <p role="alert">{loadingError} <button className="underline" onClick={load}>Retry</button></p>}
    {!goals && !loadingError && <p role="status">Loading goals…</p>}
    {goals?.length === 0 && <p className={panel}>Create a goal to track what your habits are building toward.</p>}
    {writeError && !draft && <p role="alert">{writeError}</p>}
    {goals?.map((goal) => <article key={goal.id} className={panel}>
      <div className="flex flex-wrap justify-between gap-3">
        <div><h2 className="text-xl font-bold">{goal.title}</h2>
          {goal.description && <p className="text-sm whitespace-pre-wrap">{goal.description}</p>}
        </div>
        {goal.archivedOn && <span className="text-sm">Archived</span>}
      </div>
      <p className="mt-3 text-sm">{goal.completed} / {goal.target} completions · {goal.percent}%</p>
      <progress value={goal.percent} max="100" aria-label={goal.title + ' progress'} className="w-full accent-[var(--accent)]" />
      <p className="text-sm text-[var(--text-muted)]">From {goal.startDate}{goal.targetDate && ' · Target ' + goal.targetDate}{goal.reachedOn && ' · Reached ' + goal.reachedOn}</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 my-3 text-sm">{goal.habitIds.map((id) => {
        const habit = habits.find((item) => item.id === id)
        return habit && <li key={id}><Link className="underline" to={'/analytics?habit=' + encodeURIComponent(id)}>{habit.name}{habit.isArchived && ' (archived)'}</Link></li>
      })}</ul>
      {!goal.habitIds.length && <p className="text-sm mb-3">No linked habits.</p>}
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy} onClick={() => open(goal)}>Edit goal</button>
        <button className={button} disabled={busy} onClick={() => write(() => saveGoal({ archived: !goal.archivedOn }, goal.id))}>{goal.archivedOn ? 'Restore goal' : 'Archive goal'}</button>
        <button className={button} disabled={busy} onClick={() => { if (confirm('Delete this goal? Earned milestones will remain.')) write(() => deleteGoal(goal.id)) }}>Delete goal</button>
      </div>
    </article>)}
    {draft && <Modal open onClose={() => { if (!busy) setDraft(null) }} title={draft.id ? 'Edit goal' : 'Create goal'}>
      <form className="space-y-3" onSubmit={submit}>
        <label className="block">Goal title<input className={field} required maxLength={120} value={draft.title} onChange={(event) => change('title', event.target.value)} /></label>
        <label className="block">Description<textarea className={field} maxLength={2000} value={draft.description} onChange={(event) => change('description', event.target.value)} /></label>
        <label className="block">Target completions<input className={field} required type="number" min={1} max={1000000} value={draft.target} onChange={(event) => change('target', event.target.value)} /></label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label>Start date<input required className={field} type="date" value={draft.startDate} onChange={(event) => change('startDate', event.target.value)} /></label>
          <label>Target date (optional)<input className={field} type="date" min={draft.startDate} value={draft.targetDate || ''} onChange={(event) => change('targetDate', event.target.value)} /></label>
        </div>
        <fieldset>
          <legend className="font-semibold">Linked habits</legend>
          {!habits.length && <p className="text-sm">Create a habit before linking it to a goal.</p>}
          <div className="max-h-40 overflow-y-auto space-y-1">{habits.map((habit) => <label key={habit.id} className="flex gap-2 items-center">
            <input type="checkbox" checked={draft.habitIds.includes(habit.id)} onChange={(event) => change('habitIds', event.target.checked ? [...draft.habitIds, habit.id] : draft.habitIds.filter((id) => id !== habit.id))} />
            {habit.name}{habit.isArchived ? ' (archived)' : ''}
          </label>)}</div>
        </fieldset>
        {writeError && <p role="alert">{writeError}</p>}
        <button className={primary} disabled={busy} type="submit">{busy ? 'Saving…' : 'Save goal'}</button>
      </form>
    </Modal>}
  </div>
}
