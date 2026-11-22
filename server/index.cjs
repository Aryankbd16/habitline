const fs = require('fs')
const path = require('path')
const express = require('express')
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const { randomUUID, randomBytes, createHash } = require('node:crypto')

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
const databasePath = process.env.DATABASE_PATH || path.join(dataDir, 'habit_tracker.db')
fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, avatar_emoji TEXT, onboarding TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
    category TEXT NOT NULL, icon TEXT, type TEXT NOT NULL, frequency TEXT NOT NULL,
    start_date TEXT NOT NULL, points REAL NOT NULL, priority TEXT NOT NULL,
    reminder_time TEXT, is_archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS habits_user_id ON habits(user_id);
  CREATE TABLE IF NOT EXISTS completions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, habit_id TEXT NOT NULL, date TEXT NOT NULL,
    completed_at TEXT NOT NULL, UNIQUE(habit_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (habit_id) REFERENCES habits(id)
  );
  CREATE INDEX IF NOT EXISTS completions_user_id ON completions(user_id);
  CREATE TABLE IF NOT EXISTS habit_relationships (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, habit_id TEXT NOT NULL,
    related_habit_id TEXT NOT NULL, relationship_type TEXT NOT NULL DEFAULT 'Related',
    created_at TEXT NOT NULL,
    UNIQUE(user_id, habit_id, related_habit_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (habit_id) REFERENCES habits(id),
    FOREIGN KEY (related_habit_id) REFERENCES habits(id)
  );
  CREATE INDEX IF NOT EXISTS habit_relationships_user_id ON habit_relationships(user_id);
  CREATE INDEX IF NOT EXISTS habit_relationships_habit_id ON habit_relationships(habit_id);
  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
    UNIQUE(user_id, key), FOREIGN KEY (user_id) REFERENCES users(id)
  );
