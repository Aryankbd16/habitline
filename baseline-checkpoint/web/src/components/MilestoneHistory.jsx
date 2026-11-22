import { useEffect, useState } from 'react'
import { getMilestones } from '../lib/goalService'

export default function MilestoneHistory() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    getMilestones().then((data) => { if (active) setItems(data) })
      .catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [attempt])
  return <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6">
    <h2 className="font-extrabold text-lg">Milestone history</h2>
    {error ? <p role="alert">{error} <button className="underline" onClick={() => { setError(''); setAttempt(attempt + 1) }}>Retry</button></p>
      : !items ? <p role="status">Loading milestones…</p>
      : !items.length ? <p className="mt-2 text-sm">Milestones appear when you reach a goal, log seven or thirty completions, or complete seven consecutive scheduled occurrences.</p>
      : <ol className="divide-y divide-[var(--border-color)]">{items.map((item) => <li key={item.kind + ':' + item.subjectId} className="py-3">
        <span className="font-bold">{item.title}</span> <time className="text-xs text-[var(--text-muted)]" dateTime={item.earnedOn}>{item.earnedOn}</time>
        <p className="text-sm">{item.description}</p>
      </li>)}</ol>}
  </section>
}
