const { firstStreakDate, longestStreak } = require('../web/src/lib/calculations.js')
const { rank } = require('./social.cjs')

module.exports = function installChallenges({ app, db, requireUser, invalid, validDate, localToday, id, habitOut, game, social }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), scope TEXT NOT NULL CHECK(scope IN ('personal','friends','group')),
      group_id TEXT REFERENCES accountability_groups(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL,
      start_date TEXT NOT NULL,end_date TEXT NOT NULL,target INTEGER NOT NULL CHECK(target>0),
      mode TEXT NOT NULL CHECK(mode IN ('count','streak')), archived_on TEXT,
      CHECK((scope='group')=(group_id IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS challenge_members (
      challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),
      state TEXT NOT NULL CHECK(state IN ('invited','active')),joined_on TEXT,
      target_override INTEGER CHECK(target_override BETWEEN 1 AND 10000),
      PRIMARY KEY(challenge_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS challenge_members_user ON challenge_members(user_id,challenge_id);
    CREATE TABLE IF NOT EXISTS challenge_habits (
      challenge_id TEXT NOT NULL,user_id TEXT NOT NULL,habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      PRIMARY KEY(challenge_id,user_id,habit_id),
      FOREIGN KEY(challenge_id,user_id) REFERENCES challenge_members(challenge_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS challenge_habits_habit ON challenge_habits(habit_id);
  `)
  const { reject, blocked, connected, inGroup, requireText, safeIdentity } = social
  const links = db.prepare('SELECT habit_id FROM challenge_habits WHERE challenge_id=? AND user_id=? ORDER BY habit_id')
  const challenge = db.prepare('SELECT * FROM challenges WHERE id=?')
  const membership = db.prepare('SELECT * FROM challenge_members WHERE challenge_id=? AND user_id=?')
  const ownedHabit = db.prepare('SELECT * FROM habits WHERE id=? AND user_id=?')
  const members = db.prepare('SELECT * FROM challenge_members WHERE challenge_id=?')
  const enroll = db.prepare('INSERT INTO challenge_members VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING')
  const recordRows = db.prepare(`
    SELECT c.habit_id,c.date FROM challenge_habits h JOIN completions c ON c.habit_id=h.habit_id AND c.user_id=h.user_id
    WHERE h.challenge_id=? AND h.user_id=? AND c.date BETWEEN ? AND ?
    AND (?=1 OR EXISTS(SELECT 1 FROM xp_events x WHERE x.completion_id=c.id AND x.kind='award'))
    ORDER BY c.date,c.id
  `)

  function eligible(row, userId) {
    if (row.scope === 'personal') return row.owner_id === userId
    if (row.scope === 'group' && (!inGroup(row.group_id,userId) || !inGroup(row.group_id,row.owner_id))) return false
    return row.owner_id === userId || (!blocked(row.owner_id,userId) && (row.scope === 'group' || connected(row.owner_id,userId)))
  }
  function get(challengeId, userId, manage = false) {
    const row = challenge.get(challengeId)
    const mine = membership.get(challengeId,userId)
    if (!row || !mine || !eligible(row,userId) || (manage && row.owner_id !== userId)) return reject('Challenge unavailable.',404)
    return { row, mine }
  }
  const targetFor = (row, mine) => mine.target_override ?? row.target
  function progress(row, mine, today) {
    const target = targetFor(row, mine)
    const end = [today,row.end_date,row.archived_on].filter(Boolean).sort()[0]
    const start = [row.start_date,mine.joined_on].filter(Boolean).sort().at(-1)
    const records = recordRows.all(row.id,mine.user_id,start,end,Number(row.scope === 'personal'))
    let value = records.length
    let reachedOn = records[target - 1]?.date ?? null
    if (row.mode === 'streak') {
      const link = links.get(row.id,mine.user_id)
      const habit = link && ownedHabit.get(link.habit_id,mine.user_id)
      const dates = records.map(({ date }) => date)
      value = habit ? longestStreak(habitOut(habit),dates) : 0
      reachedOn = value >= target ? firstStreakDate(habitOut(habit),dates,target) : null
    }
    return { value, reachedOn, complete: Boolean(reachedOn) }
  }
  function checkAward(row,mine,today) {
    if (mine.state !== 'active' || !eligible(row,mine.user_id)) return
    const { reachedOn } = progress(row,mine,today)
    if (reachedOn) game.badge(mine.user_id,'challenge-complete',row.id,row.title,'Reached the challenge target of ' + targetFor(row,mine) + ' ' + (row.mode === 'streak' ? 'consecutive scheduled occurrences.' : 'completions.'),reachedOn)
  }
  function sync(userId,today) {
    const rows = db.prepare("SELECT * FROM challenge_members WHERE user_id=? AND state='active'").all(userId)
    for (const mine of rows) checkAward(challenge.get(mine.challenge_id),mine,today)
  }

  function out(row,mine,today) {
    const active = mine.state === 'active'
    const data = active ? progress(row,mine,today) : { value:0,complete:false,reachedOn:null }
    const ranks = active && row.scope !== 'personal' ? members.all(row.id).flatMap((other) => {
      if (other.state !== 'active' || !eligible(row,other.user_id) || blocked(mine.user_id,other.user_id)) return []
      const identity = safeIdentity(mine.user_id,other.user_id)
      return identity ? [{ ...identity, ...progress(row,other,today), target:targetFor(row,other) }] : []
    }) : []
    return {
      id:row.id,scope:row.scope,groupId:row.group_id,title:row.title,description:row.description,startDate:row.start_date,endDate:row.end_date,
      target:targetFor(row,mine),mode:row.mode,archivedOn:row.archived_on,owner:row.owner_id === mine.user_id,state:mine.state, ...data,
      habitIds:active ? links.all(row.id,mine.user_id).map(({ habit_id }) => habit_id) : [],
      ranks:rank(ranks,'value'),
    }
  }
  function validateLinks(raw,userId,mode,allowEmpty = false) {
    if (!Array.isArray(raw) || raw.length > 50 || !raw.every((item) => typeof item === 'string' && ownedHabit.get(item,userId))) throw invalid('Choose habits from your account.')
    const ids = [...new Set(raw)]
    if ((!ids.length && !allowEmpty) || (mode === 'streak' && ids.length !== 1 && !(allowEmpty && !ids.length))) throw invalid(mode === 'streak' ? 'Link exactly one habit for a streak challenge.' : 'Link at least one habit.')
    return ids
  }
  function setLinks(row,userId,ids) {
    db.prepare('DELETE FROM challenge_habits WHERE challenge_id=? AND user_id=?').run(row.id,userId)
    const insert = db.prepare('INSERT INTO challenge_habits VALUES (?,?,?)')
    for (const habitId of ids) insert.run(row.id,userId,habitId)
  }
  function write(req,res,prior) {
    const input = req.body || {}
    const today = localToday(input.timeZone)
    const scope = prior?.scope ?? input.scope ?? 'personal'
    if (!['personal','friends','group'].includes(scope)) throw invalid('Choose a valid challenge scope.')
    const groupId = scope === 'group' ? prior?.group_id ?? input.groupId : null
    if (scope === 'group') {
      if (typeof groupId !== 'string') throw invalid('Choose a group.')
      social.allowedGroup(groupId,req.userId,true)
    }
    if (scope !== 'personal' && !social.person.get(req.userId)) return reject('Create a social profile first.')
    const title = requireText(input.title ?? prior?.title,120,'challenge title')
    const description = requireText(input.description ?? prior?.description ?? '',1000,'description',true)
    const mode = prior?.mode ?? input.mode ?? 'count'
    if (!['count','streak'].includes(mode)) throw invalid('Choose a progress measure.')
    const start = input.startDate ?? prior?.start_date ?? today
    const end = input.endDate ?? prior?.end_date
    const target = input.target ?? prior?.target
    if (!validDate(start) || !validDate(end) || end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 366) throw invalid('Choose a date window of up to 367 days.')
    if (!Number.isInteger(target) || target < 1 || target > 10000) throw invalid('Choose a whole target from 1 to 10,000.')
    if (input.archived !== undefined && typeof input.archived !== 'boolean') throw invalid('Choose a valid archive state.')
    const archived = input.archived === true ? prior?.archived_on ?? today : input.archived === false ? null : prior?.archived_on ?? null
    const challengeId = prior?.id ?? id()
    const habits = input.habitIds === undefined && prior ? null : validateLinks(input.habitIds ?? [],req.userId,mode,scope !== 'personal')
    const result = db.transaction(() => {
      db.prepare(`
        INSERT INTO challenges VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,description=excluded.description,start_date=excluded.start_date,
        end_date=excluded.end_date,target=excluded.target,archived_on=excluded.archived_on
      `).run(challengeId,req.userId,scope,groupId,title,description,start,end,target,mode,archived)
      if (!prior) enroll.run(challengeId,req.userId,'active',scope === 'personal' ? null : today,null)
      const row = challenge.get(challengeId)
      if (habits) setLinks(row,req.userId,habits)
      for (const mine of members.all(challengeId)) checkAward(row,mine,today)
      return out(row,membership.get(challengeId,req.userId),today)
    })()
    res.status(prior ? 200 : 201).json({ challenge:result })
  }

  const route = (method,path,handler) => social.route(method,'/challenges'+path,handler)
  route('get','',(req,res) => {
    const today = localToday(req.query.timeZone)
    const rows = db.prepare('SELECT * FROM challenge_members WHERE user_id=?').all(req.userId)
    const challenges = rows.flatMap((mine) => {
      const row = challenge.get(mine.challenge_id)
      return eligible(row,req.userId) ? [out(row,mine,today)] : []
    })
    res.json({ challenges })
  })
  route('post','',(req,res) => write(req,res))
  route('patch','/:id',(req,res) => write(req,res,get(req.params.id,req.userId,true).row))
  route('post','/:id/invite/:other',(req,res) => {
    const { row } = get(req.params.id,req.userId,true)
    const target = req.params.other
    const today = localToday(req.body?.timeZone)
    if (row.scope === 'personal' || row.archived_on || today > row.end_date || target === req.userId || !eligible(row,target)) return reject('This account cannot join the challenge.')
    const goal = req.body?.target ?? null
    if (goal !== null && (!Number.isInteger(goal) || goal < 1 || goal > 10000)) throw invalid('Choose a whole individual target from 1 to 10,000.')
    if (!enroll.run(row.id,target,'invited',null,goal).changes) return reject('This account already has an invitation or participation.',409)
    res.status(201).json({ ok:true })
  })
  route('patch','/:id/join',(req,res) => {
    const { row,mine } = get(req.params.id,req.userId)
    if (mine.state !== 'invited') return reject('Invitation unavailable.',404)
    if (req.body?.accept === false) {
      db.prepare('DELETE FROM challenge_members WHERE challenge_id=? AND user_id=?').run(row.id,req.userId)
    } else if (req.body?.accept === true) {
      const today = localToday(req.body?.timeZone)
      if (row.archived_on || today > row.end_date) return reject('This challenge has ended.')
      const ids = validateLinks(req.body.habitIds,req.userId,row.mode)
      db.transaction(() => {
        setLinks(row,req.userId,ids)
        db.prepare("UPDATE challenge_members SET state='active',joined_on=? WHERE challenge_id=? AND user_id=?").run(today,row.id,req.userId)
        if (row.scope === 'group') game.badge(req.userId,'group-participation',row.id,'Joined a group challenge','Accepted a private group challenge invitation.',today)
        checkAward(row,membership.get(row.id,req.userId),today)
      })()
    } else throw invalid('Choose whether to accept.')
    res.status(204).end()
  })
  route('put','/:id/habits',(req,res) => {
    const { row,mine } = get(req.params.id,req.userId)
    const today = localToday(req.body?.timeZone)
    if (mine.state !== 'active' || row.archived_on || today > row.end_date) return reject('Only active participants can edit linked habits.')
    const ids = validateLinks(req.body?.habitIds,req.userId,row.mode)
    db.transaction(() => { setLinks(row,req.userId,ids); checkAward(row,mine,today) })()
    res.status(204).end()
  })
  route('delete','/:id/participation',(req,res) => {
    const { row } = get(req.params.id,req.userId)
    if (row.owner_id === req.userId) return reject('Archive your own challenge to end participation.')
    db.prepare('DELETE FROM challenge_members WHERE challenge_id=? AND user_id=?').run(row.id,req.userId)
    res.status(204).end()
  })

  return { sync }
}
