const { firstStreakDate, longestStreak } = require('../web/src/lib/calculations.js')

const step = Number(process.env.HABITLINE_XP_LEVEL_STEP ?? 100)
if (!Number.isInteger(step) || step < 1 || step > 100000) throw new Error('HABITLINE_XP_LEVEL_STEP must be a whole number from 1 to 100,000.')
function levelFor(xp) {
  const level = Math.floor((1 + Math.sqrt(1 + 8 * xp / step)) / 2)
  const threshold = step * level * (level - 1) / 2
  return { xp, level, threshold, nextLevelAt: threshold + step * level }
}

module.exports = function installGame({ app, db, requireUser, habitOut, localToday }) {
  db.transaction(() => {
    if (!db.pragma('table_info(habits)').some(({ name }) => name === 'xp_value')) {
      db.exec('ALTER TABLE habits ADD COLUMN xp_value INTEGER NOT NULL DEFAULT 10 CHECK(xp_value BETWEEN 0 AND 100)')
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS xp_events (
        completion_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('award','reverse')),
        user_id TEXT NOT NULL REFERENCES users(id), habit_id TEXT NOT NULL,
        day TEXT NOT NULL, amount INTEGER NOT NULL, at TEXT NOT NULL,
        PRIMARY KEY(completion_id, kind)
      );
      CREATE INDEX IF NOT EXISTS xp_events_period ON xp_events(user_id, day);
      CREATE INDEX IF NOT EXISTS xp_events_habit ON xp_events(user_id, habit_id, day, at);
    `)
  })()

  const balance = db.prepare('SELECT COALESCE(SUM(amount),0) AS xp FROM xp_events WHERE user_id=?')
  const snapshot = (userId) => levelFor(balance.get(userId).xp)
  const award = db.prepare('INSERT INTO milestones VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id,kind,subject_id) DO NOTHING')
  const event = db.prepare('INSERT INTO xp_events VALUES (?,?,?,?,?,?,?) ON CONFLICT(completion_id,kind) DO NOTHING')
  const initialXP = db.prepare("SELECT amount FROM xp_events WHERE user_id=? AND habit_id=? AND day=? AND kind='award' ORDER BY at LIMIT 1")
  const reverseEvent = db.prepare(`
    INSERT INTO xp_events SELECT completion_id,'reverse',user_id,habit_id,day,-amount,?
    FROM xp_events WHERE completion_id=? AND user_id=? AND kind='award'
    ON CONFLICT(completion_id,kind) DO NOTHING
  `)
  const liveCompletions = db.prepare('SELECT id FROM completions WHERE user_id=? AND (? IS NULL OR habit_id=?)')
  const datesFor = db.prepare('SELECT date FROM completions WHERE user_id=? AND habit_id=? AND date<=? ORDER BY date')

  function badge(userId, kind, subject, title, description, day) {
    award.run(userId, kind, String(subject), title, description, day)
  }

  function mark(userId, row, completionId, day) {
    const before = snapshot(userId).level
    const amount = initialXP.get(userId, row.id, day)?.amount ?? row.xp_value
    if (!event.run(completionId, 'award', userId, row.id, day, amount, new Date().toISOString()).changes) return
    const after = snapshot(userId).level
    for (let level = before + 1; level <= after; level++) {
      badge(userId, 'level', level, 'Level ' + level, 'Reached level ' + level + ' through earned XP.', day)
    }
    const tracked = db.prepare(`
      SELECT c.date FROM completions c JOIN xp_events e ON e.completion_id=c.id AND e.kind='award'
      WHERE c.user_id=? AND c.date<=? ORDER BY c.date, c.id LIMIT 500
    `).all(userId, day)
    for (const count of [1, 7, 100, 500]) {
      if (tracked.length >= count) badge(userId, 'tracked-completions', count, count + (count === 1 ? ' tracked completion' : ' tracked completions'), 'Logged ' + count + ' in-app habit completions.', tracked[count - 1].date)
    }
    const habit = habitOut(row)
    const dates = datesFor.all(userId, row.id, day).map(({ date }) => date)
    const best = longestStreak(habit, dates)
    for (const count of [3, 14, 30, 100]) {
      if (best >= count) badge(userId, 'streak-' + count, row.id, row.name, 'Completed ' + count + ' consecutive scheduled occurrences.', firstStreakDate(habit, dates, count))
    }
  }

  const reverse = (userId, completionId) => reverseEvent.run(new Date().toISOString(), completionId, userId)
  function remove(userId, habitId = null) {
    for (const { id } of liveCompletions.all(userId, habitId, habitId)) reverse(userId, id)
  }

  app.get('/api/game', requireUser, (req, res) => {
    const today = localToday(req.query.timeZone)
    const achievements = db.prepare(`
      SELECT kind,subject_id AS subjectId,title,description,earned_on AS earnedOn
      FROM milestones WHERE user_id=? ORDER BY earned_on DESC, rowid DESC
    `).all(req.userId)
    const activity = db.prepare(`
      SELECT kind,day,amount,at FROM xp_events WHERE user_id=? ORDER BY at DESC,rowid DESC LIMIT 25
    `).all(req.userId)
    const bestStreak = db.prepare('SELECT * FROM habits WHERE user_id=?').all(req.userId).reduce((best, row) =>
      Math.max(best, longestStreak(habitOut(row), datesFor.all(req.userId, row.id, today).map(({ date }) => date))), 0)
    res.json({ ...snapshot(req.userId), achievements, activity, bestStreak })
  })

  return { mark, reverse, remove, snapshot, badge }
}
