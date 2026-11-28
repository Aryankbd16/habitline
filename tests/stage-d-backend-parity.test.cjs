const assert = require('node:assert/strict')
const { test } = require('node:test')
const Database = require('better-sqlite3')
const fixture = require('../shared/fixtures/stage-d-progress-v1.json')
const installProgress = require('../server/progress.cjs')
const installGame = require('../server/game.cjs')
const installChallenges = require('../server/challenges.cjs')

test('Stage D target windows and XP thresholds match the backend routes', () => {
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    db.exec(
      "CREATE TABLE users (id TEXT PRIMARY KEY);" +
      "CREATE TABLE accountability_groups (id TEXT PRIMARY KEY);" +
      "CREATE TABLE habits (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);" +
      "CREATE TABLE completions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, habit_id TEXT NOT NULL, date TEXT NOT NULL," +
      " UNIQUE(habit_id, date)); INSERT INTO users VALUES ('fixture')"
    )
    for (const h of fixture.habits) db.prepare("INSERT INTO habits (id, user_id) VALUES (?, 'fixture')").run(h.id)
    const insert = db.prepare("INSERT OR IGNORE INTO completions VALUES (?, 'fixture', ?, ?)")
    for (const [i, row] of fixture.completions.entries()) {
      insert.run(String(i), row.habitId, row.date)
      insert.run('duplicate-' + i, row.habitId, row.date)
    }
    const routes = new Map()
    const route = (method, path, ...handlers) => routes.set(method + ' ' + path, handlers.at(-1))
    const app = Object.fromEntries(['get', 'post', 'patch', 'delete'].map((method) => [method, route.bind(null, method)]))
    const record = (row) => {
      const h = fixture.habits.find(({ id }) => id === row.id)
      const schedule = (v) => ({
        startDate: h.start, points: v.points, isArchived: Boolean(v.archived),
        frequency: { type: 'weekly', days: Array.from({ length: 7 }, (_, d) => d).filter((d) => v.mask & (1 << d)) },
      })
      return { id: h.id, name: h.name, ...schedule(h.versions.at(-1)),
        scheduleHistory: h.versions.slice(0, -1).map((v, i) => ({ ...schedule(v), until: h.versions[i + 1].from })) }
    }
    let nextId = 0
    const deps = {
      app, db, localToday: () => fixture.day, id: () => String(++nextId), habitOut: record,
      requireUser: () => {}, invalid: (message) => Error(message), validDate: (day) => /^\d{4}-\d{2}-\d{2}$/.test(day),
    }
    installProgress(deps)
    const game = installGame(deps)
    installChallenges({
      ...deps, game,
      social: {
        route: (method, path, handler) => route(method, '/api/social' + path, handler),
        requireText: (value) => value.trim(),
      },
    })
    function request(method, path, body) {
      let output
      const response = { status: () => response, json: (result) => { output = result } }
      routes.get(method + ' ' + path)({ userId: 'fixture', query: {}, body }, response)
      return output
    }
    for (const { id, expected, ...input } of fixture.targets) {
      if (id === 'goal') {
        const { goal } = request('post', '/api/goals', { goal: input })
        assert.equal(goal.completed, expected.value)
        assert.equal(goal.reachedOn, expected.reachedOn)
      } else {
        const { challenge } = request('post', '/api/social/challenges', input)
        assert.equal(challenge.value, expected.value)
        assert.equal(challenge.reachedOn, expected.reachedOn)
      }
    }
    const xp = db.prepare("INSERT INTO xp_events VALUES (?, 'award', 'fixture', 'read', ?, ?, ?)")
    let balance = 0
    for (const level of fixture.levels) {
      xp.run(String(level.xp), fixture.day, level.xp - balance, fixture.day + 'T12:00:00Z')
      balance = level.xp
      assert.deepEqual(game.snapshot('fixture'), {
        xp: level.xp, level: level.level, threshold: level.threshold, nextLevelAt: level.next,
      })
    }
  } finally {
    db.close()
  }
})
