import { useMemo, useState } from 'react'
import { useHabits } from '../context/HabitsContext'
import { summarizeDay } from '../lib/calculations'
import { useToday } from '../lib/useToday'
import MonthCalendar from '../components/MonthCalendar'
import ContributionGrid from '../components/ContributionGrid'
import EmptyState from '../components/EmptyState'
import { CalendarDays, Check, X } from 'lucide-react'

export default function CalendarPage() {
  const { habits, completions } = useHabits()
  const today = useToday()
  const [chosenDate, setSelectedDate] = useState(null)
  const selectedDate = chosenDate || today
  const [selectedHabitId, setSelectedHabitId] = useState('all')

  const completionsByDate = useMemo(() => {
    const map = new Map()
    for (const c of completions) {
      if (!map.has(c.date)) map.set(c.date, [])
      map.get(c.date).push(c)
    }
    return map
  }, [completions])

  const summary = (date) => summarizeDay(habits, completionsByDate.get(date) || [], date)
  const dayStatus = (date) => {
    const { scheduled, completed } = summary(date)
    if (!scheduled.length) return 'none'
    if (completed === scheduled.length) return 'completed'
    if (completed) return 'partial'
    return date === today ? 'none' : 'missed'
  }
  const overallIntensity = (date) => {
    const { completion } = summary(date)
    return completion === 0 ? 0 : completion < 50 ? 1 : completion < 100 ? 2 : 3
  }
  const habitIntensity = (habitId) => (date) => summary(date).doneIds.has(habitId) ? 3 : 0
  const { scheduled: selectedDayHabits, done: selectedDayCompletions, doneIds: selectedDayDone, completed, completion, earned } = summary(selectedDate)

  return (
    <div className="space-y-8 animate-rise">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-main)]">Calendar & Activity</h1>
      </div>

      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 shadow-xs">
        <MonthCalendar dayStatus={dayStatus} onSelectDate={setSelectedDate} selectedDate={selectedDate} />
      </div>

      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b border-[var(--border-color)] pb-3">
          <h3 className="font-extrabold text-base text-[var(--text-main)]">
            {selectedDate === today ? 'Today' : new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          <span className="text-xs font-mono-num font-semibold text-[var(--text-subtle)]">
            {completed} of {selectedDayHabits.length} done · {completion}% · {earned} pts
          </span>
        </div>

        {selectedDayHabits.length === 0 ? (
          <p className="text-sm font-semibold text-[var(--text-muted)] py-4">No habits scheduled for this day.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-color)]">
            {selectedDayHabits.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-3">
                <span className="text-xl w-9 h-9 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
                  {h.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-[var(--text-main)] block truncate">{h.name}</span>
                  <span className="text-[11px] font-mono-num text-[var(--text-muted)]">+{selectedDayCompletions.find((item) => item.habitId === h.id)?.pointsEarned ?? h.points} pts</span>
                </div>
                {selectedDayDone.has(h.id) ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/15 px-3 py-1 rounded-full border border-[var(--accent)]/30">
                    <Check size={14} strokeWidth={3} /> Done
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-1 rounded-full border border-[var(--border-color)]">
                    <X size={14} /> {selectedDate < today ? 'Missed' : 'Scheduled'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 shadow-xs">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div>
            <h3 className="font-extrabold text-base text-[var(--text-main)]">Activity History</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Consistency matrix over the past 17 weeks</p>
          </div>
          <select
            value={selectedHabitId}
            onChange={(e) => setSelectedHabitId(e.target.value)}
            className="bg-[var(--bg-surface-elevated)] text-[var(--text-main)] rounded-xl px-3.5 py-2 text-xs font-semibold outline-none border border-[var(--border-color)] focus:border-[var(--accent)] transition cursor-pointer"
          >
            <option value="all" className="bg-[var(--bg-surface)]">All habits overview</option>
            {habits.map((h) => (
              <option key={h.id} value={h.id} className="bg-[var(--bg-surface)]">{h.name}</option>
            ))}
          </select>
        </div>
        {habits.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No history yet" subtitle="Complete a habit to see your activity here." />
        ) : (
          <ContributionGrid intensityFor={selectedHabitId === 'all' ? overallIntensity : habitIntensity(selectedHabitId)} />
        )}
      </div>
    </div>
  )
}
