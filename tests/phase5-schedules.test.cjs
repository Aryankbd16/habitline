const test = require('node:test')
const assert = require('node:assert/strict')
const fixture = require('../shared/fixtures/android-schedules-v1.json')
const { currentStreak } = require('../web/src/lib/calculations.js')
const { isHabitScheduledOn } = require('../web/src/lib/schedule.js')

test('Android fixture agrees with the Phase 2–4 schedule and streak rules', () => {
  const versions = fixture.schedules.map(row => ({
    isArchived: row.archived, startDate: fixture.schedules[0].effectiveFrom,
    frequency: { type: 'weekly', days: row.days }, points: row.points,
  }))
  for (const { day, scheduled, streak } of fixture.cases) {
    const index = fixture.schedules.findLastIndex(row => row.effectiveFrom <= day)
    const habit = { ...versions[index], scheduleHistory: versions.slice(0, index).map((row, i) => ({
      ...row, until: fixture.schedules[i + 1].effectiveFrom,
    })) }
    assert.equal(isHabitScheduledOn(habit, day), scheduled, day)
    assert.equal(currentStreak(habit, new Set(fixture.dates.filter(date => date <= day)), day), streak, day)
  }
  for (const { utc, zone, day } of fixture.zonedDates) {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(utc))
    const date = Object.fromEntries(parts.map(part => [part.type, part.value]))
    assert.equal([date.year, date.month, date.day].join('-'), day)
  }
})
