module.exports = function installSocial({ app, db, requireUser, invalid, localToday, id, game }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id), username TEXT NOT NULL UNIQUE,
      bio TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('private','friends','public')),
      discoverable INTEGER NOT NULL, show_xp INTEGER NOT NULL, show_awards INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      first_id TEXT NOT NULL REFERENCES users(id), second_id TEXT NOT NULL REFERENCES users(id),
      requested_by TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('pending','accepted')),
      PRIMARY KEY(first_id,second_id), CHECK(first_id < second_id), CHECK(requested_by IN (first_id,second_id))
    );
    CREATE INDEX IF NOT EXISTS contacts_second ON contacts(second_id,first_id);
    CREATE TABLE IF NOT EXISTS social_blocks (
      blocker TEXT NOT NULL REFERENCES users(id), blocked TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY(blocker,blocked), CHECK(blocker <> blocked)
    );
    CREATE TABLE IF NOT EXISTS accountability_groups (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES accountability_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), invited_by TEXT REFERENCES users(id),
      role TEXT NOT NULL CHECK(role IN ('owner','admin','member')),
      state TEXT NOT NULL CHECK(state IN ('invited','active')), PRIMARY KEY(group_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS group_members_user ON group_members(user_id,group_id);
    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL, subject_id TEXT NOT NULL, caption TEXT NOT NULL, published_at TEXT NOT NULL,
      UNIQUE(user_id,kind,subject_id)
    );
    CREATE INDEX IF NOT EXISTS social_posts_author ON social_posts(user_id,published_at);
    CREATE TABLE IF NOT EXISTS social_reactions (
      post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
      emoji TEXT NOT NULL, PRIMARY KEY(post_id,user_id)
    );
  `)

  const reject = (message, status = 403) => { throw Object.assign(new Error(message), { status }) }
  const requireText = (value, max, label, allowEmpty = false) => {
    if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw invalid('Enter a valid ' + label + '.')
    return value.trim()
  }
  const blockedStmt = db.prepare('SELECT 1 FROM social_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)')
  const blocked = (a, b) => Boolean(blockedStmt.get(a, b, b, a))
  const contact = db.prepare('SELECT * FROM contacts WHERE first_id=? AND second_id=?')
  const connected = (a, b) => contact.get(...[a, b].sort())?.state === 'accepted' && !blocked(a, b)
  const person = db.prepare(`
    SELECT p.*,u.full_name,u.avatar_emoji FROM social_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?
  `)
  const activePeople = db.prepare("SELECT CASE WHEN first_id=? THEN second_id ELSE first_id END AS id FROM contacts WHERE state='accepted' AND (first_id=? OR second_id=?)")
  const friends = (userId) => activePeople.all(userId, userId, userId).map(({ id }) => id)
  const safeIdentity = (viewer, userId) => {
    if (blocked(viewer, userId)) return null
    const row = person.get(userId)
    return row && { id: userId, username: row.username, displayName: row.full_name, avatar: row.avatar_emoji }
  }
  function profile(viewer, userId) {
    const row = person.get(userId)
    const identity = safeIdentity(viewer, userId)
    if (!identity) return null
    const self = viewer === userId
    const allowed = self || row.visibility === 'public' || (row.visibility === 'friends' && connected(viewer, userId))
    if (!allowed && !row.discoverable && !connected(viewer, userId)) return null
    const progression = allowed ? game.snapshot(userId) : null
    const achievements = allowed && (self || row.show_awards) ? db.prepare(
      'SELECT caption AS title FROM social_posts WHERE user_id=? ORDER BY published_at DESC LIMIT 20'
    ).all(userId) : []
    return {
      ...identity, ...(allowed && { bio: row.bio, level: progression.level }),
      ...((self || (allowed && row.show_xp)) && { xp: progression.xp }), achievements,
      ...(self && { visibility: row.visibility, discoverable: Boolean(row.discoverable), showXp: Boolean(row.show_xp), showAwards: Boolean(row.show_awards) }),
    }
  }

  const limits = new Map()
  function limit(req, _res, next) {
    const now = Date.now()
    if (limits.size >= 1000) {
      for (const [key, value] of limits) if (value.until <= now) limits.delete(key)
      if (limits.size >= 1000 && !limits.has(req.userId)) return reject('Social requests are busy. Try again soon.', 429)
    }
    let entry = limits.get(req.userId)
    if (!entry || entry.until <= now) {
      entry = { until: now + 60000, count: 0 }
      limits.set(req.userId, entry)
    }
    if (++entry.count > 60) return reject('Too many social requests. Try again in a minute.', 429)
    next()
  }
  const route = (method, path, handler, limited = method !== 'get') => {
    app[method]('/api/social' + path, requireUser, ...(limited ? [limit] : []), handler)
  }

  route('get', '/profile', (req, res) => res.json({ profile: profile(req.userId, req.userId) || null }))
  route('put', '/profile', (req, res) => {
    const { username, bio, visibility, discoverable, showXp, showAwards } = req.body || {}
    if (typeof username !== 'string' || !/^[a-z0-9_]{3,24}$/.test(username)) throw invalid('Use 3–24 lowercase letters, numbers or underscores for your username.')
    if (!['private','friends','public'].includes(visibility) || ![discoverable, showXp, showAwards].every((value) => typeof value === 'boolean')) throw invalid('Choose valid privacy settings.')
    const note = requireText(bio, 220, 'bio', true)
    const result = db.prepare('SELECT user_id FROM social_profiles WHERE username=?').get(username)
    if (result && result.user_id !== req.userId) return reject('That username is already taken.', 409)
    db.prepare(`
      INSERT INTO social_profiles VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
      username=excluded.username,bio=excluded.bio,visibility=excluded.visibility,discoverable=excluded.discoverable,
      show_xp=excluded.show_xp,show_awards=excluded.show_awards
    `).run(req.userId, username, note, visibility, Number(discoverable), Number(showXp), Number(showAwards))
    res.json({ profile: profile(req.userId, req.userId) })
  })
  route('get', '/search', (req, res) => {
    const prefix = req.query.username
    if (typeof prefix !== 'string' || !/^[a-z0-9_]{2,24}$/.test(prefix)) throw invalid('Enter at least two username characters.')
    const rows = db.prepare(`
      SELECT user_id FROM social_profiles p WHERE discoverable=1 AND user_id<>? AND substr(username,1,length(?))=?
      AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker=? AND b.blocked=p.user_id) OR (b.blocked=? AND b.blocker=p.user_id))
      ORDER BY username LIMIT 20
    `).all(req.userId, prefix, prefix, req.userId, req.userId)
    res.json({ people: rows.map(({ user_id }) => profile(req.userId, user_id)).filter(Boolean) })
  }, true)
  route('get', '/profiles/:id', (req, res) => {
    const result = profile(req.userId, req.params.id)
    if (!result) return reject('Profile unavailable.', 404)
    res.json({ profile: result })
  })
  route('get', '/friends', (req, res) => {
    const rows = db.prepare('SELECT * FROM contacts WHERE first_id=? OR second_id=?').all(req.userId, req.userId)
    const blockedRows = db.prepare('SELECT blocked FROM social_blocks WHERE blocker=?').all(req.userId)
    res.json({
      contacts: rows.flatMap((row) => {
        const other = row.first_id === req.userId ? row.second_id : row.first_id
        const identity = safeIdentity(req.userId, other)
        return identity ? [{ ...identity, state: row.state, outgoing: row.requested_by === req.userId }] : []
      }),
      blocks: blockedRows.map(({ blocked: other }) => ({ id: other, username: person.get(other)?.username || 'Unavailable' })),
    })
  })
  route('post', '/friends/:id', (req, res) => {
    const target = req.params.id
    if (target === req.userId || !person.get(req.userId) || !profile(req.userId, target)) return reject('This account cannot receive a request.', 404)
    const [a,b] = [req.userId,target].sort()
    const result = db.prepare("INSERT INTO contacts VALUES (?,?,?,'pending') ON CONFLICT DO NOTHING").run(a,b,req.userId)
    if (!result.changes) return reject('A request or friendship already exists.', 409)
    res.status(201).json({ ok: true })
  })
  route('patch', '/friends/:id', (req, res) => {
    const pair = [req.userId,req.params.id].sort()
    const existing = contact.get(...pair)
    if (!existing || existing.state !== 'pending' || existing.requested_by === req.userId || blocked(...pair)) return reject('Incoming request unavailable.', 404)
    if (req.body?.accept === true) db.prepare("UPDATE contacts SET state='accepted' WHERE first_id=? AND second_id=?").run(...pair)
    else if (req.body?.accept === false) db.prepare('DELETE FROM contacts WHERE first_id=? AND second_id=?').run(...pair)
    else throw invalid('Choose whether to accept.')
    res.status(204).end()
  })
  route('delete', '/friends/:id', (req, res) => {
    const pair = [req.userId,req.params.id].sort()
    const existing = contact.get(...pair)
    if (!existing || (existing.state === 'pending' && existing.requested_by !== req.userId)) return reject('Relationship unavailable.', 404)
    db.prepare('DELETE FROM contacts WHERE first_id=? AND second_id=?').run(...pair)
    res.status(204).end()
  })
  route('put', '/blocks/:id', (req, res) => {
    const other = req.params.id
    if (other === req.userId || !person.get(other)) return reject('Account unavailable.', 404)
    db.transaction(() => {
      db.prepare('INSERT INTO social_blocks VALUES (?,?) ON CONFLICT DO NOTHING').run(req.userId,other)
      db.prepare('DELETE FROM contacts WHERE first_id=? AND second_id=?').run(...[req.userId,other].sort())
      db.prepare("DELETE FROM challenge_members WHERE state='invited' AND ((user_id=? AND challenge_id IN (SELECT id FROM challenges WHERE owner_id=?)) OR (user_id=? AND challenge_id IN (SELECT id FROM challenges WHERE owner_id=?)))").run(req.userId,other,other,req.userId)
      db.prepare("DELETE FROM group_members WHERE state='invited' AND ((user_id=? AND invited_by=?) OR (user_id=? AND invited_by=?))").run(req.userId,other,other,req.userId)
      db.prepare('DELETE FROM social_reactions WHERE (user_id=? AND post_id IN (SELECT id FROM social_posts WHERE user_id=?)) OR (user_id=? AND post_id IN (SELECT id FROM social_posts WHERE user_id=?))').run(req.userId,other,other,req.userId)
    })()
    res.status(204).end()
  })
  route('delete', '/blocks/:id', (req, res) => {
    db.prepare('DELETE FROM social_blocks WHERE blocker=? AND blocked=?').run(req.userId,req.params.id)
    res.status(204).end()
  })

  const member = db.prepare('SELECT * FROM group_members WHERE group_id=? AND user_id=?')
  const groupRows = db.prepare("SELECT * FROM group_members WHERE group_id=? AND state='active'")
  function inGroup(groupId, userId) {
    return member.get(groupId, userId)?.state === 'active'
  }
  function allowedGroup(groupId, userId, manage = false) {
    const row = member.get(groupId, userId)
    if (row?.state !== 'active' || (manage && row.role === 'member')) return reject('Group unavailable.', 404)
    return row
  }
  route('get', '/groups', (req, res) => {
    const groups = db.prepare(`
      SELECT g.id,g.name,g.description,m.role,m.state,m.invited_by FROM group_members m
      JOIN accountability_groups g ON g.id=m.group_id WHERE m.user_id=? ORDER BY g.name
    `).all(req.userId)
    res.json({ groups: groups.filter((group) => group.state === 'active' || (inGroup(group.id,group.invited_by) && connected(req.userId,group.invited_by))).map(({ invited_by, ...group }) => group) })
  })
  route('post', '/groups', (req, res) => {
    if (!person.get(req.userId)) return reject('Create a social profile first.')
    const groupId = id()
    const name = requireText(req.body?.name, 80, 'group name')
    const description = requireText(req.body?.description ?? '', 500, 'description', true)
    db.transaction(() => {
      db.prepare('INSERT INTO accountability_groups VALUES (?,?,?,?)').run(groupId,req.userId,name,description)
      db.prepare("INSERT INTO group_members VALUES (?,?,NULL,'owner','active')").run(groupId,req.userId)
    })()
    res.status(201).json({ id: groupId })
  })
  route('get', '/groups/:id', (req, res) => {
    const groupId = req.params.id
    const own = allowedGroup(groupId,req.userId)
    const group = db.prepare('SELECT id,name,description FROM accountability_groups WHERE id=?').get(groupId)
    const rows = own.role === 'member' ? groupRows.all(groupId) : db.prepare('SELECT * FROM group_members WHERE group_id=?').all(groupId)
    const members = rows.flatMap((row) => {
      const identity = safeIdentity(req.userId,row.user_id)
      return identity ? [{ ...identity, role: row.role, state: row.state }] : []
    })
    res.json({ group: { ...group, role: own.role, members } })
  })
  route('patch', '/groups/:id', (req, res) => {
    allowedGroup(req.params.id,req.userId,true)
    const name = requireText(req.body?.name,80,'group name')
    const description = requireText(req.body?.description ?? '',500,'description',true)
    db.prepare('UPDATE accountability_groups SET name=?,description=? WHERE id=?').run(name,description,req.params.id)
    res.status(204).end()
  })
  route('post', '/groups/:id/invite/:other', (req, res) => {
    allowedGroup(req.params.id,req.userId,true)
    if (!connected(req.userId,req.params.other)) return reject('Invite an existing friend.')
    const result = db.prepare("INSERT INTO group_members VALUES (?,?,?,'member','invited') ON CONFLICT DO NOTHING").run(req.params.id,req.params.other,req.userId)
    if (!result.changes) return reject('This account already has a membership or invitation.',409)
    res.status(201).json({ ok: true })
  })
  route('patch', '/groups/:id/invitation', (req, res) => {
    const row = member.get(req.params.id,req.userId)
    if (row?.state !== 'invited' || !inGroup(req.params.id,row.invited_by) || !connected(req.userId,row.invited_by)) return reject('Invitation unavailable.',404)
    if (req.body?.accept === true) db.prepare("UPDATE group_members SET state='active' WHERE group_id=? AND user_id=?").run(req.params.id,req.userId)
    else if (req.body?.accept === false) db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(req.params.id,req.userId)
    else throw invalid('Choose whether to accept.')
    res.status(204).end()
  })
  route('patch', '/groups/:id/members/:other', (req, res) => {
    const own = allowedGroup(req.params.id,req.userId,true)
    const target = member.get(req.params.id,req.params.other)
    if (own.role !== 'owner' || target?.state !== 'active' || target.role === 'owner' || blocked(req.userId,req.params.other)) return reject('Only the owner can change this role.')
    if (!['admin','member'].includes(req.body?.role)) throw invalid('Choose a valid role.')
    db.prepare('UPDATE group_members SET role=? WHERE group_id=? AND user_id=?').run(req.body.role,req.params.id,req.params.other)
    res.status(204).end()
  })
  route('delete', '/groups/:id/members/:other', (req, res) => {
    const own = allowedGroup(req.params.id,req.userId)
    const target = member.get(req.params.id,req.params.other)
    if (!target || target.role === 'owner' || (req.userId !== target.user_id &&
        (blocked(req.userId,target.user_id) || !(own.role === 'owner' || (own.role === 'admin' && target.role === 'member'))))) return reject('This member cannot be removed.')
    db.transaction(() => {
      db.prepare('DELETE FROM challenge_members WHERE user_id=? AND challenge_id IN (SELECT id FROM challenges WHERE group_id=?)').run(req.params.other,req.params.id)
      db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(req.params.id,req.params.other)
    })()
    res.status(204).end()
  })
  route('delete', '/groups/:id', (req, res) => {
    if (allowedGroup(req.params.id,req.userId,true).role !== 'owner') return reject('Only the group owner can delete this group.')
    db.prepare('DELETE FROM accountability_groups WHERE id=?').run(req.params.id)
    res.status(204).end()
  })

  const emojis = ['❤️','🔥','👏','🎉']
  const postById = db.prepare('SELECT * FROM social_posts WHERE id=?')
  const reactionRows = db.prepare('SELECT user_id,emoji FROM social_reactions WHERE post_id=?')
  const visiblePost = (viewer, post) => Boolean(post && (post.user_id === viewer ||
    (person.get(post.user_id)?.show_awards && person.get(post.user_id)?.visibility !== 'private' && connected(viewer,post.user_id))))
  route('get', '/feed', (req, res) => {
    const posts = db.prepare(`
      SELECT p.* FROM social_posts p WHERE p.user_id=? OR EXISTS (
        SELECT 1 FROM contacts c JOIN social_profiles s ON s.user_id=p.user_id
        WHERE c.state='accepted' AND s.show_awards=1 AND s.visibility<>'private'
        AND ((c.first_id=? AND c.second_id=p.user_id) OR (c.second_id=? AND c.first_id=p.user_id))
      ) ORDER BY published_at DESC LIMIT 60
    `).all(req.userId,req.userId,req.userId)
    res.json({ posts: posts.filter((post) => visiblePost(req.userId,post)).map((post) => {
      const reactions = reactionRows.all(post.id).filter(({ user_id }) => !blocked(req.userId,user_id))
      return { id: post.id, author: safeIdentity(req.userId,post.user_id), caption: post.caption, publishedAt: post.published_at,
        reactions: Object.fromEntries(emojis.map((emoji) => [emoji,reactions.filter((row) => row.emoji === emoji).length])),
        ownReaction: reactions.find((row) => row.user_id === req.userId)?.emoji || null }
    }) })
  })
  route('post', '/feed', (req, res) => {
    const own = person.get(req.userId)
    if (!own?.show_awards || own.visibility === 'private') return reject('Enable achievements for friends or public visibility first.')
    const { kind, subjectId } = req.body || {}
    if (typeof kind !== 'string' || typeof subjectId !== 'string' || kind.length > 80 || subjectId.length > 160) throw invalid('Choose an earned achievement.')
    const earned = db.prepare('SELECT * FROM milestones WHERE user_id=? AND kind=? AND subject_id=?').get(req.userId,kind,subjectId)
    if (!earned) return reject('Achievement unavailable.',404)
    // Never publish the stored title. It may contain a private habit or goal name.
    const caption = publicCaption(earned)
    const result = db.prepare('INSERT INTO social_posts VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,kind,subject_id) DO NOTHING')
      .run(id(),req.userId,kind,subjectId,caption,new Date().toISOString())
    res.status(result.changes ? 201 : 200).json({ caption })
  })
  route('delete', '/feed/:id', (req, res) => {
    db.prepare('DELETE FROM social_posts WHERE id=? AND user_id=?').run(req.params.id,req.userId)
    res.status(204).end()
  })
  route('put', '/feed/:id/reaction', (req, res) => {
    const post = postById.get(req.params.id)
    if (!visiblePost(req.userId,post) || post.user_id === req.userId) return reject('Post unavailable.',404)
    const emoji = req.body?.emoji
    if (emoji === null) db.prepare('DELETE FROM social_reactions WHERE post_id=? AND user_id=?').run(post.id,req.userId)
    else {
      if (!emojis.includes(emoji)) throw invalid('Choose a supported reaction.')
      db.prepare('INSERT INTO social_reactions VALUES (?,?,?) ON CONFLICT(post_id,user_id) DO UPDATE SET emoji=excluded.emoji').run(post.id,req.userId,emoji)
    }
    res.status(204).end()
  })

  route('get', '/leaderboard', (req, res) => {
    const today = localToday(req.query.timeZone)
    const period = req.query.period ?? 'week'
    if (!['week','month'].includes(period)) throw invalid('Choose week or month.')
    const { calendarPeriod } = require('../web/src/lib/progress.js')
    const start = calendarPeriod(today,period)[0]
    const groupId = req.query.group
    if (groupId !== undefined && typeof groupId !== 'string') throw invalid('Choose a valid group.')
    if (groupId) allowedGroup(groupId,req.userId)
    const peers = groupId ? groupRows.all(groupId).map(({ user_id }) => user_id) : [req.userId,...friends(req.userId)]
    const score = db.prepare(`
      SELECT COALESCE(SUM(MIN(daily,100)),0) AS xp FROM (
        SELECT SUM(amount) AS daily FROM xp_events WHERE user_id=? AND day BETWEEN ? AND ? GROUP BY day
      )
    `)
    const ranks = peers.flatMap((userId) => {
      const identity = safeIdentity(req.userId,userId)
      const privacy = person.get(userId)
      if (!identity || (userId !== req.userId && (!privacy.show_xp || privacy.visibility === 'private' ||
          (privacy.visibility === 'friends' && !connected(req.userId,userId))))) return []
      return [{ ...identity, xp: score.get(userId,start,today).xp }]
    })
    res.json({ start, end: today, ranks: rank(ranks,'xp') })
  })

  return { route, blocked, connected, person, safeIdentity, inGroup, allowedGroup, requireText, reject }
}

function publicCaption(earned) {
  if (earned.kind === 'goal-target') return 'Reached a personal goal.'
  if (earned.kind === 'challenge-complete') return 'Completed a challenge.'
  if (/^streak-\d+$/.test(earned.kind)) return 'Reached a ' + earned.kind.split('-')[1] + '-occurrence streak.'
  if (earned.kind === 'level' && /^\d+$/.test(earned.subject_id)) return 'Reached level ' + earned.subject_id + '.'
  if (earned.kind === 'tracked-completions' && /^\d+$/.test(earned.subject_id)) return 'Logged ' + earned.subject_id + ' tracked habit completions.'
  return 'Earned a Habitline achievement.'
}

function rank(rows, metric) {
  let position = 0
  let previous
  return rows.sort((a,b) => b[metric] - a[metric] || a.username.localeCompare(b.username)).map((row) => {
    if (row[metric] !== previous) position++
    previous = row[metric]
    return { ...row, rank: position }
  })
}

module.exports.rank = rank
