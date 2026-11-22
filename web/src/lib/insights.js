import { comparisonDates } from './progress.js'

export function buildInsights(progress, habits, today) {
  const output = []
  const observed = new Set()
  for (const [unit, periodName] of [['week', 'Week over week'], ['month', 'Month over month']]) {
    const [current, previous] = comparisonDates(today, unit)
    if (!current.length) continue
    const period = current[0] + ' to ' + current.at(-1) + ' compared with ' + previous[0] + ' to ' + previous.at(-1)
    for (const habit of [null, ...habits.filter((item) => !item.isArchived)]) {
      const now = progress.period(current, habit?.id)
      const prior = progress.period(previous, habit?.id)
      if (Math.min(now.scheduled, prior.scheduled) < 3) continue
      const movement = now.completed * prior.scheduled - prior.completed * now.scheduled
      const opportunities = now.scheduled * prior.scheduled
      const difference = Math.round(movement / opportunities * 100)
      const evidence = period + ':' + (habit?.id || 'overall')
      if (observed.has(evidence)) continue
      const subject = habit?.name || 'Overall completion'
      const id = unit + ':' + (habit?.id || 'overall')
      if (Math.abs(movement) * 10 >= opportunities) {
        const action = difference < 0 ? ' Consider a smaller version or a different scheduled day.' : ''
        observed.add(evidence)
        output.push({ id, habitId: habit?.id, title: subject, periodName, period, text: Math.abs(difference) + ' percentage points ' + (difference > 0 ? 'higher.' : 'lower.') + action })
      } else if (habit && unit === 'month') {
        if (now.rate >= 80 || now.rate <= 40) {
          observed.add(evidence)
          output.push({ id, habitId: habit.id, title: subject, periodName: 'Monthly consistency', period, text: 'Completed ' + now.completed + ' of ' + now.scheduled + ' scheduled occurrences.' + (now.rate <= 40 ? ' Consider adjusting the schedule to fit your routine.' : '') })
        }
      }
    }
  }
  for (const habit of habits) {
    const streak = progress.streaks.get(habit.id)?.current ?? 0
    if (streak < 7) continue
    output.push({ id: 'streak:' + habit.id, habitId: habit.id, title: habit.name, periodName: 'Current streak', period: 'As of ' + today, text: 'Completed ' + streak + ' consecutive scheduled occurrences.' })
  }
  return output
}
