const assert = require('node:assert/strict')
const { test } = require('node:test')
const fixture = require('../shared/fixtures/stage-d-progress-v1.json')
const { calendarPeriod, comparisonDates, createProgress } = require('../web/src/lib/progress.js')
const { buildInsights } = require('../web/src/lib/insights.js')

function webHabit({ id, name, start, versions }) {
  const schedule = (entry) => ({
    startDate: start,
    points: entry.points,
    isArchived: Boolean(entry.archived),
    frequency: { type: 'weekly', days: Array.from({ length: 7 }, (_, day) => day).filter((day) => entry.mask & (1 << day)) },
  })
  return {
    id, name, ...schedule(versions.at(-1)),
    scheduleHistory: versions.slice(0, -1).map((entry, index) => ({
      ...schedule(entry), until: versions[index + 1].from,
    })),
  }
}

test('Stage D analytics fixture matches the actual web calculations', () => {
  const habits = fixture.habits.map(webHabit)
  const progress = createProgress(habits, fixture.completions, fixture.day)
  for (const row of fixture.expected) {
    const dates = calendarPeriod(fixture.day, row.period, row.offset)
    assert.equal(dates[0], row.first)
    assert.equal(dates.at(-1), row.last)
    assert.equal(comparisonDates(fixture.day, row.period, row.offset)[0].length, row.comparisonLength)
    const totals = progress.period(dates)
    for (const key of ['scheduled', 'completed', 'missed', 'points']) assert.equal(totals[key], row[key], row.period + ' ' + key)
  }
  assert.deepEqual(Object.fromEntries(progress.streaks), fixture.streaks)
  assert.equal(progress.period(['2026-02-01']).rate, null)
  assert.equal(progress.period(['2026-03-03']).daily[0].focus, 100)
  assert.equal(progress.period(['2026-03-03'], 'walk').completed, 1)
  assert.equal(progress.period(['2026-03-05'], 'stretch').daily[0].focus, null)
  assert.equal(progress.period(['2026-03-06']).daily.length, 0)
  const [current, previous] = comparisonDates(fixture.shortMonth.day, 'month')
  assert.equal(current.length, fixture.shortMonth.length)
  assert.equal(previous.at(-1), fixture.shortMonth.lastPrevious)
  for (const boundary of fixture.zones) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: boundary.zone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(boundary.utc))
    const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    assert.equal([map.year, map.month, map.day].join('-'), boundary.date)
  }
})

test('Stage D insight thresholds match the actual web insight engine', () => {
  for (const { current, previous, result } of fixture.movement) {
    let query = 0
    const progress = {
      period() {
        const [completed, scheduled] = query++ % 2 === 0 ? current : previous
        return { completed, scheduled, rate: completed / scheduled * 100 }
      },
      streaks: new Map(),
    }
    const week = buildInsights(progress, [], fixture.day).find(({ id }) => id === 'week:overall')
    assert.equal(week?.text.match(/^\d+/)?.[0] ?? null, result === null ? null : String(Math.abs(result)))
    if (result !== null) assert.match(week.text, result > 0 ? /higher/ : /lower/)
  }
})
