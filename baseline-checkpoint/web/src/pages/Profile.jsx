import MilestoneHistory from '../components/MilestoneHistory'
import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { addDays } from '../lib/dateUtils'
import { useToday } from '../lib/useToday'
import { useHabits } from '../context/HabitsContext'
import { currentStreak, longestStreak, periodProgress } from '../lib/calculations'
import { Award, Target, Flame, Layers, Zap } from 'lucide-react'
import { FOCUS_AREAS, PRIMARY_GOALS, normalizePersonalization } from '../lib/personalization'

const EMOJIS = ['🎯', '🚀', '⚡', '🌱', '🔥', '📈', '🧠', '💎', '🏃', '📚', '🧘', '🏆']

export default function Profile() {
  const { user, updateProfile, updatePersonalization } = useAuth()
  const { habits, completions } = useHabits()
  const [personalization, setPersonalization] = useState(() => normalizePersonalization(user?.onboarding))
  const [customFocus, setCustomFocus] = useState('')
  const updateFocus = (areasOfFocus) => setPersonalization((prior) => ({ ...prior, areasOfFocus }))
  const changeOrder = (index, offset) => {
    const areas = [...personalization.areasOfFocus]
    const next = index + offset
    if (next < 0 || next >= areas.length) return
    const moved = areas[index]
    areas[index] = areas[next]
    areas[next] = moved
    updateFocus(areas)
  }
  const focusOptions = [...new Set([...FOCUS_AREAS, ...habits.map((habit) => habit.category), ...personalization.areasOfFocus])]
  const [saveState, setSaveState] = useState('')
  const [name, setName] = useState(user?.fullName || '')
  const [profileMessage, setProfileMessage] = useState('')
  const today = useToday()

  const stats = useMemo(() => {
    const past = completions.filter((completion) => completion.date <= today)
    const totalCompletions = past.length
    const totalPoints = past.reduce((sum, c) => {
      const h = habits.find((h) => h.id === c.habitId)
      return sum + (c.pointsEarned ?? h?.points ?? 0)
    }, 0)
    const streaks = habits.map((h) => {
      const dates = past.filter((c) => c.habitId === h.id).map((c) => c.date).sort()
      return { current: currentStreak(h, new Set(dates), today), longest: longestStreak(h, dates) }
    })
    const firstDate = [
      today, ...past.map((record) => record.date),
      ...habits.flatMap((habit) => [habit.startDate, ...(habit.scheduleHistory || []).map((schedule) => schedule.startDate)]),
    ].sort()[0]
    const dates = []
    for (let date = firstDate; date <= today; date = addDays(date, 1)) dates.push(date)
    const overallCompletionPct = periodProgress(habits, past, dates).rate
    return {
      totalCompletions,
      totalPoints,
      currentStreak: streaks.length ? Math.max(...streaks.map((s) => s.current), 0) : 0,
      longestStreak: streaks.length ? Math.max(...streaks.map((s) => s.longest), 0) : 0,
      overallCompletionPct,
    }
  }, [habits, completions, today])

  if (!user) return null

  const saveProfile = async (changes) => {
    setProfileMessage('Saving…')
    try {
      await updateProfile(changes)
      setProfileMessage('Profile saved.')
    } catch (error) {
      setProfileMessage(error.message)
    }
  }

  const savePersonalization = async () => {
    setSaveState('Saving…')
    try {
      const saved = normalizePersonalization(personalization)
      await updatePersonalization(saved)
      setPersonalization(saved)
      setSaveState('Saved')
    } catch (error) {
      setSaveState(error.message || 'Could not save changes.')
    }
  }

  return (
    <div className="space-y-8 animate-rise">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-main)]">User Profile</h1>
      </div>

      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 sm:p-8 flex items-center gap-6 shadow-xs">
        <div className="w-20 h-20 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center text-4xl shadow-md shadow-[var(--accent)]/20 shrink-0">
          {user.avatarEmoji || '🎯'}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-extrabold text-xl sm:text-2xl text-[var(--text-main)] truncate">{user.fullName}</h2>
          <p className="text-sm font-medium text-[var(--text-muted)] truncate mt-0.5">{user.email}</p>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 mt-3 font-mono-num">
            {stats.totalPoints} Lifetime Points
          </span>
        </div>
      </div>

      <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); saveProfile({ fullName: name }) }}>
        <label className="block font-semibold" htmlFor="profile-name">Full name</label>
        <div className="flex flex-wrap gap-2">
          <input id="profile-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2" />
          <button type="submit" className="rounded-xl bg-[var(--accent)] px-4 py-2 font-bold text-[var(--accent-fg)]">Save name</button>
        </div>
        {profileMessage && <p role="status">{profileMessage}</p>}
      </form>
      <div>
        <label className="block text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-2.5">
          Select Avatar Emoji
        </label>
        <div className="flex gap-2 flex-wrap bg-[var(--bg-surface)] border border-[var(--border-color)] p-3 rounded-2xl">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => saveProfile({ avatarEmoji: e })}
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl transition cursor-pointer ${
                user.avatarEmoji === e
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs scale-105 ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-surface)]'
                  : 'bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)]'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat icon={Layers} label="Total Habits" value={habits.length} />
        <Stat icon={Target} label="Completions" value={stats.totalCompletions} />
        <Stat icon={Zap} label="Total Points" value={stats.totalPoints} />
        <Stat icon={Award} label="Completion Rate" value={`${stats.overallCompletionPct}%`} />
        <Stat icon={Flame} label="Current Streak" value={stats.currentStreak} suffix="days" />
        <Stat icon={Award} label="Longest Streak" value={stats.longestStreak} suffix="days" />
      </div>

      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4 mb-5"><div><h3 className="font-extrabold text-base text-[var(--text-main)]">Personalization</h3><p className="text-xs text-[var(--text-muted)] mt-1">Use your goals and interests to order dashboard sections.</p></div>{saveState && <span className="text-xs font-bold text-[var(--accent)]">{saveState}</span>}</div>
        <div className="space-y-5">
          <div><p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-2">Primary Goal</p><div className="flex flex-wrap gap-2">{PRIMARY_GOALS.map((goal) => <button type="button" key={goal} onClick={() => setPersonalization((p) => ({ ...p, primaryGoal: p.primaryGoal === goal ? null : goal }))} className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${personalization.primaryGoal === goal ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-color)]'}`}>{goal}</button>)}</div></div>
          <label className="block"><span className="block text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-1.5">Profession / Role</span><input value={personalization.profession} maxLength="120" onChange={(e) => setPersonalization((p) => ({ ...p, profession: e.target.value }))} placeholder="e.g., Computer Engineering Student" className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] placeholder-[var(--text-subtle)] rounded-xl px-4 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)]" /></label>
          <div><p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-2">Areas of Focus</p><div className="flex flex-wrap gap-2">{focusOptions.map((area) => { const selected = personalization.areasOfFocus.includes(area); return <button type="button" key={area} onClick={() => setPersonalization((p) => ({ ...p, areasOfFocus: selected ? p.areasOfFocus.filter((x) => x !== area) : [...p.areasOfFocus, area] }))} className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${selected ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-color)]'}`}>{area}</button> })}</div></div>
          <div>
            <label className="block text-sm" htmlFor="custom-focus">Custom focus category</label>
            <div className="flex flex-wrap gap-2">
              <input id="custom-focus" maxLength={80} value={customFocus} onChange={(event) => setCustomFocus(event.target.value)} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-3 py-2" />
              <button type="button" className="underline" disabled={!customFocus.trim() || personalization.areasOfFocus.length >= 30} onClick={() => {
                updateFocus([...new Set([...personalization.areasOfFocus, customFocus.trim()])])
                setCustomFocus('')
              }}>Add focus</button>
            </div>
          </div>
          {personalization.areasOfFocus.length > 0 && <div>
            <h4 className="text-sm font-bold">Section priority</h4>
            <ol className="space-y-1 mt-2">{personalization.areasOfFocus.map((area, index, areas) => <li key={area} className="flex flex-wrap gap-3 items-center text-sm">
              <span className="mr-auto">{area}</span>
              <button type="button" className="underline disabled:opacity-40" disabled={!index} aria-label={'Move ' + area + ' up'} onClick={() => changeOrder(index, -1)}>Up</button>
              <button type="button" className="underline disabled:opacity-40" disabled={index === areas.length - 1} aria-label={'Move ' + area + ' down'} onClick={() => changeOrder(index, 1)}>Down</button>
            </li>)}</ol>
          </div>}
          <button type="button" onClick={savePersonalization} className="bg-[var(--accent)] text-[var(--accent-fg)] font-bold px-5 py-3 rounded-xl hover:brightness-110 cursor-pointer">Save personalization</button>
        </div>
      </div>
      <MilestoneHistory />
    </div>
  )
}

function Stat({ icon: Icon, label, value, suffix }) {
  return (
    <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 shadow-xs">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider">{label}</p>
        {Icon && <Icon size={16} className="text-[var(--accent)] shrink-0" />}
      </div>
      <p className="text-2xl font-extrabold text-[var(--text-main)] font-mono-num">{value}{suffix ? ` ${suffix}` : ''}</p>
    </div>
  )
}
