import { addDays, dayOfWeek, startOfMonth, todayStr, parseDateStr } from './dateUtils.js'
import { summarizeDay, currentStreak, longestStreak } from './calculations.js'

export function datesBetween(start, end) {
  const dates = []
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date)
  return dates
}

export function calendarPeriod(today, unit, offset = 0) {
  if (unit === 'week') {
    const start = addDays(today, -((dayOfWeek(today) + 6) % 7) + offset * 7)
    return datesBetween(start, addDays(start, 6)).filter((date) => date <= today)
  }
  const month = parseDateStr(startOfMonth(today))
  month.setMonth(month.getMonth() + offset)
  const end = new Date(month)
  end.setMonth(end.getMonth() + 1, 0)
  return datesBetween(todayStr(month), todayStr(end)).filter((date) => date <= today)
}

export function comparisonDates(today, unit, offset = 0) {
  const current = calendarPeriod(today, unit, offset)
  const previous = calendarPeriod(today, unit, offset - 1)
  const length = Math.min(current.length, previous.length)
  return [current.slice(0, length), previous.slice(0, length)]
}

export function createProgress(habits, completions, today) {
  const byHabit = new Map(habits.map(({ id }) => [id, []]))
  const byDate = new Map()
  for (const record of completions) {
    if (record.date > today || !byHabit.has(record.habitId)) continue
    byHabit.get(record.habitId).push(record.date)
    if (!byDate.has(record.date)) byDate.set(record.date, [])
    byDate.get(record.date).push(record)
  }
  const cache = new Map()
  function day(date) {
    if (!cache.has(date)) cache.set(date, summarizeDay(habits, byDate.get(date) || [], date))
    return cache.get(date)
  }

  function period(dates, habitId) {
    let scheduled = 0
    let completed = 0
    let points = 0
    let missed = 0
    const daily = []
    for (const date of dates) {
      if (date > today) continue
      const summary = day(date)
      const eligible = habitId ? summary.scheduled.filter(({ id }) => id === habitId) : summary.scheduled
      const done = eligible.filter(({ id }) => summary.doneIds.has(id))
      const earned = habitId ? (summary.done.find((record) => record.habitId === habitId)?.pointsEarned ?? done[0]?.points ?? 0) : summary.earned
      scheduled += eligible.length
      completed += done.length
      points += earned
      if (date < today) missed += eligible.length - done.length
      daily.push({ date, scheduled: eligible.length, completed: done.length, rate: eligible.length ? done.length / eligible.length * 100 : null, points: earned, focus: habitId ? (eligible[0]?.points ? (done.length ? 100 : 0) : null) : summary.possible ? summary.focus : null })
    }
    return { scheduled, completed, points, missed, daily, rate: scheduled ? completed / scheduled * 100 : null }
  }

  const first = [today, ...byDate.keys(), ...habits.flatMap((habit) => [
    habit.startDate, ...(habit.scheduleHistory || []).map((entry) => entry.startDate),
  ])].filter(Boolean).reduce((a, b) => a < b ? a : b)
  const allDates = datesBetween(first, today)
  const lifetime = (habitId) => period(allDates, habitId)
  const streaks = new Map(habits.map((habit) => {
    const dates = byHabit.get(habit.id).sort()
    return [habit.id, { current: currentStreak(habit, new Set(dates), today), longest: longestStreak(habit, dates) }]
  }))
  return { period, lifetime, streaks }
}
