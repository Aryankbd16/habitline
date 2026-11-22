import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from 'recharts'
import { useHabits } from '../context/HabitsContext'
import { useAuth } from '../context/AuthContext'
import { useToday } from '../lib/useToday'
import { calendarPeriod, comparisonDates, createProgress } from '../lib/progress'
import { buildInsights } from '../lib/insights'
import { dashboardConfig, sectionRank } from '../lib/personalization'
import ContributionGrid from '../components/ContributionGrid'

const panel = 'rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5'
const control = 'rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-3 py-2'
const rate = (value) => value === null ? '—' : Math.round(value) + '%'
const delta = (current, previous) => {
  if (current === null || previous === null) return 'Insufficient comparison data'
  const change = Math.round(current - previous)
  return (change > 0 ? '+' : '') + change + ' percentage points'
}
const tooltip = { background: 'var(--bg-surface)', color: 'var(--text-main)', borderColor: 'var(--border-color)' }

export default function Analytics() {
  const { habits, completions } = useHabits()
  const { user } = useAuth()
  const today = useToday()
  const [query, setQuery] = useSearchParams()
  const habitId = habits.some(({ id }) => id === query.get('habit')) ? query.get('habit') : ''
  const [unit, setUnit] = useState('week')
  const [offset, setOffset] = useState(0)
  const progress = useMemo(() => createProgress(habits, completions, today), [habits, completions, today])
  const focus = dashboardConfig(user?.onboarding).focusAreas
  const ordered = [...habits].sort((a, b) => sectionRank(a, focus) - sectionRank(b, focus))
  const selected = habits.find(({ id }) => id === habitId)
  const dates = calendarPeriod(today, unit === 'lifetime' ? 'month' : unit, offset)
  const period = unit === 'lifetime' ? progress.lifetime(habitId) : progress.period(dates, habitId)
  const overall = progress.lifetime(habitId)
  const [comparisonCurrent, comparisonPrevious] = comparisonDates(today, unit === 'lifetime' ? 'month' : unit, offset)
  const comparisons = Object.fromEntries(['week', 'month'].map((key) => {
    const [current, previous] = comparisonDates(today, key)
    return [key, { current: progress.period(calendarPeriod(today, key), habitId), change: delta(progress.period(current, habitId).rate, progress.period(previous, habitId).rate) }]
  }))
  const streaks = selected ? [progress.streaks.get(habitId)] : [...progress.streaks.values()]
  const best = [...period.daily].filter((day) => day.rate !== null).sort((a, b) => b.rate - a.rate)
  const consistency = ordered.map((habit) => ({
    id: habit.id, name: habit.name, archived: habit.isArchived,
    ...(unit === 'lifetime' ? progress.lifetime(habit.id) : progress.period(dates, habit.id)),
  })).filter((item) => item.rate !== null)
  const highest = consistency.length ? consistency.reduce((a, b) => a.rate >= b.rate ? a : b) : null
  const lowest = consistency.length ? consistency.reduce((a, b) => a.rate <= b.rate ? a : b) : null
  const insights = buildInsights(progress, ordered, today).filter((item) => !habitId || item.habitId === habitId)
  const chartData = (unit === 'lifetime' ? period.daily.slice(-90) : period.daily)
  const chartLabel = unit === 'lifetime' ? 'Last 90 days of tracking' : dates[0] + ' to ' + dates.at(-1)

  if (!habits.length) return <section><h1 className="text-3xl font-extrabold">Analytics & Performance</h1><p className="mt-4">Create a habit to see your progress here.</p></section>

  return <div className="space-y-6">
    <header>
      <h1 className="text-3xl font-extrabold">Analytics & Performance</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Consistency is completed occurrences divided by scheduled opportunities. Future dates are excluded and unfinished habits are counted as missed after the day ends.</p>
    </header>
    <div className="flex flex-wrap gap-3 items-end">
      <label className="grid gap-1 text-sm">Habit
        <select className={control} value={habitId} onChange={(event) => setQuery(event.target.value ? { habit: event.target.value } : {})}>
          <option value="">All habits</option>
          {ordered.map((habit) => <option key={habit.id} value={habit.id}>{habit.name}{habit.isArchived ? ' (archived)' : ''}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Time range
        <select className={control} value={unit} onChange={(event) => { setUnit(event.target.value); setOffset(0) }}>
          <option value="week">Week</option><option value="month">Month</option><option value="lifetime">Lifetime</option>
        </select>
      </label>
      {unit !== 'lifetime' && <>
        <button type="button" className={control} onClick={() => setOffset(offset - 1)}>Previous {unit}</button>
        <button type="button" className={control + ' disabled:opacity-50'} disabled={offset === 0} onClick={() => setOffset(offset + 1)}>Next {unit}</button>
      </>}
    </div>
    <section className={panel} aria-label="Progress summary">
      <h2 className="font-extrabold">{chartLabel}</h2>
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        {[
          ['Completion rate', rate(period.rate)], ['Scheduled', period.scheduled], ['Completed', period.completed], ['Missed', period.missed],
          ['Points earned', +period.points.toFixed(2)], ['Lifetime points', +overall.points.toFixed(2)], ['Lifetime completions', overall.completed],
          ['Overall completion rate', rate(overall.rate)],
          ['Current streak', Math.max(0, ...streaks.map((entry) => entry.current))], ['Longest streak', Math.max(0, ...streaks.map((entry) => entry.longest))],
          ['Weekly rate', rate(comparisons.week.current.rate)], ['Monthly rate', rate(comparisons.month.current.rate)],
        ].map(([label, value]) => <div key={label}><dt className="text-[var(--text-muted)]">{label}</dt><dd className="text-xl font-bold">{value}</dd></div>)}
      </dl>
      <div className="mt-4 space-y-1 text-sm">
        <p>Week over week · {comparisons.week.change}</p>
        <p>Month over month · {comparisons.month.change}</p>
        {unit !== 'lifetime' && <p>Selected period comparison · {delta(progress.period(comparisonCurrent, habitId).rate, progress.period(comparisonPrevious, habitId).rate)} over equivalent elapsed days</p>}
        {!selected && <p>Best day · {best[0] ? best[0].date + ' (' + rate(best[0].rate) + ')' : '—'} · Lowest day · {best.at(-1) ? best.at(-1).date + ' (' + rate(best.at(-1).rate) + ')' : '—'}</p>}
      </div>
    </section>
    <section className={panel}>
      <h2 className="font-extrabold">Daily Completion & Focus</h2>
      <div className="h-60 mt-3">
        <ResponsiveContainer><LineChart data={chartData}>
          <CartesianGrid stroke="var(--border-color)" /><XAxis dataKey="date" minTickGap={30} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(date) => date.slice(5)} />
          <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} /><Tooltip contentStyle={tooltip} formatter={(value) => rate(value)} /><Legend />
          <Line name="Completion rate" dataKey="rate" stroke="var(--accent)" strokeWidth={2} dot={false} />
          <Line name="Focus score" dataKey="focus" stroke="var(--text-muted)" strokeWidth={2} dot={false} />
        </LineChart></ResponsiveContainer>
      </div>
      {unit !== 'lifetime' && <details className="text-sm"><summary className="cursor-pointer font-semibold">Daily breakdown</summary>
        <ul className="mt-2 space-y-1">{period.daily.map((day) => <li key={day.date}>{day.date} · {day.completed} of {day.scheduled} · {rate(day.rate)} · {+day.points.toFixed(2)} points</li>)}</ul>
      </details>}
      <h3 className="mt-5 font-bold">Points earned over time</h3>
      <div className="h-40"><ResponsiveContainer><BarChart data={chartData}><XAxis dataKey="date" hide /><YAxis tick={{ fill: 'var(--text-muted)' }} /><Tooltip contentStyle={tooltip} /><Bar dataKey="points" fill="var(--accent)" /></BarChart></ResponsiveContainer></div>
    </section>
    <section className={panel}>
      <h2 className="font-extrabold">Completion heatmap</h2>
      <p className="mb-3 text-sm text-[var(--text-muted)]">Most recent 17 weeks · <Link className="underline" to="/calendar">Open calendar</Link></p>
      <ContributionGrid intensityFor={(date) => {
        const value = progress.period([date], habitId).rate
        return !value ? 0 : value < 50 ? 1 : value < 100 ? 2 : 3
      }} />
    </section>
    <section className={panel}>
      <h2 className="font-extrabold">Habit consistency</h2>
      {highest && <p className="my-2 text-sm">Most consistent · {highest.name} ({rate(highest.rate)}){lowest.id !== highest.id && ' · Least consistent · ' + lowest.name + ' (' + rate(lowest.rate) + ')'}</p>}
      {consistency.length ? <ul className="grid gap-3 mt-3">{consistency.map((item) => <li key={item.id}>
        <Link className="underline" to={'/analytics?habit=' + encodeURIComponent(item.id)}>{item.name}{item.archived ? ' (archived)' : ''}</Link>
        <p className="text-sm">{item.completed} of {item.scheduled} · {rate(item.rate)} · {+item.points.toFixed(2)} points</p>
        <progress className="w-full accent-[var(--accent)]" value={item.rate} max="100" aria-label={item.name + ' consistency'} />
      </li>)}</ul> : <p className="text-sm mt-2">No scheduled occurrences in this period.</p>}
    </section>
    <section className={panel}>
      <h2 className="font-extrabold">Progress insights</h2>
      {!insights.length && <p className="mt-2 text-sm">Insights appear when both comparison periods have at least three scheduled opportunities and the records support an observation.</p>}
      <ul className="grid gap-3 mt-3">{insights.map((item) => <li key={item.id} className="rounded-xl bg-[var(--bg-surface-elevated)] p-3">
        <h3 className="font-bold">{item.title} · {item.periodName}</h3><p className="text-sm">{item.text}</p><p className="text-xs text-[var(--text-muted)]">{item.period}</p>
      </li>)}</ul>
    </section>
  </div>
}
