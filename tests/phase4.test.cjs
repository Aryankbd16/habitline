const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { copyFileSync, mkdtempSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const Database = require('better-sqlite3')

test('Phase 4 migration, XP, challenges, privacy and two-account social workflows', { timeout: 30000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'habitline-phase4-'))
  const databasePath = join(directory, 'audit.db')
  copyFileSync('data/habit_tracker.db.before-phase4.bak', databasePath)
  let server, origin, cookie, thirdCookie
  let stderr = ''
  const tables = ['users','habits','completions','sessions','habit_relationships','settings','goals','goal_habits','milestones']
  function inspect() {
    const db = new Database(databasePath, { readonly: true })
    try {
      assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
      assert.deepEqual(db.pragma('foreign_key_check'), [])
      return Object.fromEntries(tables.map((name) => [name, db.prepare('SELECT * FROM ' + name + ' ORDER BY rowid').all()]))
    } finally { db.close() }
  }
  async function start() {
    server = spawn(process.execPath, ['server/index.cjs'], {
      env: { ...process.env, DATABASE_PATH: databasePath, DATA_DIR: directory, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0' },
    })
    server.stderr.on('data', (chunk) => { stderr += chunk })
    const [line] = await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(([code]) => { throw Error('API exited ' + code + ': ' + stderr) })])
    origin = line.toString().match(/http:\/\/localhost:\d+/)[0].replace('localhost','127.0.0.1')
  }
  async function stop() {
    if (!server || server.exitCode !== null || server.signalCode !== null) return
    const done = once(server, 'exit')
    server.kill()
    await done
  }
  async function send(path, status, method = 'GET', body, session = cookie) {
    const response = await fetch(origin + '/api' + path, {
      method, headers: { 'X-Habitline-Request': '1', ...(session && { cookie: session }), ...(body && { 'Content-Type':'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
    })
    const payload = response.status === 204 ? null : await response.json()
    assert.equal(response.status, status, path + ' ' + JSON.stringify(payload) + ' ' + stderr)
    return { ...payload, session: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const social = (path, status, method, body, session) => send('/social' + path, status, method, body, session)
  const signup = (name) => send('/auth/signup',201,'POST',{ fullName: name,email: name + '@phase4.invalid',password: 'test password' },null)
  const today = new Date().toISOString().slice(0,10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10)
  const dateAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0,10)
  const newHabit = (name,startDate,xpValue,session) => send('/habits',201,'POST',{ habit: { name,startDate,xpValue,points: 17 } },session)
  const complete = (habitId, completed, session, status = 200) => send('/completions',status,'PUT',{ habitId,date:today,completed },session)
  const saveProfile = (username, session, fields = {}) => social('/profile',200,'PUT',{
    username,bio:'Private bio',visibility:'private',discoverable:false,showXp:false,showAwards:false,...fields,
  },session)
  try {
    const baseline = inspect()
    await start()
    const migrated = inspect()
    assert.deepEqual(migrated.habits.map(({ xp_value, ...habit }) => ({ ...habit })), baseline.habits)
    assert.ok(migrated.habits.every(({ xp_value }) => xp_value === 10))
    for (const table of tables.filter((item) => item !== 'habits')) assert.deepEqual(migrated[table],baseline[table])
    await send('/game',401,'GET',undefined,null)
    await social('/search?username=al',401,'GET',undefined,'habitline_session=dead')
    const a = await signup('Alpha')
    const b = await signup('Beta')
    const c = await signup('Gamma')
    cookie = a.session
    thirdCookie = c.session
    const other = b.session
    const aId = a.user.id
    const bId = b.user.id
    await saveProfile('alpha',cookie,{ visibility:'friends',discoverable:true,showXp:true,showAwards:true })
    await saveProfile('beta',other)
    await saveProfile('gamma',thirdCookie,{ visibility:'public',discoverable:true,showXp:true })
    assert.deepEqual((await social('/search?username=be',200)).people,[])
    await social('/profiles/' + bId,404)
    await saveProfile('beta',other,{ discoverable:true })
    const found = (await social('/search?username=be',200)).people[0]
    assert.equal(found.username,'beta')
    for (const key of ['email','password_hash','xp','level','bio']) assert.ok(!(key in found))
    await social('/profile',409,'PUT',{ username:'beta',bio:'',visibility:'private',discoverable:false,showXp:false,showAwards:false })
    await social('/friends/' + aId,404,'POST')
    await social('/friends/' + bId,201,'POST')
    await social('/friends/' + bId,409,'POST')
    await social('/friends/' + bId,404,'PATCH',{ accept:true })
    await social('/friends/' + aId,204,'PATCH',{ accept:false },other)
    await social('/friends/' + bId,201,'POST')
    await social('/friends/' + bId,204,'DELETE')
    await social('/friends/' + bId,201,'POST')
    await social('/friends/' + aId,204,'PATCH',{ accept:true },other)
    assert.equal((await social('/friends',200)).contacts[0].state,'accepted')
    await saveProfile('beta',other,{ visibility:'friends',discoverable:true,showXp:true,showAwards:true })

    const { habit } = await newHabit('Private alpha habit',dateAgo(3),100)
    const second = (await newHabit('Second alpha habit',today,25)).habit
    const theirHabit = (await newHabit('Private beta habit',today,25,other)).habit
    const personalData = { title:'Two-habit personal challenge',startDate:today,endDate:today,target:2,habitIds:[habit.id,habit.id,second.id] }
    const personal = (await social('/challenges',201,'POST',personalData)).challenge
    const personalPath = '/challenges/' + personal.id
    assert.equal(personal.habitIds.length,2)
    await social(personalPath,404,'PATCH',{ title:'Unauthorized' },other)
    await social('/challenges',400,'POST',{ ...personalData,habitIds:[theirHabit.id] })
    await social('/challenges',400,'POST',{ ...personalData,startDate:tomorrow })
    await complete(habit.id,true,other,404)
    await send('/data/import',200,'POST',{ habits:[habit],completions:[{ habitId:habit.id,date:dateAgo(2) },{ habitId:habit.id,date:dateAgo(1) }] })
    assert.equal((await send('/game',200)).xp,0)
    const responses = await Promise.all([complete(habit.id,true),complete(habit.id,true)])
    assert.ok(responses.some(({ awards }) => awards.some(({ title }) => title === 'Level 2')))
    assert.equal(responses[0].completion.pointsEarned,17)
    let game = await send('/game',200)
    assert.equal(game.xp,100)
    assert.equal(game.level,2)
    assert.equal(game.nextLevelAt,300)
    assert.equal(game.achievements.filter(({ kind }) => kind === 'streak-3').length,1)
    assert.equal(game.activity.length,1)
    await complete(second.id,true)
    const getChallenge = async (challengeId, session) => (await social('/challenges',200,'GET',undefined,session)).challenges.find(({ id }) => id === challengeId)
    assert.equal((await getChallenge(personal.id)).value,2)
    await complete(second.id,false)
    await complete(second.id,false)
    assert.equal((await getChallenge(personal.id)).value,1)
    assert.equal((await send('/game',200)).xp,100)
    await social(personalPath,200,'PATCH',{ title:'Edited personal challenge',archived:true })
    assert.equal((await getChallenge(personal.id)).archivedOn,today)
    await social(personalPath,200,'PATCH',{ archived:false })
    await complete(habit.id,false)
    assert.equal((await send('/game',200)).level,1)
    await send('/habits/' + habit.id,200,'PATCH',{ changes:{ xpValue:1 } })
    await complete(habit.id,true)
    game = await send('/game',200)
    assert.equal(game.xp,100)
    assert.equal(game.achievements.filter(({ kind }) => kind === 'level').length,1)
    assert.equal(game.achievements.filter(({ kind }) => kind === 'challenge-complete').length,1)

    const group = (await social('/groups',201,'POST',{ name:'Private practice group' })).id
    await social('/groups/' + group,404,'GET',undefined,thirdCookie)
    await social('/groups/' + group + '/invite/' + bId,201,'POST')
    await social('/groups/' + group,404,'GET',undefined,other)
    await social('/groups/' + group + '/invitation',204,'PATCH',{ accept:true },other)
    await social('/groups/' + group,404,'PATCH',{ name:'Unauthorized' },other)
    await social('/groups/' + group + '/members/' + bId,204,'PATCH',{ role:'admin' })
    await social('/groups/' + group,204,'PATCH',{ name:'Edited private practice group' },other)
    await social('/groups/' + group,403,'DELETE',undefined,other)

    const challenge = (await social('/challenges',201,'POST',{
      title:'Shared practice',scope:'group',groupId:group,mode:'streak',target:1,startDate:today,endDate:today,habitIds:[habit.id],
    })).challenge
    const challengePath = '/challenges/' + challenge.id
    await social(challengePath + '/invite/' + c.user.id,403,'POST')
    await social(challengePath + '/invite/' + bId,201,'POST')
    await social(challengePath + '/invite/' + bId,409,'POST')
    await social(challengePath + '/join',400,'PATCH',{ accept:true,habitIds:[habit.id] },other)
    await social(challengePath + '/join',204,'PATCH',{ accept:true,habitIds:[theirHabit.id] },other)
    assert.ok((await send('/game',200,'GET',undefined,other)).achievements.some(({ kind }) => kind === 'group-participation'))
    await send('/data/import',200,'POST',{ habits:[theirHabit],completions:[{ habitId:theirHabit.id,date:today }] },other)
    assert.equal((await getChallenge(challenge.id,other)).value,0)
    await complete(theirHabit.id,false,other)
    await complete(theirHabit.id,true,other)
    const ranked = await getChallenge(challenge.id,other)
    assert.deepEqual(ranked.ranks.map(({ rank,value }) => [rank,value]),[[1,1],[1,1]])
    assert.ok(ranked.ranks.every((person) => !('habitIds' in person)))
    assert.equal(await getChallenge(challenge.id,thirdCookie),undefined)
    assert.deepEqual((await social('/leaderboard?period=week',200)).ranks.map(({ xp }) => xp),[100,25])
    assert.deepEqual((await social('/leaderboard?period=month&group=' + group,200)).ranks.map(({ xp }) => xp),[100,25])
    await social('/leaderboard?period=week&group=' + group,404,'GET',undefined,thirdCookie)
    const friendsChallenge = (await social('/challenges',201,'POST',{ ...personalData,scope:'friends' })).challenge
    const friendsPath = '/challenges/' + friendsChallenge.id
    await social(friendsPath + '/invite/' + bId,201,'POST',{ target:1 })
    await social(friendsPath + '/join',204,'PATCH',{ accept:true,habits:[],habitIds:[theirHabit.id] },other)
    const individual = await getChallenge(friendsChallenge.id,other)
    assert.equal(individual.target,1)
    assert.equal(individual.complete,true)
    assert.equal((await getChallenge(friendsChallenge.id)).target,2)
    await social('/feed',404,'POST',{ kind:'level',subjectId:'999' })
    await social('/feed',201,'POST',{ kind:'streak-3',subjectId:habit.id })
    await social('/feed',200,'POST',{ kind:'streak-3',subjectId:habit.id })
    const post = (await social('/feed',200,'GET',undefined,other)).posts[0]
    assert.match(post.caption,/3-occurrence/)
    assert.ok(!JSON.stringify(post).includes('Private alpha habit'))
    assert.deepEqual((await social('/feed',200,'GET',undefined,thirdCookie)).posts,[])
    await social('/feed/' + post.id + '/reaction',404,'PUT',{ emoji:'🔥' },thirdCookie)
    await social('/feed/' + post.id + '/reaction',204,'PUT',{ emoji:'🔥' },other)
    await social('/feed/' + post.id + '/reaction',204,'PUT',{ emoji:'🔥' },other)
    assert.equal((await social('/feed',200)).posts[0].reactions['🔥'],1)
    await social('/blocks/' + bId,204,'PUT')
    await social('/profiles/' + aId,404,'GET',undefined,other)
    await social('/friends/' + aId,404,'POST',undefined,other)
    await social('/feed/' + post.id + '/reaction',404,'PUT',{ emoji:'🔥' },other)
    assert.equal(await getChallenge(challenge.id,other),undefined)
    assert.ok(!(await social('/groups/' + group,200,'GET',undefined,other)).group.members.some(({ id }) => id === aId))
    await social('/blocks/' + bId,204,'DELETE')
    assert.deepEqual((await social('/friends',200)).contacts,[])
    await social('/groups/' + group + '/members/' + bId,204,'DELETE',undefined,other)
    assert.equal(await getChallenge(challenge.id,other),undefined)
    assert.ok((await send('/game',200,'GET',undefined,other)).achievements.some(({ kind }) => kind === 'group-participation'))
    await stop()
    await start()
    assert.equal((await send('/game',200)).xp,100)
    assert.equal((await getChallenge(personal.id)).title,'Edited personal challenge')
    inspect()
    await send('/habits/' + habit.id,204,'DELETE')
    assert.equal((await send('/game',200)).xp,0)
    assert.ok((await send('/game',200)).achievements.some(({ kind }) => kind === 'streak-3'))
    inspect()
  } finally {
    await stop()
    rmSync(directory,{ force:true,recursive:true })
  }
})
