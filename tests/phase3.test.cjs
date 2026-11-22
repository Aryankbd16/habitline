const assert = require('node:assert/strict')
const { test } = require('node:test')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const Database = require('better-sqlite3')
const { calendarPeriod, comparisonDates, createProgress, datesBetween } = require('../web/src/lib/progress.js')
const { buildInsights } = require('../web/src/lib/insights.js')
const { buildDashboardSections, dashboardConfig } = require('../web/src/lib/personalization.js')

test('calendar comparisons, schedule-aware consistency, insights and custom category order', () => {
  const today = '2026-06-20'
  const [current, previous] = comparisonDates(today, 'week')
  assert.equal(current[0], '2026-06-15')
  assert.equal(previous[0], '2026-06-08')
  assert.equal(current.length, 6)
  assert.equal(calendarPeriod(today, 'month').length, 20)
  assert.equal(calendarPeriod(today, 'month', -1).length, 31)
  assert.deepEqual(comparisonDates('2026-03-31', 'month').map((dates) => dates.length), [28, 28])
  const base = { points: 2, startDate: '2026-06-01', frequency: { type: 'weekly', days: [1, 3, 5] }, priority: 'medium', createdAt: '2026-06-01' }
  const habits = [
    { ...base, id: 'a', name: 'Improve', category: 'Studio' },
    { ...base, id: 'b', name: 'Decline', category: 'Coding' },
    { ...base, id: 'c', name: 'Archived', isArchived: true, scheduleHistory: [{ ...base, until: '2026-06-16' }] },
    { ...base, id: 'd', name: 'New', startDate: '2026-06-19' },
  ]
  const records = [
    ...['15', '17', '19', '22'].map((date) => ({ habitId: 'a', date: '2026-06-' + date, pointsEarned: 3 })),
    ...['08', '10', '12'].map((date) => ({ habitId: 'b', date: '2026-06-' + date })),
    { habitId: 'c', date: '2026-06-15' },
  ]
  const progress = createProgress(habits, records, today)
  assert.equal(progress.period(current, 'a').rate, 100)
  assert.equal(progress.period(current, 'a').points, 9)
  assert.equal(progress.period(current, 'b').missed, 3)
  assert.equal(progress.period(current, 'c').scheduled, 1)
  assert.equal(progress.period(current, 'c').completed, 1)
  assert.equal(progress.lifetime('a').completed, 3)
  assert.equal(progress.period(calendarPeriod(today, 'month'), 'a').scheduled, 9)
  assert.equal(progress.period([today], 'a').rate, null)
  const insights = buildInsights(progress, habits, today)
  assert.match(insights.find(({ id }) => id === 'week:a').text, /higher/)
  assert.match(insights.find(({ id }) => id === 'week:b').text, /lower/)
  assert.ok(!insights.some(({ habitId }) => habitId === 'd' || habitId === 'c'))
  assert.equal(new Set(insights.map(({ id }) => id)).size, insights.length)
  const sparse = createProgress([habits[3]], [], today)
  assert.deepEqual(buildInsights(sparse, [habits[3]], today), [])
  assert.deepEqual(buildInsights(createProgress([], [], today), [], today), [])
  const { focusAreas } = dashboardConfig({ profession: 'Computer Engineering Student', areasOfFocus: ['Studio', 'Coding'] })
  assert.deepEqual(buildDashboardSections(habits.slice(0, 2).reverse(), focusAreas).map(({ title }) => title), ['Studio', 'Coding'])
})

