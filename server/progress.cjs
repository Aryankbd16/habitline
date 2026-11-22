const { firstStreakDate } = require('../web/src/lib/calculations.js')

module.exports = function installProgress({ app, db, requireUser, invalid, validDate, localToday, id, habitOut }) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
        description TEXT NOT NULL, target INTEGER NOT NULL CHECK(target > 0),
        start_date TEXT NOT NULL, target_date TEXT, archived_on TEXT, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS goals_user ON goals(user_id, created_at);
      CREATE TABLE IF NOT EXISTS goal_habits (
        goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        PRIMARY KEY(goal_id, habit_id)
      );
      CREATE INDEX IF NOT EXISTS goal_habits_habit ON goal_habits(habit_id, goal_id);
      CREATE TABLE IF NOT EXISTS milestones (
        user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, subject_id TEXT NOT NULL,
        title TEXT NOT NULL, description TEXT NOT NULL, earned_on TEXT NOT NULL,
        PRIMARY KEY(user_id, kind, subject_id)
      );
      CREATE INDEX IF NOT EXISTS milestones_user_date ON milestones(user_id, earned_on);
    `)
  })()

  const goalsFor = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at, id')
  const ownedGoal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?')
  const ownedHabit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?')
  const goalHabits = db.prepare('SELECT habit_id FROM goal_habits WHERE goal_id = ? ORDER BY habit_id')
  const contributionRows = `
    FROM goal_habits gh JOIN completions c ON c.habit_id = gh.habit_id AND c.user_id = ?
    WHERE gh.goal_id = ? AND c.date BETWEEN ? AND ?
  `
  const contributionCount = db.prepare('SELECT COUNT(*) AS completed ' + contributionRows)
  const thresholdDate = db.prepare('SELECT c.date ' + contributionRows + ' ORDER BY c.date, c.habit_id LIMIT 1 OFFSET ?')
  const completionDates = db.prepare('SELECT date FROM completions WHERE habit_id = ? AND user_id = ? AND date <= ? ORDER BY date')
  const award = db.prepare('INSERT INTO milestones VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, kind, subject_id) DO NOTHING')
  const earnedKinds = db.prepare('SELECT kind FROM milestones WHERE user_id = ? AND subject_id = ?')
  const writeLink = db.prepare('INSERT INTO goal_habits VALUES (?, ?)')
  const clearLinks = db.prepare('DELETE FROM goal_habits WHERE goal_id = ?')
  const linkedGoals = db.prepare('SELECT g.* FROM goals g JOIN goal_habits gh ON gh.goal_id = g.id WHERE gh.habit_id = ? AND g.user_id = ?')

  function goalProgress(goal, today) {
    const end = [today, goal.target_date, goal.archived_on].filter(Boolean).sort()[0]
    const parameters = [goal.user_id, goal.id, goal.start_date, end]
    const { completed } = contributionCount.get(...parameters)
    return {
      completed,
      percent: Math.min(100, Math.floor(completed / goal.target * 100)),
      reachedOn: completed >= goal.target ? thresholdDate.get(...parameters, goal.target - 1).date : null,
    }
  }

  function goalOut(goal, today) {
    return {
      id: goal.id, title: goal.title, description: goal.description, target: goal.target,
      startDate: goal.start_date, targetDate: goal.target_date, archivedOn: goal.archived_on,
      habitIds: goalHabits.all(goal.id).map((row) => row.habit_id), ...goalProgress(goal, today),
    }
  }

  function awardGoal(goal, today) {
    const { reachedOn } = goalProgress(goal, today)
    if (reachedOn) award.run(goal.user_id, 'goal-target', goal.id, goal.title, 'Reached the goal target of ' + goal.target + (goal.target === 1 ? ' habit completion.' : ' habit completions.'), reachedOn)
  }

  function awardHabit(userId, row, today) {
    const kinds = new Set(earnedKinds.all(userId, row.id).map(({ kind }) => kind))
    if (['habit-7', 'habit-30', 'streak-7'].every((kind) => kinds.has(kind))) return
    const records = completionDates.all(row.id, userId, today).map(({ date }) => date)
    for (const target of [7, 30]) {
      if (records.length >= target && !kinds.has('habit-' + target)) {
        award.run(userId, 'habit-' + target, row.id, row.name, 'Logged ' + target + ' completed occurrences.', records[target - 1])
      }
    }
    if (records.length < 7 || kinds.has('streak-7')) return
    const earnedOn = firstStreakDate(habitOut(row), records, 7)
    if (earnedOn) award.run(userId, 'streak-7', row.id, row.name, 'Completed seven consecutive scheduled occurrences.', earnedOn)
  }

  function syncHabit(userId, habit, today) {
    awardHabit(userId, habit, today)
    for (const goal of linkedGoals.all(habit.id, userId)) awardGoal(goal, today)
  }

  const syncMilestones = db.transaction((userId, today) => {
    for (const habit of db.prepare('SELECT * FROM habits WHERE user_id = ?').all(userId)) awardHabit(userId, habit, today)
    for (const goal of goalsFor.all(userId)) awardGoal(goal, today)
  })

  function validate(input, userId) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 ||
        typeof input.description !== 'string' || input.description.length > 2000) throw invalid('Enter a goal title and a description of at most 2,000 characters.')
    if (!Number.isInteger(input.target) || input.target < 1 || input.target > 1000000) throw invalid('Choose a whole-number target from 1 to 1,000,000.')
    if (!validDate(input.startDate) || (input.targetDate !== null && (!validDate(input.targetDate) || input.targetDate < input.startDate))) throw invalid('Choose valid goal dates. The target date must be on or after the start date.')
    if (!Array.isArray(input.habitIds) || input.habitIds.length > 200 ||
        !input.habitIds.every((habitId) => typeof habitId === 'string' && ownedHabit.get(habitId, userId))) throw invalid('Choose up to 200 habits from your account.')
    if (typeof input.archived !== 'boolean') throw invalid('Choose a valid archive state.')
    return { ...input, title: input.title.trim(), description: input.description.trim(), habitIds: [...new Set(input.habitIds)] }
  }

  function writeGoal(req, res, existing) {
    const today = localToday(req.body?.timeZone)
    const changes = req.body?.goal
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw invalid('Goal details are required.')
    const base = existing ? {
      ...goalOut(existing, today), archived: Boolean(existing.archived_on),
    } : { description: '', startDate: today, targetDate: null, habitIds: [], archived: false }
    const input = validate({ ...base, ...changes }, req.userId)
    const goalId = existing?.id ?? id()
    const archivedOn = input.archived ? existing?.archived_on ?? today : null
    const result = db.transaction(() => {
      db.prepare(`INSERT INTO goals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description,
        target=excluded.target, start_date=excluded.start_date, target_date=excluded.target_date, archived_on=excluded.archived_on`)
        .run(goalId, req.userId, input.title, input.description, input.target, input.startDate, input.targetDate, archivedOn, existing?.created_at ?? new Date().toISOString())
      clearLinks.run(goalId)
      for (const habitId of input.habitIds) writeLink.run(goalId, habitId)
      const goal = ownedGoal.get(goalId, req.userId)
      awardGoal(goal, today)
      return goalOut(goal, today)
    })()
    res.status(existing ? 200 : 201).json({ goal: result })
  }

  app.get('/api/goals', requireUser, (req, res) => {
    const today = localToday(req.query.timeZone)
    res.json({ goals: goalsFor.all(req.userId).map((goal) => goalOut(goal, today)) })
  })
  app.post('/api/goals', requireUser, (req, res) => writeGoal(req, res))
  app.patch('/api/goals/:goalId', requireUser, (req, res) => {
    const goal = ownedGoal.get(req.params.goalId, req.userId)
    if (!goal) return res.status(404).json({ error: 'Goal not found.' })
    writeGoal(req, res, goal)
  })
  app.delete('/api/goals/:goalId', requireUser, (req, res) => {
    if (!db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(req.params.goalId, req.userId).changes) {
      return res.status(404).json({ error: 'Goal not found.' })
    }
    res.status(204).end()
  })
  app.get('/api/milestones', requireUser, (req, res) => {
    syncMilestones(req.userId, localToday(req.query.timeZone))
    res.json({ milestones: db.prepare(`SELECT kind, subject_id AS subjectId, title, description, earned_on AS earnedOn
      FROM milestones WHERE user_id = ? ORDER BY earned_on DESC, kind, subject_id`).all(req.userId) })
  })

  return { syncHabit, syncMilestones }
}