`)

db.transaction(() => {
  db.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL)')
  if (!db.pragma('table_info(completions)').some(({ name }) => name === 'points_earned')) {
    db.exec('ALTER TABLE completions ADD COLUMN points_earned REAL')
    db.exec('UPDATE completions SET points_earned = (SELECT points FROM habits WHERE habits.id = completions.habit_id)')
  }
  if (!db.pragma('table_info(habits)').some(({ name }) => name === 'schedule_history')) {
    db.exec("ALTER TABLE habits ADD COLUMN schedule_history TEXT NOT NULL DEFAULT '[]'")
  }
})()

const app = express()
app.use(express.json({ limit: '2mb' }))

const id = randomUUID
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const str = (value, max) => typeof value === 'string' && value.length <= max
const invalid = (message) => Object.assign(new Error(message), { status: 400 })
const validDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  date >= '0100-01-01' && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
function localToday(timeZone = 'UTC') {
  if (!str(timeZone, 80)) throw invalid('Choose a valid time zone.')
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    return [values.year, values.month, values.day].join('-')
  } catch {
    throw invalid('Choose a valid time zone.')
  }
}
const sessionAge = 30 * 86400000
const cookie = 'habitline_session'
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api' }
const hash = (token) => createHash('sha256').update(token).digest('hex')
const tokenOf = (req) => req.headers.cookie?.match(/(?:^|; *)habitline_session=([a-f0-9]{64})(?:;|$)/)?.[1]

function beginSession(req, res, userId) {
  const token = randomBytes(32).toString('hex')
  db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?').run(Date.now(), hash(tokenOf(req) || ''))
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), userId, Date.now() + sessionAge)
  })()
  res.cookie(cookie, token, { ...cookieOptions, maxAge: sessionAge })
}

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Habitline-Request') !== '1') {
    return res.status(403).json({ error: 'Request could not be verified.' })
  }
  next()
})
const json = (value, fallback) => { try { return JSON.parse(value) } catch { return fallback } }
const userOut = (row) => row && ({ id: row.id, fullName: row.full_name, email: row.email, avatarEmoji: row.avatar_emoji, onboarding: json(row.onboarding, {}), createdAt: row.created_at })
const personalizationOut = (value) => {
  const parsed = json(value, {})
  const data = object(parsed) ? parsed : {}
  return {
    primaryGoal: typeof data.primaryGoal === 'string' ? data.primaryGoal.slice(0, 80) : null,
    profession: typeof data.profession === 'string' ? data.profession.trim().slice(0, 120) : '',
    areasOfFocus: Array.isArray(data.areasOfFocus) ? [...new Set(data.areasOfFocus.filter((area) => str(area, 80)))].slice(0, 30) : [],
  }
}
const habitOut = (row) => row && ({ id: row.id, userId: row.user_id, name: row.name, description: row.description, category: row.category, icon: row.icon, type: row.type, frequency: json(row.frequency, { type: 'daily' }), startDate: row.start_date, points: row.points, priority: row.priority, reminderTime: row.reminder_time, isArchived: Boolean(row.is_archived), createdAt: row.created_at, scheduleHistory: json(row.schedule_history, []), xpValue: row.xp_value ?? 10 })
const completionOut = (row) => row && ({ id: row.id, userId: row.user_id, habitId: row.habit_id, date: row.date, completedAt: row.completed_at, pointsEarned: row.points_earned })
const relationshipOut = (row) => row && ({ id: row.id, userId: row.user_id, habitId: row.habit_id, relatedHabitId: row.related_habit_id, relationshipType: row.relationship_type, createdAt: row.created_at })
const requireUser = (req, res, next) => {
  const token = tokenOf(req)
  const session = token && db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hash(token), Date.now())
  if (!session) return res.status(401).json({ error: 'Please log in again.' })
  if (req.params.userId && req.params.userId !== session.user_id) return res.status(404).json({ error: 'Profile not found.' })
  req.userId = session.user_id
  next()
}
const getUser = (userId) => userOut(db.prepare('SELECT * FROM users WHERE id = ?').get(userId))
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.post('/api/auth/signup', async (req, res) => {
  const { fullName, email: rawEmail, password } = req.body || {}
  const email = str(rawEmail, 254) ? rawEmail.trim().toLowerCase() : ''
  if (!str(fullName, 120) || !fullName.trim()) throw invalid('Enter a name between 1 and 120 characters.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('Enter a valid email address.')
  if (typeof password !== 'string' || password.length < 6 || Buffer.byteLength(password) > 72) throw invalid('Enter a password of at least 6 characters and at most 72 UTF-8 bytes.')
  const onboarding = personalizationOut(JSON.stringify(req.body?.onboarding ?? {}))
  const passwordHash = await bcrypt.hash(password, 12)
  const userId = id()
  const result = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING')
    .run(userId, fullName.trim(), email, passwordHash, '🎯', JSON.stringify(onboarding), new Date().toISOString())
  if (!result.changes) return res.status(409).json({ error: 'An account with this email already exists.' })
  beginSession(req, res, userId)
  res.status(201).json({ user: getUser(userId) })
})
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!str(email, 254) || !str(password, 1024)) throw invalid('Enter your email and password.')
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase())
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' })
  beginSession(req, res, row.id)
  res.json({ user: userOut(row) })
})
app.get('/api/auth/session', requireUser, (req, res) => res.json({ user: getUser(req.userId) }))
app.post('/api/auth/logout', (req, res) => {
  const token = tokenOf(req)
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token))
  res.clearCookie(cookie, cookieOptions)
  res.status(204).end()
})
app.get('/api/users/:userId', requireUser, (req, res) => res.json({ user: getUser(req.userId) }))
app.patch('/api/users/:userId', requireUser, (req, res) => {
  const current = getUser(req.userId)
  const changes = req.body?.changes
  if (!object(changes)) throw invalid('Profile changes are required.')
  const fullName = changes.fullName ?? current.fullName
  const avatar = changes.avatarEmoji ?? current.avatarEmoji
  if (!str(fullName, 120) || !fullName.trim()) throw invalid('Enter a name between 1 and 120 characters.')
  if (avatar !== null && !str(avatar, 24)) throw invalid('Choose a valid avatar.')
  db.prepare('UPDATE users SET full_name = ?, avatar_emoji = ? WHERE id = ?').run(fullName.trim(), avatar, req.userId)
  res.json({ user: getUser(req.userId) })
})
app.get('/api/profile/personalization', requireUser, (req, res) => {
  const user = db.prepare('SELECT onboarding FROM users WHERE id = ?').get(req.userId)
  res.json({ personalization: personalizationOut(user.onboarding) })
})
app.put('/api/profile/personalization', requireUser, (req, res) => {
  if (!object(req.body?.personalization)) throw invalid('Personalization settings are required.')
  const personalization = personalizationOut(JSON.stringify(req.body.personalization))
  db.prepare('UPDATE users SET onboarding = ? WHERE id = ?').run(JSON.stringify(personalization), req.userId)
  res.json({ personalization, user: userOut(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)) })
})
const progress = require('./progress.cjs')({ app, db, requireUser, invalid, validDate, localToday, id, habitOut })
const phase4 = { app, db, requireUser, invalid, validDate, localToday, id, habitOut }
const { game, challenges } = db.transaction(() => {
  const game = require('./game.cjs')(phase4)
  const social = require('./social.cjs')({ ...phase4, game })
  const challenges = require('./challenges.cjs')({ ...phase4, game, social })
  return { game, challenges }
})()

app.get('/api/habits', requireUser, (req, res) => res.json({ habits: db.prepare('SELECT * FROM habits WHERE user_id = ? ORDER BY created_at').all(req.userId).map(habitOut) }))
const habitDefaults = { xpValue: 10, description: '', category: 'General', icon: '⭐', frequency: { type: 'daily' }, priority: 'medium', reminderTime: null, isArchived: false, points: 0 }
function validateHabit(habit) {
  if (!str(habit.name, 120) || !habit.name.trim()) throw invalid('Enter a habit name between 1 and 120 characters.')
  if (!str(habit.description, 2000) || !str(habit.category, 60) || !habit.category.trim() || !str(habit.icon, 24)) throw invalid('Check the description, category and icon.')
  if (!Number.isFinite(habit.points) || habit.points < 0 || habit.points > 1000000) throw invalid('Enter points between 0 and 1,000,000.')
  if (!Number.isInteger(habit.xpValue) || habit.xpValue < 0 || habit.xpValue > 100) throw invalid('Choose a whole-number XP reward from 0 to 100.')
  if (!validDate(habit.startDate)) throw invalid('Choose a valid start date.')
  if (!['low', 'medium', 'high'].includes(habit.priority) || typeof habit.isArchived !== 'boolean') throw invalid('Choose a valid priority and habit status.')
  if (habit.reminderTime !== null && (typeof habit.reminderTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(habit.reminderTime))) throw invalid('Choose a valid reminder time.')
  const freq = habit.frequency
  if (!object(freq) || (freq.type !== 'daily' && (freq.type !== 'weekly' || !Array.isArray(freq.days) ||
    !freq.days.length || !freq.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)))) throw invalid('Choose daily or select at least one weekday.')
  return {
    ...habit, name: habit.name.trim(), category: habit.category.trim(), description: habit.description.trim(),
    frequency: freq.type === 'daily' ? { type: 'daily' } : { type: 'weekly', days: [...new Set(freq.days)].sort() },
  }
}

const insertHabit = db.prepare('INSERT INTO habits (id, user_id, name, description, category, icon, type, frequency, start_date, points, priority, reminder_time, is_archived, created_at, schedule_history, xp_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
const findHabit = db.prepare('SELECT * FROM habits WHERE id = ?')
const findOwnedHabit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?')
function saveNewHabit(habitId, userId, habit, history = []) {
  insertHabit.run(habitId, userId, habit.name, habit.description, habit.category, habit.icon, 'binary',
    JSON.stringify(habit.frequency), habit.startDate, habit.points, habit.priority, habit.reminderTime,
    Number(habit.isArchived), new Date().toISOString(), JSON.stringify(history), habit.xpValue)
}

app.post('/api/habits', requireUser, (req, res) => {
  if (!object(req.body?.habit)) throw invalid('Habit details are required.')
  const habit = validateHabit({ ...habitDefaults, startDate: localToday(req.body.timeZone), ...req.body.habit, isArchived: false })
  const habitId = id()
  saveNewHabit(habitId, req.userId, habit)
  res.status(201).json({ habit: habitOut(findHabit.get(habitId)) })
})
app.patch('/api/habits/:habitId', requireUser, (req, res) => {
  const row = findOwnedHabit.get(req.params.habitId, req.userId)
  if (!row) return res.status(404).json({ error: 'Habit not found.' })
  if (!object(req.body?.changes)) throw invalid('Habit changes are required.')
  const current = habitOut(row)
  const merged = validateHabit({ ...habitDefaults, ...current, icon: current.icon ?? habitDefaults.icon, ...req.body.changes })
  const date = req.body.date ?? localToday(req.body.timeZone)
  if (date !== localToday(req.body?.timeZone)) throw invalid('Choose today as the change date.')
  const history = current.scheduleHistory
  if (merged.isArchived !== current.isArchived || merged.startDate !== current.startDate || merged.points !== current.points ||
      JSON.stringify(merged.frequency) !== JSON.stringify(current.frequency)) {
    const lastChange = history.at(-1)?.until
    if (lastChange && date < lastChange) throw invalid('The change date is earlier than the last schedule change.')
    if (lastChange !== date) {
      history.push({ until: date, startDate: current.startDate, frequency: current.frequency, isArchived: current.isArchived, points: current.points })
    }
  }
  db.prepare('UPDATE habits SET name=?, description=?, category=?, icon=?, frequency=?, start_date=?, points=?, priority=?, reminder_time=?, is_archived=?, schedule_history=?, xp_value=? WHERE id=? AND user_id=?')
    .run(merged.name, merged.description, merged.category, merged.icon, JSON.stringify(merged.frequency), merged.startDate, merged.points, merged.priority, merged.reminderTime, Number(merged.isArchived), JSON.stringify(history), merged.xpValue, row.id, req.userId)
  res.json({ habit: habitOut(findHabit.get(row.id)) })
})
app.delete('/api/habits/:habitId', requireUser, (req, res) => {
  db.transaction(() => { game.remove(req.userId, req.params.habitId); db.prepare('DELETE FROM completions WHERE habit_id = ? AND user_id = ?').run(req.params.habitId, req.userId); db.prepare('DELETE FROM habit_relationships WHERE user_id = ? AND (habit_id = ? OR related_habit_id = ?)').run(req.userId, req.params.habitId, req.params.habitId); db.prepare('DELETE FROM habits WHERE id = ? AND user_id = ?').run(req.params.habitId, req.userId) })()
  res.status(204).end()
})
app.get('/api/completions', requireUser, (req, res) => res.json({ completions: db.prepare('SELECT * FROM completions WHERE user_id = ? ORDER BY date').all(req.userId).map(completionOut) }))
const insertCompletion = db.prepare('INSERT INTO completions (id, user_id, habit_id, date, completed_at, points_earned) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(habit_id, date) DO NOTHING')
app.put('/api/completions', requireUser, (req, res) => {
  const { habitId, date, completed } = req.body || {}
  if (!str(habitId, 120) || date !== localToday(req.body?.timeZone) || typeof completed !== 'boolean') throw invalid("Specify a habit, today's date and completion status.")
  const row = findOwnedHabit.get(habitId, req.userId)
  if (!row) return res.status(404).json({ error: 'Habit not found.' })
  let awards = []
  if (!completed) {
    db.transaction(() => {
      const prior = db.prepare('SELECT id FROM completions WHERE user_id=? AND habit_id=? AND date=?').get(req.userId, habitId, date)
      if (prior) game.reverse(req.userId, prior.id)
      db.prepare('DELETE FROM completions WHERE user_id = ? AND habit_id = ? AND date = ?').run(req.userId, habitId, date)
    })()
  } else {
    const habit = habitOut(row)
    const schedule = habit.scheduleHistory.find((item) => date < item.until) || habit
    const { frequency } = schedule
    if (schedule.isArchived || date < schedule.startDate || (frequency.type === 'weekly' && frequency.days?.length && !frequency.days.includes(new Date(date).getUTCDay()))) {
      throw invalid('This habit is not scheduled for that day.')
    }
    db.transaction(() => {
      const completionId = id()
      const result = insertCompletion.run(completionId, req.userId, habitId, date, new Date().toISOString(), schedule.points ?? habit.points)
      if (result.changes) {
        const last = db.prepare('SELECT COALESCE(MAX(rowid),0) AS rowid FROM milestones').get().rowid
        progress.syncHabit(req.userId, row, date)
        game.mark(req.userId, row, completionId, date)
        challenges.sync(req.userId, date)
        awards = db.prepare('SELECT title,description FROM milestones WHERE user_id=? AND rowid>? ORDER BY rowid').all(req.userId,last)
      }
    })()
  }
  const completion = completed ? completionOut(db.prepare('SELECT * FROM completions WHERE user_id = ? AND habit_id = ? AND date = ?').get(req.userId, habitId, date)) : null
  res.json({ completed, completion, awards })
})
app.get('/api/habit-relationships', requireUser, (req, res) => res.json({ relationships: db.prepare('SELECT * FROM habit_relationships WHERE user_id = ? ORDER BY created_at').all(req.userId).map(relationshipOut) }))
app.post('/api/habit-relationships', requireUser, (req, res) => {
  const { habitId, relatedHabitId } = req.body || {}
  const relationshipType = ['Related', 'Supports', 'Paired'].includes(req.body?.relationshipType) ? req.body.relationshipType : 'Related'
  if (!str(habitId, 120) || !str(relatedHabitId, 120) || !habitId || !relatedHabitId || habitId === relatedHabitId) return res.status(400).json({ error: 'Choose two different habits.' })
  const owned = db.prepare('SELECT id FROM habits WHERE user_id = ? AND id IN (?, ?)').all(req.userId, habitId, relatedHabitId)
  if (owned.length !== 2) return res.status(404).json({ error: 'Both habits must belong to your account.' })
  const [firstHabitId, secondHabitId] = [habitId, relatedHabitId].sort()
  const existing = db.prepare('SELECT * FROM habit_relationships WHERE user_id = ? AND habit_id = ? AND related_habit_id = ?').get(req.userId, firstHabitId, secondHabitId)
  if (existing) return res.json({ relationship: relationshipOut(existing) })
  const relationship = { id: id(), userId: req.userId, habitId: firstHabitId, relatedHabitId: secondHabitId, relationshipType, createdAt: new Date().toISOString() }
  db.prepare('INSERT INTO habit_relationships VALUES (?, ?, ?, ?, ?, ?)').run(relationship.id, relationship.userId, relationship.habitId, relationship.relatedHabitId, relationship.relationshipType, relationship.createdAt)
  res.status(201).json({ relationship })
})
app.delete('/api/habit-relationships/:relationshipId', requireUser, (req, res) => {
  const result = db.prepare('DELETE FROM habit_relationships WHERE id = ? AND user_id = ?').run(req.params.relationshipId, req.userId)
  if (!result.changes) return res.status(404).json({ error: 'Relationship not found.' })
  res.status(204).end()
})
app.post('/api/data/import', requireUser, (req, res) => {
  const { habits = [], completions = [], relationships = [] } = req.body || {}
  if (![habits, completions, relationships].every(Array.isArray)) throw invalid('Invalid backup records.')
  const habitIds = new Map()
  const timestamps = (value) => str(value, 40) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString()
  let habitsImported = 0
  let completionsImported = 0
  const insertRelationship = db.prepare('INSERT INTO habit_relationships VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, habit_id, related_habit_id) DO NOTHING')
  db.transaction(() => {
    for (const input of habits) {
      if (!object(input) || !str(input.id, 120) || !input.id || habitIds.has(input.id)) throw invalid('Invalid or duplicate habit in backup.')
      const habit = validateHabit({ ...habitDefaults, ...input, icon: input.icon || habitDefaults.icon, reminderTime: input.reminderTime || null })
      const prior = findHabit.get(input.id)
      // A stable account-specific ID makes repeated imports of another account's backup safe.
      const habitId = prior && prior.user_id !== req.userId ? 'import-' + hash(JSON.stringify([req.userId, input.id])) : input.id
      habitIds.set(input.id, habitId)
      const destination = findHabit.get(habitId)
      if (destination && destination.user_id !== req.userId) throw invalid('A habit ID could not be restored safely.')
      if (destination) continue
      const history = input.scheduleHistory ?? []
      if (!Array.isArray(history) || !history.every((item) => object(item) && validDate(item.until))) throw invalid('Invalid schedule history.')
      const validatedHistory = history.map((item) => {
        const schedule = validateHabit({ ...habit, startDate: item.startDate, frequency: item.frequency, isArchived: item.isArchived, points: item.points ?? habit.points })
        return { until: item.until, startDate: schedule.startDate, frequency: schedule.frequency, isArchived: schedule.isArchived, points: schedule.points }
      }).sort((a, b) => a.until.localeCompare(b.until))
      saveNewHabit(habitId, req.userId, habit, validatedHistory)
      habitsImported++
    }
    for (const completion of completions) {
      const habitId = habitIds.get(completion?.habitId)
      if (!habitId || !validDate(completion.date)) throw invalid('Invalid completion in backup.')
      const points = completion.pointsEarned ?? findHabit.get(habitId).points
      if (!Number.isFinite(points) || points < 0 || points > 1000000) throw invalid('Invalid completion points in backup.')
      completionsImported += insertCompletion.run(id(), req.userId, habitId, completion.date, timestamps(completion.completedAt), points).changes
    }
    for (const relationship of relationships) {
      const first = habitIds.get(relationship?.habitId)
      const second = habitIds.get(relationship?.relatedHabitId)
      if (!first || !second || first === second || !['Related', 'Supports', 'Paired'].includes(relationship.relationshipType)) throw invalid('Invalid relationship in backup.')
      const [a, b] = [first, second].sort()
      insertRelationship.run(id(), req.userId, a, b, relationship.relationshipType, timestamps(relationship.createdAt))
    }
    const today = localToday(req.body?.timeZone)
    progress.syncMilestones(req.userId, today)
    challenges.sync(req.userId, today)
  })()
  res.json({ habitsImported, completionsImported })
})
app.delete('/api/data', requireUser, (req, res) => { db.transaction(() => { game.remove(req.userId); db.prepare('DELETE FROM social_posts WHERE user_id=?').run(req.userId); db.prepare("DELETE FROM challenges WHERE owner_id=? AND scope='personal'").run(req.userId); db.prepare('DELETE FROM goals WHERE user_id = ?').run(req.userId); db.prepare('DELETE FROM milestones WHERE user_id = ?').run(req.userId); db.prepare('DELETE FROM completions WHERE user_id = ?').run(req.userId); db.prepare('DELETE FROM habit_relationships WHERE user_id = ?').run(req.userId); db.prepare('DELETE FROM habits WHERE user_id = ?').run(req.userId); db.prepare('DELETE FROM settings WHERE user_id = ?').run(req.userId) })(); res.status(204).end() })

app.use((error, _req, res, _next) => {
  const status = error.status || 500
  if (status >= 500) console.error(error)
  res.status(status).json({ error: status >= 500 ? 'Habitline could not save or load your data. Try again.' : error.type === 'entity.parse.failed' ? 'Invalid JSON.' : error.message })
})

const port = Number(process.env.PORT || 3001)
const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Habitline SQLite API running on http://localhost:${server.address().port}\nDatabase: ${databasePath}`))
