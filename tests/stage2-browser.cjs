const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { once } = require('node:events')
const { stripVTControlCharacters } = require('node:util')

const work = mkdtempSync(join(tmpdir(), 'habitline-browser-'))
const children = []
const errors = []
const start = (exe, args, options = {}) => {
  const process = spawn(exe, args, { ...options, windowsHide: true })
  children.push(process)
  process.on('error', (error) => errors.push(error.message))
  process.stderr.on('data', (chunk) => errors.push(chunk.toString()))
  return process
}

async function waitFor(check, label) {
  const deadline = Date.now() + 20000
  do {
    try {
      const result = await check()
      if (result) return result
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  } while (Date.now() < deadline)
  throw new Error('Timed out waiting for ' + label)
}

async function main() {
  const server = start(process.execPath, ['server/index.cjs'], {
    env: { ...process.env, PORT: '0', DATA_DIR: work, DATABASE_PATH: join(work, 'browser.db'), NODE_ENV: 'test' },
  })
  const [stdout] = await once(server.stdout, 'data')
  const backend = stdout.toString().match(/http:\/\/localhost:\d+/)[0].replace('localhost', '127.0.0.1')
  const web = start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '0'], {
    cwd: 'web', env: { ...process.env, HABITLINE_API_TARGET: backend },
  })
  let output = ''
  web.stdout.on('data', (chunk) => { output += chunk })
  const site = await waitFor(() => stripVTControlCharacters(output).match(/https:\/\/127\.0\.0\.1:\d+/)?.[0], 'Vite startup')
  const edge = process.env.EDGE_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  start(edge, ['--headless=new', '--ignore-certificate-errors', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + work, 'about:blank'])
  const debugPort = await waitFor(() => readFileSync(join(work, 'DevToolsActivePort'), 'utf8').split('\n')[0], 'Edge startup')
  const tabs = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()
  const socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  let sequence = 0
  const pending = new Map()
  const exceptions = []
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description)
    if (!pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(message.error)
    else resolve(message.result)
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description)
    return result.result.value
  }
  const evaluateFn = (fn, ...args) => evaluate('(' + fn + ')(' + args.map((arg) => JSON.stringify(arg)).join(',') + ')')
  const appear = (text) => waitFor(() => evaluateFn((text) => document.body?.innerText.toLowerCase().includes(text.toLowerCase()), text), text)
  const click = (text, selector = 'button, a') => waitFor(() => evaluateFn((text, selector) => {
    const node = [...document.querySelectorAll(selector)].find((item) =>
      (item.getAttribute('aria-label') === text || item.innerText.trim() === text) && item.getClientRects().length && !item.disabled)
    if (!node) return false
    node.click()
    return true
  }, text, selector), 'click ' + text)
  const fill = (selector, value) => waitFor(() => evaluateFn((selector, value) => {
    const node = document.querySelector(selector)
    if (!node) return false
    Object.getOwnPropertyDescriptor(node.constructor.prototype, 'value').set.call(node, value)
    node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    return true
  }, selector, value), 'fill ' + selector)
  try {
    await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await call('Page.navigate', { url: site })
    await appear('Welcome back')
    assert.deepEqual(await evaluate("(async () => { const r = await fetch('/api/goals'); return [r.status, r.headers.get('content-type').includes('application/json')] })()"), [401, true])
    await click('Create an account')
    await fill('input[autocomplete=name]', 'Browser Tester')
    await fill('input[type=email]', 'browser@example.invalid')
    await fill('input[type=password]', 'bad')
    await fill('label:nth-of-type(4) input', 'bad')
    await click('Continue to Setup')
    await appear('Enter a password of at least 6 characters')
    await fill('input[type=password]', 'browser password')
    await fill('label:nth-of-type(4) input', 'browser password')
    await click('Continue to Setup')
    await appear('Personalize your dashboard')
    await fill('input[type=text]', 'Computer Engineering Student')
    await click('Finish Setup')
    await appear("Nothing scheduled today")
    const create = async (name, category) => {
      await click('New habit')
      await fill('input[placeholder*="Meditation"]', name)
      await fill('input[list]', category)
      await fill('input[type=number]', '12')
      if (name === 'Make a Prototype') await fill('input[max="100"]', '100')
      await click('Create habit')
      await appear(name)
    }
    await create('Practice Algorithms', 'DSA')
    await appear('DSA Practice')
    await create('Make a Prototype', 'Studio Work')
    await appear('Studio Work')
    await evaluate(`(() => {
      const original = window.fetch
      window.completionWrites = 0
      window.fetch = (url, options) => {
        if (url === '/api/completions' && options?.method === 'PUT') window.completionWrites++
        return original(url, options)
      }
    })()`)
    await waitFor(() => evaluate(`(() => {
      const button = document.querySelector('[aria-label="Mark Practice Algorithms as done"]')
      if (!button || button.disabled) return false
      button.click()
      button.click()
      return true
    })()`), 'click completion twice')
    await appear('1/2')
    assert.equal(await evaluate('window.completionWrites'), 1)
    const completed = await evaluate(`(async () => {
      const { habits } = await (await fetch('/api/habits')).json()
      const { completions } = await (await fetch('/api/completions')).json()
      const habit = habits.find(({ name }) => name === 'Practice Algorithms')
      const date = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      return { valid: completions.length === 1 && completions[0].habitId === habit.id && completions[0].date === date, points: completions[0]?.pointsEarned }
    })()`)
    assert.deepEqual(completed, { valid: true, points: 12 })
    await click('Manage relationships for Practice Algorithms')
    await appear('Connect to')
    const target = await evaluate("document.querySelector('select option:nth-child(2)').value")
    await fill('select', target)
    await click('Add relationship')

    await click('Remove relationship with Make a Prototype')
    await click('Close', 'button')
    await click('Edit Practice Algorithms')
    await fill('input[placeholder*="Meditation"]', 'Review Algorithms')
    await click('Save changes')
    await appear('Review Algorithms')
    await call('Page.reload')
    await appear('1/2')
    await click('Calendar', 'a')
    await appear('1 of 2 done')
    await click('Previous month')
    await click('Next month')
    await click('Analytics', 'a')
    await appear('Daily Completion & Focus')
    await appear('Monthly rate')
    await click('Previous week')
    await click('Next week')
    await fill('select', await evaluate("document.querySelector('select option:nth-child(2)').value"))
    await appear('Habit consistency')
    await fill('label:nth-of-type(2) select', 'month')
    await click('Previous month')
    await click('Next month')
    await click('Goals', 'a')
    await click('New goal')
    await fill('input[maxlength="120"]', 'Reach one practice')
    await fill('input[type=number]', '1')
    await waitFor(() => evaluate("document.querySelector('input[type=checkbox]')?.click(); !!document.querySelector('input[type=checkbox]')"), 'select linked habit')
    await click('Save goal')
    await appear('1 / 1 completions')
    await call('Page.reload')
    await appear('1 / 1 completions')
    await click('Edit goal')
    await fill('input[maxlength="120"]', 'Practice milestone')
    await click('Save goal')
    await appear('Practice milestone')
    await click('Archive goal')
    await appear('Archived')
    await click('Restore goal')
    await call('Page.enable')
    socket.addEventListener('message', (event) => {
      if (JSON.parse(event.data).method === 'Page.javascriptDialogOpening') call('Page.handleJavaScriptDialog', { accept: true })
    })
    await click('Delete goal')
    await appear('Create a goal to track')
    await click('Profile', 'a')
    await appear('Milestone history')
    await appear('Reached the goal target of 1 habit completion.')
    await fill('#custom-focus', 'Studio Work')
    await click('Add focus')
    await fill('#profile-name', 'Renamed Tester')
    await click('Save name')
    await appear('Profile saved.')
    await fill('input[placeholder*="Engineering"]', 'Medical Student')
    await click('Save personalization')
    await appear('Saved')
    await click('Settings', 'a')
    await click('Light')
    await click('Teal')
    await waitFor(() => evaluate("localStorage.getItem('habitline:theme') === 'light' && localStorage.getItem('habitline:accent') === 'teal'"), 'theme settings saved')
    await call('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true })
    await call('Page.reload')
    await appear('Appearance & Theme')
    await waitFor(() => evaluate("document.documentElement.classList.contains('light')"), 'restored light theme')
    assert.equal(await evaluate("localStorage.getItem('habitline:accent')"), 'teal')
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await click('Dashboard', 'a')
    const sectionOrder = await waitFor(async () => {
      const headings = await evaluate("[...document.querySelectorAll('section > div > h3')].map((node) => node.textContent.trim())")
      return headings.length >= 2 ? headings : null
    }, 'dashboard section headings')
    assert.deepEqual(sectionOrder.slice(0, 2), ['Studio Work', 'DSA Practice'])
    await click('Mark Review Algorithms as not done')
    await appear('0/2')
    await call('Page.reload')
    await appear('0/2')
    assert.deepEqual(await evaluate("fetch('/api/completions').then((r) => r.json()).then(({ completions }) => completions)"), [])
    await click('Edit Review Algorithms')
    await click('Archive this habit')
    await appear('Archived')
    await click('Settings', 'a')
    await click('Delete')
    await appear('No archived habits.')
    await click('Log Out of Account')
    await appear('Welcome back')
    await fill('input[type=email]', 'browser@example.invalid')
    await fill('input[type=password]', 'browser password')
    await click('Log in to Habitline')
    await appear('Renamed')
    await click('Mark Make a Prototype as done')
    await appear('Achievement unlocked')
    await click('Progress', 'a')
    await appear('100 XP')
    await appear('Level 2')
    await click('Challenges')
    await click('New challenge')
    await fill('input[maxlength="120"]', 'Prototype practice')
    await fill('input[type=number]', '1')
    await waitFor(() => evaluate("(() => { const b = document.querySelector('form input[type=checkbox]'); if (!b) return false; b.click(); return true })()"), 'link prototype habit')
    await click('Save challenge')
    await appear('1 / 1 completions')
    await click('Archive challenge')
    await click('Restore challenge')
    await click('People')
    await appear('Social profile')
    await fill('input[pattern]', 'browser_stage4')
    await fill('select', 'friends')
    await click('Appear in username search', 'label')
    await click('Share XP and rankings', 'label')
    await click('Allow achievement sharing', 'label')
    await click('Save social profile')
    await appear('Find people')
    await click('Overview')
    await appear('1 tracked completion')
    await call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: work })
    await click('Share card')
    await waitFor(() => readFileSync(join(work, 'habitline-achievement.png')).subarray(1, 4).toString() === 'PNG', 'achievement PNG download')
    await click('Post to friends')
    await appear('Achievement shared with friends')
    await click('Settings', 'a')
    await click('Log Out of Account')
    await appear('Welcome back')
    const secondAccount = await evaluate(`(async () => {
      const headers = { 'Content-Type':'application/json', 'X-Habitline-Request':'1' }
      const signup = await fetch('/api/auth/signup', { method:'POST',headers,body:JSON.stringify({ fullName:'Second Tester', email:'second@example.invalid', password:'browser password' }) })
      if (signup.status !== 201) return signup.status
      const profile = await fetch('/api/social/profile', { method:'PUT',headers,body:JSON.stringify({ username:'second_tester', bio:'', visibility:'friends', discoverable:true, showXp:true, showAwards:true }) })
      return profile.status
    })()`)
    assert.equal(secondAccount,200)
    await call('Page.navigate', { url: site + '/progress' })
    await appear('Progress')
    await click('People')
    await fill('input[aria-label="Find by username"]', 'browser_stage4')
    await click('Search people')
    await appear('@browser_stage4')
    await click('Send request')
    await appear('Sent')
    await click('Settings', 'a')
    await click('Log Out of Account')
    await appear('Welcome back')
    await fill('input[type=email]', 'browser@example.invalid')
    await fill('input[type=password]', 'browser password')
    await click('Log in to Habitline')
    await appear('Renamed')
    await click('Progress', 'a')
    await click('People')
    await click('Accept request')
    await appear('Remove friend')
    await click('Groups')
    await click('New group')
    await fill('input[maxlength="80"]', 'Browser private group')
    await click('Save group')
    await click('Open group')
    await appear('Browser private group · owner')
    const invitee = await evaluate("document.querySelector('[aria-label=\"Friend to invite\"] option:nth-child(2)').value")
    await fill('[aria-label="Friend to invite"]', invitee)
    await click('Invite to group')
    await appear('Cancel invitation')
    await click('Rankings')
    await appear('Leaderboards')
    await appear('100 XP')
    await click('Challenges')
    await click('New challenge')
    await fill('input[maxlength="120"]', 'Browser shared challenge')
    await fill('select', 'friends')
    await fill('input[type=number]', '1')
    await waitFor(() => evaluate("(() => { const b = document.querySelector('form input[type=checkbox]'); if (!b) return false; b.click(); return true })()"), 'link shared challenge habit')
    await click('Save challenge')
    await click('Invite participant')
    await fill('form select', invitee)
    await click('Send challenge invitation')
    await appear('Browser shared challenge')
    await click('Settings', 'a')
    await click('Log Out of Account')
    await appear('Welcome back')
    await fill('input[type=email]', 'second@example.invalid')
    await fill('input[type=password]', 'browser password')
    await click('Log in to Habitline')
    await appear('Nothing scheduled today')
    await create('Second practice', 'Study')
    await click('Progress', 'a')
    await click('Groups')
    await click('Accept group invite')
    await click('Open group')
    await appear('Browser private group · member')
    await click('Challenges')
    await click('Choose habits and join')
    await waitFor(() => evaluate("(() => { const b = document.querySelector('form input[type=checkbox]'); if (!b) return false; b.click(); return true })()"), 'link participant habit')
    await click('Accept challenge')
    await waitFor(() => evaluate("!!document.querySelector('[aria-label=\"Challenge leaderboard\"]')"), 'challenge leaderboard')
    await click('Dashboard', 'a')
    await click('Mark Second practice as done')
    await appear('1/1')
    await click('Progress', 'a')
    await click('Challenges')
    await appear('1 / 1 completions')
    await click('Activity')
    await click('🔥 0')
    await appear('🔥 1')
    assert.deepEqual(exceptions, [])
    console.log('Browser workflows passed')
  } catch (error) {
    console.error(await evaluate('document.body?.innerText').catch(() => 'Page unavailable'))
    throw error
  } finally {
    socket.close()
  }
}

main().catch((error) => {
  console.error(error, errors.slice(-4).join('\n'))
  process.exitCode = 1
}).finally(async () => {
  for (const child of children.reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const exited = once(child, 'exit')
    if (child.kill()) await exited
  }
  try { rmSync(work, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }) } catch {}
})
