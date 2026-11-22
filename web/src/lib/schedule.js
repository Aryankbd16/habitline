import { dayOfWeek } from './dateUtils.js'

/**
 * habit.frequency is one of:
 *  - { type: 'daily' }
 *  - { type: 'weekly', days: [0-6, ...] }     // custom selected weekdays
 *  - { type: 'weekly_count', timesPerWeek: n } // reserved for future use
 *
 * Phase 1 only requires daily / weekly(custom weekdays). "Weekly" (a single
 * flag) is modeled as weekly with all 7 days unless the user narrows it down,
 * which keeps a single code path instead of two.
 */
export function isHabitScheduledOn(habit, dateStr) {
  const schedule = habit.scheduleHistory?.find((entry) => dateStr < entry.until) || habit
  if (schedule.isArchived) return false
  if (schedule.startDate && dateStr < schedule.startDate) return false

  const freq = schedule.frequency || { type: 'daily' }
  if (freq.type === 'daily') return true
  if (freq.type === 'weekly') {
    const days = freq.days && freq.days.length ? freq.days : [0, 1, 2, 3, 4, 5, 6]
    return days.includes(dayOfWeek(dateStr))
  }
  return true
}

export function frequencyLabel(freq) {
  if (!freq || freq.type === 'daily') return 'Daily'
  if (freq.type === 'weekly') {
    if (!freq.days || freq.days.length === 7) return 'Every day (weekly)'
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return freq.days.map((d) => labels[d]).join(', ')
  }
  return 'Custom'
}