test('goal and milestone API scopes writes, survives restart, and preserves earned history', { timeout: 25000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'habitline-phase3-'))
  const databasePath = join(dir, 'phase3.db')
  const source = new Database(process.env.HABITLINE_TEST_SOURCE || 'data/habit_tracker.db', { readonly: true })
  const counts = ['users', 'habits', 'completions'].map((name) => source.prepare('SELECT count(*) AS count FROM ' + name).get().count)
  await source.backup(databasePath)
  source.close()
  let proc, origin
  async function start() {
    proc = spawn(process.execPath, ['server/index.cjs'], {
      env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0', DATABASE_PATH: databasePath },
    })
    const [line] = await Promise.race([once(proc.stdout, 'data'), once(proc, 'exit').then(([code]) => { throw new Error('API exited ' + code) })])
    origin = line.toString().match(/http:\/\/localhost:\d+/)[0].replace('localhost', '127.0.0.1')
  }
  async function stop() {
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return
    const stopped = once(proc, 'exit')
    proc.kill()
    await stopped
  }
  async function send(path, status, cookie, method = 'GET', body) {
    const response = await fetch(origin + '/api' + path, {
      method, headers: { 'X-Habitline-Request': '1', ...(cookie && { cookie }), ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
    })
    const data = response.status === 204 ? null : await response.json()
    assert.equal(response.status, status, path + ' ' + JSON.stringify(data))
    return { ...data, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const signup = (name) => send('/auth/signup', 201, null, 'POST', { email: name.toLowerCase().replaceAll(' ', '-') + '@phase3.invalid', fullName: name, password: 'test password' })
  try {
    await start()
    const check = new Database(databasePath, { readonly: true })
    assert.equal(check.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('goals','goal_habits','milestones')").get().count, 3)
    assert.deepEqual(['users', 'habits', 'completions'].map((name) => check.prepare('SELECT count(*) AS count FROM ' + name).get().count), counts)
    assert.equal(check.pragma('integrity_check', { simple: true }), 'ok')
    assert.deepEqual(check.pragma('foreign_key_check'), [])
    check.close()
    await send('/goals', 401)
    await send('/milestones', 401)
    const a = (await signup('Phase Three A')).cookie
    const b = (await send('/auth/signup', 201, null, 'POST', { email: 'b@phase3.invalid', fullName: 'B', password: 'test password' })).cookie
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const first = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10)
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
    const { habit } = await send('/habits', 201, a, 'POST', { habit: { name: 'Practice', startDate: first } })
    const data = { title: 'Practice steadily', target: 30, startDate: first, habitIds: [habit.id, habit.id] }
    const create = (goal, cookie = a, status = 201) => send('/goals', status, cookie, 'POST', { goal })
    await create({ ...data, target: 0 }, a, 400)
    await create({ ...data, targetDate: '0100-01-01' }, a, 400)
    await create(data, b, 400)
    const { goal } = await create(data)
    assert.deepEqual(goal.habitIds, [habit.id])
    const secondary = (await create({ ...data, title: 'One session', target: 1, targetDate: yesterday })).goal
    const goalPath = '/goals/' + goal.id
    await send(goalPath, 404, b, 'PATCH', { goal: { title: 'Unauthorized' } })
    await send(goalPath, 404, b, 'DELETE')
    await send('/data/import', 200, a, 'POST', { habits: [habit], completions: datesBetween(first, yesterday).map((date) => ({ habitId: habit.id, date })) })
    const partial = (await send('/goals', 200, a)).goals.find(({ id }) => id === goal.id)
    assert.equal(partial.completed, 29)
    assert.equal(partial.percent, 96)
    await Promise.all([true, true].map((completed) => send('/completions', 200, a, 'PUT', { habitId: habit.id, date: today, completed })))
    const progress = (await send('/goals', 200, a)).goals
    assert.equal(progress.find(({ id }) => id === goal.id).percent, 100)
    assert.equal(progress.find(({ id }) => id === secondary.id).completed, 29)
    const earned = (await send('/milestones', 200, a)).milestones
    const phase3Awards = earned.filter(({ kind }) => ['goal-target','habit-30','habit-7','streak-7'].includes(kind))
    assert.deepEqual(phase3Awards.map(({ kind }) => kind).sort(), ['goal-target', 'goal-target', 'habit-30', 'habit-7', 'streak-7'])
    assert.equal(earned.find(({ kind }) => kind === 'habit-30').earnedOn, today)
    assert.deepEqual((await send('/milestones', 200, a)).milestones, earned)
    assert.deepEqual((await send('/milestones', 200, b)).milestones, [])
    assert.deepEqual((await send('/goals', 200, b)).goals, [])
    await send('/completions', 200, a, 'PUT', { habitId: habit.id, date: today, completed: false })
    assert.equal((await send('/goals', 200, a)).goals.find(({ id }) => id === goal.id).completed, 29)
    const edited = (await send(goalPath, 200, a, 'PATCH', { goal: { title: 'Edited', habitIds: [], archived: true } })).goal
    assert.equal(edited.completed, 0)
    assert.equal(edited.archivedOn, today)
    await stop()
    await start()
    assert.equal((await send('/goals', 200, a)).goals.find(({ id }) => id === goal.id).title, 'Edited')
    await send(goalPath, 204, a, 'DELETE')
    await send('/habits/' + habit.id, 204, a, 'DELETE')
    assert.deepEqual((await send('/goals', 200, a)).goals[0].habitIds, [])
    assert.deepEqual((await send('/milestones', 200, a)).milestones, earned)
    const extra = (await send('/habits', 201, a, 'POST', { habit: { name: 'Extra', startDate: first } })).habit
    const linked = (await send('/habits', 201, a, 'POST', { habit: { name: 'Linked', startDate: first } })).habit
    const fixture = new Database(databasePath)
    const insert = fixture.prepare('INSERT INTO completions (id, user_id, habit_id, date, completed_at, points_earned) VALUES (?, ?, ?, ?, ?, ?)')
    const dates = datesBetween(first, yesterday).slice(0, 7)
    fixture.transaction(() => {
      for (const date of dates) insert.run('audit-' + date, extra.userId, extra.id, date, date + 'T12:00:00Z', 5)
      insert.run('audit-linked', linked.userId, linked.id, first, first + 'T12:00:00Z', 5)
    })()
    assert.equal(fixture.prepare('SELECT count(*) AS count FROM milestones WHERE subject_id = ?').get(extra.id).count, 0)
    fixture.close()
    const backfill = (await send('/milestones', 200, a)).milestones.filter(({ subjectId }) => subjectId === extra.id)
    assert.deepEqual(backfill.map(({ kind }) => kind).sort(), ['habit-7', 'streak-7'])
    assert.ok(backfill.every(({ earnedOn }) => earnedOn === dates.at(-1)))
    assert.deepEqual((await send('/milestones', 200, a)).milestones.filter(({ subjectId }) => subjectId === extra.id), backfill)
    const twoHabits = (await create({ ...data, title: 'Two habits', habitIds: [extra.id, linked.id] })).goal
    assert.equal(twoHabits.completed, 8)
    const path = '/goals/' + twoHabits.id
    assert.equal((await send(path, 200, a, 'PATCH', { goal: { targetDate: first } })).goal.completed, 2)
    assert.equal((await send(path, 200, a, 'PATCH', { goal: { startDate: yesterday, targetDate: null } })).goal.completed, 0)
    await send('/habits/' + extra.id, 200, a, 'PATCH', { changes: { isArchived: true } })
    assert.equal((await send(path, 200, a, 'PATCH', { goal: { startDate: first } })).goal.completed, 8)
    const final = new Database(databasePath, { readonly: true })
    assert.deepEqual(final.pragma('foreign_key_check'), [])
    final.close()
  } finally {
    await stop()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('movement threshold uses the unrounded rate difference', () => {
  const today = '2026-06-21'
  const habit = { id: 'threshold', name: 'Threshold', startDate: '2026-05-01', frequency: { type: 'daily' } }
  const [current, prior] = comparisonDates(today, 'month')
  const records = [...current.slice(0, 12), ...prior.slice(0, 10)].map((date) => ({ habitId: habit.id, date }))
  const progress = createProgress([habit], records, today)
  assert.ok(progress.period(current).rate - progress.period(prior).rate < 10)
  assert.ok(!buildInsights(progress, [habit], today).some(({ id }) => id === 'month:threshold' || id === 'month:overall'))
  const exactDate = '2026-06-20'
  assert.match(buildInsights(createProgress([habit], records, exactDate), [habit], exactDate).find(({ id }) => id === 'month:threshold').text, /10 percentage points higher/)
})

test('weekly and monthly analytics follow each historical schedule version', () => {
  const habit = {
    id: 'changed', startDate: '2026-06-01', points: 4, isArchived: true, frequency: { type: 'weekly', days: [3] },
    scheduleHistory: [
      { until: '2026-06-15', startDate: '2026-06-01', frequency: { type: 'weekly', days: [1] } },
      { until: '2026-06-25', startDate: '2026-06-01', frequency: { type: 'weekly', days: [3] } },
    ],
  }
  const today = '2026-06-30'
  const records = ['2026-06-01', '2026-06-08', '2026-06-17'].map((date) => ({ habitId: habit.id, date }))
  const progress = createProgress([habit], records, today)
  const week = progress.period(calendarPeriod(today, 'week', -1), habit.id)
  const month = progress.period(calendarPeriod(today, 'month'), habit.id)
  assert.deepEqual([week.scheduled, week.completed, week.missed], [1, 0, 1])
  assert.deepEqual([month.scheduled, month.completed, month.missed, month.rate], [4, 3, 1, 75])
  assert.deepEqual(progress.streaks.get(habit.id), { current: 0, longest: 3 })
  assert.equal(createProgress([{ ...habit, isArchived: false }], records, '2026-06-24').streaks.get(habit.id).current, 3)
})
