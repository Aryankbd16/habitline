const { spawn } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { once } = require('node:events')
const assert = require('node:assert/strict')
const test = require('node:test')
const Database = require('better-sqlite3')

test('Stage 2 API preserves legacy data and scopes persistent sessions and writes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'habitline-stage2-'))
  const databasePath = join(dir, 'test.db')
  const source = new Database(process.env.HABITLINE_TEST_SOURCE || 'data/habit_tracker.db', { readonly: true })
  const counts = ['users', 'habits', 'completions'].map((table) => source.prepare('SELECT COUNT(*) AS count FROM ' + table).get().count)
  await source.backup(databasePath)
  source.close()
  let proc, origin
  async function start() {
    proc = spawn(process.execPath, ['server/index.cjs'], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test', DATABASE_PATH: databasePath } })
    const [message] = await Promise.race([
      once(proc.stdout, 'data'),
      once(proc, 'exit').then(([code]) => { throw new Error('Server exited with code ' + code) }),
    ])
    origin = message.toString().match(/http:\/\/localhost:\d+/)[0].replace('localhost', '127.0.0.1')
  }
  async function stop() {
    const running = proc
    if (!running || running.exitCode !== null || running.signalCode !== null) return
    const exited = once(running, 'exit')
    running.kill()
    await exited
  }
  async function request(path, expected, { cookie, method = 'GET', body, verified = true } = {}) {
    const response = await fetch(origin + '/api' + path, {
      method, headers: { ...(verified && { 'X-Habitline-Request': '1' }), ...(cookie && { cookie }), ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
    })
    const data = response.status === 204 ? null : await response.json()
    assert.equal(response.status, expected, path + ' ' + JSON.stringify(data))
    const setCookie = response.headers.get('set-cookie')
    if (setCookie && expected !== 204) assert.match(setCookie, /HttpOnly.*SameSite=Lax/i)
    return { data, cookie: setCookie?.split(';')[0] }
  }
  const signup = (email) => request('/auth/signup', 201, { method: 'POST', body: { fullName: 'Stage Two', email, password: 'test password', onboarding: { profession: 'Medical Student' } } })
  try {
    await start()
    const db = new Database(databasePath, { readonly: true })
    assert.deepEqual(['users', 'habits', 'completions'].map((table) => db.prepare('SELECT COUNT(*) AS count FROM ' + table).get().count), counts)
    db.close()
    const a = await signup('stage2-a@example.invalid')
    const b = await signup('stage2-b@example.invalid')
    assert.equal(a.data.user.onboarding.profession, 'Medical Student')
    await request('/habits?userId=' + a.data.user.id, 401)
    await request('/users/' + a.data.user.id, 404, { cookie: b.cookie })
    await request('/auth/logout', 403, { method: 'POST', cookie: a.cookie, verified: false })
    await request('/users/' + a.data.user.id, 200, { cookie: a.cookie, method: 'PATCH', body: { changes: { fullName: 'New Name' } } })
    await request('/profile/personalization', 200, { cookie: a.cookie, method: 'PUT', body: { personalization: { profession: 'Computer Engineering Student', areasOfFocus: ['DSA'] } } })
    const create = (name) => request('/habits', 201, { cookie: a.cookie, method: 'POST', body: { habit: { name, points: 17, category: 'Custom' } } })
    const { data: { habit } } = await create('Algorithms')
    const second = (await create('Projects')).data.habit
    const change = (changes) => request('/habits/' + habit.id, 200, { cookie: a.cookie, method: 'PATCH', body: { changes } })
    await request('/habits/' + habit.id, 400, { cookie: a.cookie, method: 'PATCH', body: { changes: { frequency: { type: 'weekly', days: [] } } } })
    const date = new Date().toISOString().slice(0, 10)
    const complete = (completed, status = 200, when = date) => request('/completions', status, { cookie: a.cookie, method: 'PUT', body: { habitId: habit.id, date: when, completed } })
    await complete(true, 400, '2080-01-01')
    await Promise.all([complete(true), complete(true)])
    await change({ points: 44 })
    let records = (await request('/completions', 200, { cookie: a.cookie })).data.completions
    assert.equal(records.length, 1)
    assert.equal(records[0].pointsEarned, 17)
    await complete(false)
    await complete(false)
    await complete(true)
    await change({ isArchived: true })
    await complete(true, 400)
    await change({ isArchived: false })
    const link = (habitId, relatedHabitId, status, cookie = a.cookie) => request('/habit-relationships', status, { method: 'POST', cookie, body: { habitId, relatedHabitId, relationshipType: 'Paired' } })
    await link(habit.id, second.id, 404, b.cookie)
    const relation = (await link(habit.id, second.id, 201)).data.relationship
    assert.equal((await link(second.id, habit.id, 200)).data.relationship.id, relation.id)
    await request('/habit-relationships/' + relation.id, 404, { method: 'DELETE', cookie: b.cookie })
    await request('/habit-relationships/' + relation.id, 204, { method: 'DELETE', cookie: a.cookie })
    await link(habit.id, second.id, 201)
    const importData = (body, status) => request('/data/import', status, { method: 'POST', cookie: b.cookie, body })
    await importData({ habits: [habit], completions: [{ habitId: second.id, date }] }, 400)
    assert.deepEqual((await request('/habits', 200, { cookie: b.cookie })).data.habits, [])
    const backup = { habits: [habit, second], completions: [{ habitId: habit.id, date, pointsEarned: 17 }], relationships: [relation] }
    await importData(backup, 200)
    assert.equal((await importData(backup, 200)).data.habitsImported, 0)
    assert.equal((await request('/habits', 200, { cookie: b.cookie })).data.habits.length, 2)
    await stop()
    await start()
    assert.equal((await request('/auth/session', 200, { cookie: a.cookie })).data.user.fullName, 'New Name')
    assert.equal((await request('/habits?userId=' + b.data.user.id, 200, { cookie: a.cookie })).data.habits.length, 2)
    records = (await request('/completions', 200, { cookie: a.cookie })).data.completions
    assert.equal(records[0].pointsEarned, 44)
    await request('/habits/' + habit.id, 204, { method: 'DELETE', cookie: a.cookie })
    assert.deepEqual((await request('/completions', 200, { cookie: a.cookie })).data.completions, [])
    assert.deepEqual((await request('/habit-relationships', 200, { cookie: a.cookie })).data.relationships, [])
    await request('/auth/logout', 204, { method: 'POST', cookie: a.cookie })
    await request('/auth/session', 401, { cookie: a.cookie })
    await request('/auth/login', 401, { method: 'POST', body: { email: a.data.user.email, password: 'wrong' } })
    await request('/auth/login', 200, { method: 'POST', body: { email: a.data.user.email, password: 'test password' } })
  } finally {
    await stop()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('history, schedules, saved points and streaks share day calculations', async () => {
  const { summarizeDay, periodProgress, currentStreak, longestStreak } = await import('../web/src/lib/calculations.js')
  const habit = { id: 'h', points: 25, frequency: { type: 'daily' }, startDate: '2026-05-01', isArchived: true, scheduleHistory: [
    { until: '2026-05-09', startDate: '2026-05-01', frequency: { type: 'weekly', days: [1, 5] }, isArchived: false, points: 10 },
  ] }
  const completions = ['2026-05-01', '2026-05-04', '2026-05-08'].map((date) => ({ habitId: habit.id, date, pointsEarned: 10 }))
  assert.equal(summarizeDay([habit], completions, '2026-05-04').earned, 10)
  assert.equal(summarizeDay([habit], completions, '2026-05-05').scheduled.length, 0)
  assert.equal(periodProgress([habit], completions, ['2026-05-01', '2026-05-04', '2026-05-05', '2026-05-08', '2026-05-09']).rate, 100)
  assert.equal(longestStreak(habit, completions.map(({ date }) => date)), 3)
  assert.equal(currentStreak(habit, new Set(completions.map(({ date }) => date)), '2026-05-10'), 0)
  assert.equal(currentStreak({ ...habit, isArchived: false }, new Set(completions.map(({ date }) => date)), '2026-05-09'), 3)
})
