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
import { Activity } from 'lucide-react'

const panel = 'rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 sm:p-7 shadow-xs'
const control = 'rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--text-main)] outline-none focus:border-[var(--accent)] transition cursor-pointer'
const rate = (value) => (value === null ? '—' : Math.round(value) + '%')
const delta = (current, previous) => {
  if (current === null || previous === null) return 'Insufficient comparison data'
  const change = Math.round(current - previous)
  return (change > 0 ? '+' : '') + change + ' percentage points'
}
const tooltipStyle = {
  backgroundColor: 'var(--bg-surface-elevated)',
  color: 'var(--text-main)',
  borderColor: 'var(--border-color)',
  borderRadius: '1rem',
  boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
  fontSize: '12px',
  fontWeight: '600',
  padding: '8px 12px',
}

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
  const comparisons = Object.fromEntries(
    ['week', 'month'].map((key) => {
      const [current, previous] = comparisonDates(today, key)
      return [
        key,
        {
          current: progress.period(calendarPeriod(today, key), habitId),
          change: delta(progress.period(current, habitId).rate, progress.period(previous, habitId).rate),
        },
      ]
    })
  )
  const streaks = selected ? [progress.streaks.get(habitId)] : [...progress.streaks.values()]
  const best = [...period.daily].filter((day) => day.rate !== null).sort((a, b) => b.rate - a.rate)
  const consistency = ordered
    .map((habit) => ({
      id: habit.id,
      name: habit.name,
      archived: habit.isArchived,
      ...(unit === 'lifetime' ? progress.lifetime(habit.id) : progress.period(dates, habit.id)),
    }))
    .filter((item) => item.rate !== null)
  const highest = consistency.length ? consistency.reduce((a, b) => (a.rate >= b.rate ? a : b)) : null
  const lowest = consistency.length ? consistency.reduce((a, b) => (a.rate <= b.rate ? a : b)) : null
  const insights = buildInsights(progress, ordered, today).filter((item) => !habitId || item.habitId === habitId)
  const chartData = unit === 'lifetime' ? period.daily.slice(-90) : period.daily
  const chartLabel = unit === 'lifetime' ? 'Last 90 days of tracking' : dates[0] + ' to ' + dates.at(-1)

  if (!habits.length) {
    return (
      <section className="py-12 text-center animate-rise">
        <h1 className="text-3xl font-extrabold text-[var(--text-main)]">Analytics & Performance</h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">Create a habit to see your progress here.</p>
      </section>
    )
  }

  return (
    <div className="space-y-8 animate-rise">
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-main)]">
          Analytics & Performance
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-[var(--text-muted)] font-medium max-w-2xl leading-relaxed">
          Consistency is completed occurrences divided by scheduled opportunities. Future dates are excluded and
          unfinished habits are counted as missed after the day ends.
        </p>
      </header>

      {/* Filter and Range Controls */}
      <div className="flex flex-wrap gap-3 items-end bg-[var(--bg-surface)] border border-[var(--border-color)] p-4 rounded-3xl shadow-xs">
        <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
          Habit
          <select
            className={control}
            value={habitId}
            onChange={(event) => setQuery(event.target.value ? { habit: event.target.value } : {})}
          >
            <option value="">All habits</option>
            {ordered.map((habit) => (
              <option key={habit.id} value={habit.id}>
                {habit.name}
                {habit.isArchived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
          Time range
          <select
            className={control}
            value={unit}
            onChange={(event) => {
              setUnit(event.target.value)
              setOffset(0)
            }}
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="lifetime">Lifetime</option>
          </select>
        </label>

        {unit !== 'lifetime' && (
          <div className="flex gap-2">
            <button
              type="button"
              className={`${control} hover:bg-[var(--bg-surface-hover)] active:scale-95`}
              onClick={() => setOffset(offset - 1)}
            >
              Previous {unit}
            </button>
            <button
              type="button"
              className={`${control} disabled:opacity-40 hover:bg-[var(--bg-surface-hover)] active:scale-95`}
              disabled={offset === 0}
              onClick={() => setOffset(offset + 1)}
            >
              Next {unit}
            </button>
          </div>
        )}
      </div>

      {/* Progress Summary Section */}
      <section className={panel} aria-label="Progress summary">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4 mb-5 flex-wrap">
          <h2 className="font-extrabold text-lg sm:text-xl text-[var(--text-main)] tracking-tight">{chartLabel}</h2>
          <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 font-mono-num">
            {rate(period.rate)} Completed
          </span>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm">
          {[
            ['Completion rate', rate(period.rate)],
            ['Scheduled', period.scheduled],
            ['Completed', period.completed],
            ['Missed', period.missed],
            ['Points earned', +period.points.toFixed(2)],
            ['Lifetime points', +overall.points.toFixed(2)],
            ['Lifetime completions', overall.completed],
            ['Overall completion rate', rate(overall.rate)],
            ['Current streak', Math.max(0, ...streaks.map((entry) => entry.current))],
            ['Longest streak', Math.max(0, ...streaks.map((entry) => entry.longest))],
            ['Weekly rate', rate(comparisons.week.current.rate)],
            ['Monthly rate', rate(comparisons.month.current.rate)],
          ].map(([label, value]) => (
            <div key={label} className="p-3.5 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] card-hover">
              <dt className="text-[11px] font-bold text-[var(--text-subtle)] uppercase tracking-wider truncate mb-1">
                {label}
              </dt>
              <dd className="text-xl sm:text-2xl font-extrabold text-[var(--text-main)] font-mono-num tracking-tight">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 pt-5 border-t border-[var(--border-color)] space-y-1.5 text-xs sm:text-sm font-medium text-[var(--text-muted)]">
          <p className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            <span>Week over week · {comparisons.week.change}</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            <span>Month over month · {comparisons.month.change}</span>
          </p>
          {unit !== 'lifetime' && (
            <p className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              <span>
                Selected period comparison ·{' '}
                {delta(progress.period(comparisonCurrent, habitId).rate, progress.period(comparisonPrevious, habitId).rate)}{' '}
                over equivalent elapsed days
              </span>
            </p>
          )}
          {!selected && (
            <p className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              <span>
                Best day · {best[0] ? best[0].date + ' (' + rate(best[0].rate) + ')' : '—'} · Lowest day ·{' '}
                {best.at(-1) ? best.at(-1).date + ' (' + rate(best.at(-1).rate) + ')' : '—'}
              </span>
            </p>
          )}
        </div>
      </section>

      {/* Chart: Daily Completion & Focus */}
      <section className={panel}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-lg sm:text-xl text-[var(--text-main)] tracking-tight">
            Daily Completion & Focus
          </h2>
          <span className="text-xs text-[var(--text-muted)] font-semibold flex items-center gap-1">
            <Activity size={14} className="text-[var(--accent)]" /> Metric Trends
          </span>
        </div>

        <div className="h-64 sm:h-72 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                minTickGap={25}
                tick={{ fill: 'var(--text-subtle)', fontSize: 11, fontWeight: 600 }}
                tickFormatter={(date) => date.slice(5)}
                axisLine={{ stroke: 'var(--border-color)' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: 'var(--text-subtle)', fontSize: 11, fontWeight: 600 }}
                axisLine={{ stroke: 'var(--border-color)' }}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => rate(value)} />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px', fontWeight: 'bold' }} />
              <Line
                name="Completion rate"
                dataKey="rate"
                stroke="var(--accent)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, fill: 'var(--accent)', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
              />
              <Line
                name="Focus score"
                dataKey="focus"
                stroke="var(--text-muted)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 5, fill: 'var(--text-muted)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {unit !== 'lifetime' && (
          <details className="mt-4 pt-3 border-t border-[var(--border-color)] text-xs sm:text-sm">
            <summary className="cursor-pointer font-bold text-[var(--accent)] hover:underline">
              Daily breakdown
            </summary>
            <ul className="mt-3 space-y-1.5 p-3 rounded-2xl bg-[var(--bg-surface-elevated)] max-h-48 overflow-y-auto">
              {period.daily.map((day) => (
                <li key={day.date} className="flex justify-between items-center text-xs py-1 border-b border-[var(--border-color)] last:border-0">
                  <span className="font-mono-num font-bold text-[var(--text-main)]">{day.date}</span>
                  <span className="text-[var(--text-muted)] font-medium">
                    {day.completed} of {day.scheduled} · <strong className="text-[var(--accent)]">{rate(day.rate)}</strong> · {+day.points.toFixed(2)} pts
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Bar Chart: Points Earned */}
        <div className="mt-8 pt-6 border-t border-[var(--border-color)]">
          <h3 className="font-bold text-sm sm:text-base text-[var(--text-main)] mb-3">Points earned over time</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-color)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} axisLine={{ stroke: 'var(--border-color)' }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="points" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Completion Heatmap */}
      <section className={panel}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-extrabold text-lg sm:text-xl text-[var(--text-main)] tracking-tight">
            Completion heatmap
          </h2>
          <Link className="text-xs font-bold text-[var(--accent)] hover:underline" to="/calendar">
            Open calendar
          </Link>
        </div>
        <p className="mb-4 text-xs font-medium text-[var(--text-muted)]">
          Most recent 17 weeks
        </p>
        <ContributionGrid
          intensityFor={(date) => {
            const value = progress.period([date], habitId).rate
            return !value ? 0 : value < 50 ? 1 : value < 100 ? 2 : 3
          }}
        />
      </section>

      {/* Habit Consistency */}
      <section className={panel}>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="font-extrabold text-lg sm:text-xl text-[var(--text-main)] tracking-tight">
            Habit consistency
          </h2>
          {highest && (
            <span className="text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/12 px-3 py-1 rounded-full border border-[var(--accent)]/30">
              Top: {highest.name} ({rate(highest.rate)})
            </span>
          )}
        </div>
        {highest && lowest && lowest.id !== highest.id && (
          <p className="text-xs text-[var(--text-muted)] font-medium mb-4">
            Most consistent · {highest.name} ({rate(highest.rate)}) · Least consistent · {lowest.name} ({rate(lowest.rate)})
          </p>
        )}

        {consistency.length ? (
          <ul className="grid gap-3.5 mt-4">
            {consistency.map((item) => (
              <li
                key={item.id}
                className="p-4 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] space-y-2 card-hover"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <Link
                    className="font-bold text-sm text-[var(--text-main)] hover:text-[var(--accent)] hover:underline"
                    to={'/analytics?habit=' + encodeURIComponent(item.id)}
                  >
                    {item.name}
                    {item.archived ? ' (archived)' : ''}
                  </Link>
                  <span className="text-xs font-mono-num font-bold text-[var(--text-muted)]">
                    {item.completed} of {item.scheduled} · <strong className="text-[var(--text-main)]">{rate(item.rate)}</strong> · {+item.points.toFixed(2)} pts
                  </span>
                </div>
                <progress
                  className="w-full accent-[var(--accent)]"
                  value={item.rate}
                  max="100"
                  aria-label={item.name + ' consistency'}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-medium text-[var(--text-muted)] mt-2">No scheduled occurrences in this period.</p>
        )}
      </section>

      {/* Progress Insights */}
      <section className={panel}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-extrabold text-lg sm:text-xl text-[var(--text-main)] tracking-tight">
            Progress insights
          </h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
            Smart Analysis
          </span>
        </div>
        {!insights.length ? (
          <p className="text-xs sm:text-sm font-medium text-[var(--text-muted)]">
            Insights appear when both comparison periods have at least three scheduled opportunities and the records support an observation.
          </p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3.5 mt-4">
            {insights.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] p-4.5 space-y-1.5 card-hover shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm text-[var(--text-main)]">
                    {item.title} · {item.periodName}
                  </h3>
                  <span className="text-[10px] font-mono-num font-bold text-[var(--accent)] bg-[var(--accent)]/12 px-2 py-0.5 rounded-md">
                    {item.period}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium leading-relaxed">
                  {item.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
