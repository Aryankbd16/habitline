import { addDays, todayStr } from './dateUtils.js'
import { isHabitScheduledOn } from './schedule.js'

/**
 * IMPORTANT: This file is the single source of truth for every number shown
 * in the UI (dashboard, calendar, analytics, profile, widget export). Do not
 * recompute completion %, focus score, or streaks anywhere else — call these
 * functions instead. This is what makes a future backend/cloud sync safe:
 * the server can reuse the exact same logic.
 */

/**
 * Habit Completion % (simple count-based, NOT weighted by points)
 *   completedCount / scheduledCount
 */
export function completionPercent(scheduledHabits, completions) {
  if (scheduledHabits.length === 0) return 0
  const completedIds = new Set(completions.map((c) => c.habitId))
  const completed = scheduledHabits.filter((h) => completedIds.has(h.id)).length
  return Math.round((completed / scheduledHabits.length) * 100)
}

/**
 * Weighted Focus Score (points-based)
 *   pointsEarned / pointsPossible
 * Kept deliberately separate from completionPercent — see spec section 12.
 */
export function focusScore(scheduledHabits, completions) {
  const possible = pointsPossibleOnDate(scheduledHabits, completions)
  return possible ? Math.round(pointsEarnedOnDate(scheduledHabits, completions) / possible * 100) : 0
}

function pointsFor(habit, completion) {
  return completion?.pointsEarned ?? habit.points ?? 0
}

export function pointsEarnedOnDate(habits, completions) {
  const done = new Map(completions.map((completion) => [completion.habitId, completion]))
  return habits.reduce((total, habit) => total + (done.has(habit.id) ? pointsFor(habit, done.get(habit.id)) : 0), 0)
}

export function pointsPossibleOnDate(habits, completions = []) {
  const done = new Map(completions.map((completion) => [completion.habitId, completion]))
  return habits.reduce((total, habit) => total + pointsFor(habit, done.get(habit.id)), 0)
}

export function summarizeDay(habits, completions, date) {
  const done = completions.filter((completion) => completion.date === date)
  const doneIds = new Set(done.map((completion) => completion.habitId))
  const scheduled = habits.flatMap((habit) => {
    if (!doneIds.has(habit.id) && !isHabitScheduledOn(habit, date)) return []
    const schedule = habit.scheduleHistory?.find((entry) => date < entry.until)
    return [{ ...habit, points: schedule?.points ?? habit.points }]
  })
  return {
    scheduled, done, doneIds,
    completed: scheduled.filter((habit) => doneIds.has(habit.id)).length,
    completion: completionPercent(scheduled, done),
    focus: focusScore(scheduled, done),
    earned: pointsEarnedOnDate(scheduled, done),
    possible: pointsPossibleOnDate(scheduled, done),
  }
}

export function periodProgress(habits, completions, dates) {
  const totals = { scheduled: 0, completed: 0, points: 0 }
  const byDate = new Map()
  for (const completion of completions) {
    if (!byDate.has(completion.date)) byDate.set(completion.date, [])
    byDate.get(completion.date).push(completion)
  }
  for (const date of dates) {
    const day = summarizeDay(habits, byDate.get(date) || [], date)
    totals.scheduled += day.scheduled.length
    totals.completed += day.completed
    totals.points += day.earned
  }
  return { ...totals, rate: totals.scheduled ? Math.round(totals.completed / totals.scheduled * 100) : 0 }
}

/**
 * Current streak: consecutive scheduled days (walking backward from today,
 * or from the most recent scheduled day) that were completed, with no gaps.
 * A day where the habit was not scheduled does not break the streak.
 */
export function currentStreak(habit, completionDatesSet, asOfDate = todayStr()) {
  if (habit.isArchived) return 0
  const start = earliestSchedule(habit, asOfDate)
  let streak = 0
  let cursor = asOfDate
  // If today is scheduled but not yet completed, don't penalize — start
  // checking from yesterday so "haven't done it yet today" ≠ "streak broken".
  if (isHabitScheduledOn(habit, cursor) && !completionDatesSet.has(cursor)) {
    cursor = addDays(cursor, -1)
  }

  while (cursor >= start) {
    if (!completionDatesSet.has(cursor) && !isHabitScheduledOn(habit, cursor)) {
      cursor = addDays(cursor, -1)
      continue
    }
    if (completionDatesSet.has(cursor)) {
      streak++
      cursor = addDays(cursor, -1)
    } else {
      break
    }
  }
  return streak
}

/**
 * Longest streak across full completion history for a habit.
 */
export function longestStreak(habit, dates) {
  let longest = 0
  for (const { length } of streakProgress(habit, dates)) longest = Math.max(longest, length)
  return longest
}

export function firstStreakDate(habit, dates, target) {
  for (const { date, length } of streakProgress(habit, dates)) {
    if (length === target) return date
  }
  return null
}

function* streakProgress(habit, dates) {
  if (!dates.length) return
  const done = new Set(dates)
  let length = 0
  for (let date = dates[0]; date <= dates.at(-1); date = addDays(date, 1)) {
    if (done.has(date)) yield { date, length: ++length }
    else if (isHabitScheduledOn(habit, date)) length = 0
  }
}

function earliestSchedule(habit, fallback) {
  return [habit.startDate || fallback, ...(habit.scheduleHistory || []).map((schedule) => schedule.startDate)].sort()[0]
}

export function averageDailyScore(dailyScores) {
  if (dailyScores.length === 0) return 0
  const sum = dailyScores.reduce((a, b) => a + b, 0)
  return Math.round(sum / dailyScores.length)
}
