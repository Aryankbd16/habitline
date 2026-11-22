import { useEffect, useState } from 'react'
import { getMilestones } from '../lib/goalService'
import { Award, Calendar } from 'lucide-react'

export default function MilestoneHistory() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    getMilestones()
      .then((data) => {
        if (active) setItems(data)
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [attempt])

  return (
    <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 sm:p-7 shadow-xs">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] shrink-0">
          <Award size={18} strokeWidth={2.4} />
        </div>
        <div>
          <h2 className="font-extrabold text-lg sm:text-xl text-[var(--text-main)] tracking-tight">Milestone history</h2>
          <p className="text-xs text-[var(--text-muted)] font-medium">Achievements and targets unlocked across your journey</p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-rose-500 bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20">
          {error}{' '}
          <button
            className="underline font-bold ml-2 cursor-pointer"
            onClick={() => {
              setError('')
              setAttempt(attempt + 1)
            }}
          >
            Retry
          </button>
        </p>
      ) : !items ? (
        <p role="status" className="text-sm font-medium text-[var(--text-muted)] py-4">Loading milestones…</p>
      ) : !items.length ? (
        <p className="mt-2 text-xs sm:text-sm text-[var(--text-muted)] font-medium leading-relaxed">
          Milestones appear when you reach a goal, log seven or thirty completions, or complete seven consecutive
          scheduled occurrences.
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border-color)]">
          {items.map((item) => (
            <li key={item.kind + ':' + item.earnedOn} className="py-4 flex gap-3.5 items-start">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/12 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5">
                <Award size={16} strokeWidth={2.4} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-sm text-[var(--text-main)]">{item.title}</span>
                  <time className="text-[11px] font-mono-num font-bold text-[var(--text-subtle)] flex items-center gap-1" dateTime={item.earnedOn}>
                    <Calendar size={11} className="text-[var(--accent)]" /> {item.earnedOn}
                  </time>
                </div>
                <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium mt-0.5 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
