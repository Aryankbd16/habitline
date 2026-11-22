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
      today,
      ...past.map((record) => record.date),
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

      {/* User Hero Banner */}
      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 shadow-xs relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full bg-[var(--accent)]/10 blur-3xl"
        />
        <div className="relative w-22 h-22 rounded-3xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-base)] text-[var(--accent-fg)] flex items-center justify-center text-4xl shadow-xl shadow-[var(--accent)]/25 shrink-0 select-none">
          {user.avatarEmoji || '🎯'}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="font-extrabold text-2xl sm:text-3xl text-[var(--text-main)] tracking-tight truncate">
            {user.fullName}
          </h2>
          <p className="text-xs sm:text-sm font-semibold text-[var(--text-muted)] truncate mt-1">
            {user.email}
          </p>
          <div className="flex items-center gap-2 mt-3.5 justify-center sm:justify-start flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 font-mono-num shadow-2xs">
              <Zap size={13} className="fill-[var(--accent)]" /> {stats.totalPoints} Lifetime Points
            </span>
          </div>
        </div>
      </div>

      {/* Edit Full Name Form */}
      <form
        className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 shadow-xs space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          saveProfile({ fullName: name })
        }}
      >
        <label className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider" htmlFor="profile-name">
          Full name
        </label>
        <div className="flex flex-wrap gap-2.5">
          <input
            id="profile-name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="flex-1 min-w-[200px] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-4 py-3 text-sm text-[var(--text-main)] font-semibold outline-none focus:border-[var(--accent)] transition"
          />
          <button
            type="submit"
            className="button-press rounded-2xl bg-[var(--accent)] px-6 py-3 text-xs font-extrabold text-[var(--accent-fg)] hover:brightness-110 shadow-md shadow-[var(--accent)]/20 cursor-pointer"
          >
            Save name
          </button>
        </div>
        {profileMessage && (
          <p role="status" className="text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/10 p-2.5 rounded-xl border border-[var(--accent)]/20 inline-block">
            {profileMessage}
          </p>
        )}
      </form>

      {/* Select Avatar Emoji */}
      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 shadow-xs">
        <label className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-3">
          Select Avatar Emoji
        </label>
        <div className="flex gap-2.5 flex-wrap">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => saveProfile({ avatarEmoji: e })}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition cursor-pointer ${
                user.avatarEmoji === e
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-md shadow-[var(--accent)]/30 scale-110 ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-surface)]'
                  : 'bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] hover:border-[var(--border-color-hover)]'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 sm:gap-4">
        <Stat icon={Layers} label="Total Habits" value={habits.length} />
        <Stat icon={Target} label="Completions" value={stats.totalCompletions} />
        <Stat icon={Zap} label="Total Points" value={stats.totalPoints} />
        <Stat icon={Award} label="Completion Rate" value={`${stats.overallCompletionPct}%`} />
        <Stat icon={Flame} label="Current Streak" value={stats.currentStreak} suffix="days" />
        <Stat icon={Award} label="Longest Streak" value={stats.longestStreak} suffix="days" />
      </div>

      {/* Personalization Section */}
      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 sm:p-7 shadow-xs">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-extrabold text-lg text-[var(--text-main)] tracking-tight">Personalization</h3>
            <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">
              Use your goals and interests to order dashboard sections.
            </p>
          </div>
          {saveState && (
            <span className="text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/15 px-3 py-1 rounded-full border border-[var(--accent)]/30">
              {saveState}
            </span>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2.5">
              Primary Goal
            </p>
            <div className="flex flex-wrap gap-2">
              {PRIMARY_GOALS.map((goal) => (
                <button
                  type="button"
                  key={goal}
                  onClick={() =>
                    setPersonalization((p) => ({
                      ...p,
                      primaryGoal: p.primaryGoal === goal ? null : goal,
                    }))
                  }
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
                    personalization.primaryGoal === goal
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs scale-102'
                      : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-color)]'
                  }`}
                >
                  {goal}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
              Profession / Role
            </span>
            <input
              value={personalization.profession}
              maxLength="120"
              onChange={(e) => setPersonalization((p) => ({ ...p, profession: e.target.value }))}
              placeholder="e.g., Computer Engineering Student"
              className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] placeholder-[var(--text-subtle)] rounded-2xl px-4 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] font-semibold transition"
            />
          </label>

          <div>
            <p className="text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2.5">
              Areas of Focus
            </p>
            <div className="flex flex-wrap gap-2">
              {focusOptions.map((area) => {
                const selected = personalization.areasOfFocus.includes(area)
                return (
                  <button
                    type="button"
                    key={area}
                    onClick={() =>
                      setPersonalization((p) => ({
                        ...p,
                        areasOfFocus: selected
                          ? p.areasOfFocus.filter((x) => x !== area)
                          : [...p.areasOfFocus, area],
                      }))
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                      selected
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs'
                        : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-color)]'
                    }`}
                  >
                    {area}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2" htmlFor="custom-focus">
              Custom focus category
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="custom-focus"
                maxLength={80}
                value={customFocus}
                onChange={(event) => setCustomFocus(event.target.value)}
                placeholder="New focus category"
                className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs font-semibold text-[var(--text-main)] outline-none focus:border-[var(--accent)] transition"
              />
              <button
                type="button"
                className="underline text-xs font-bold text-[var(--accent)] hover:opacity-85 disabled:opacity-40 cursor-pointer px-2 self-center"
                disabled={!customFocus.trim() || personalization.areasOfFocus.length >= 30}
                onClick={() => {
                  updateFocus([...new Set([...personalization.areasOfFocus, customFocus.trim()])])
                  setCustomFocus('')
                }}
              >
                Add focus
              </button>
            </div>
          </div>

          {personalization.areasOfFocus.length > 0 && (
            <div className="p-4 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]">
              <h4 className="text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-3">
                Section priority
              </h4>
              <ol className="space-y-1.5">
                {personalization.areasOfFocus.map((area, index, areas) => (
                  <li
                    key={area}
                    className="flex flex-wrap gap-3 items-center text-xs font-semibold py-1.5 px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]"
                  >
                    <span className="mr-auto text-[var(--text-main)] font-bold">{area}</span>
                    <button
                      type="button"
                      className="underline text-[var(--accent)] font-bold disabled:opacity-30 cursor-pointer"
                      disabled={!index}
                      aria-label={'Move ' + area + ' up'}
                      onClick={() => changeOrder(index, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="underline text-[var(--accent)] font-bold disabled:opacity-30 cursor-pointer"
                      disabled={index === areas.length - 1}
                      aria-label={'Move ' + area + ' down'}
                      onClick={() => changeOrder(index, 1)}
                    >
                      Down
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <button
            type="button"
            onClick={savePersonalization}
            className="button-press bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold px-6 py-3.5 rounded-2xl hover:brightness-110 active:scale-[0.98] transition cursor-pointer text-xs shadow-md shadow-[var(--accent)]/20"
          >
            Save personalization
          </button>
        </div>
      </div>

      <MilestoneHistory />
    </div>
  )
}

function Stat({ icon: Icon, label, value, suffix }) {
  return (
    <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 shadow-xs card-hover">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold text-[var(--text-subtle)] uppercase tracking-wider truncate">{label}</p>
        {Icon && (
          <div className="w-7 h-7 rounded-xl bg-[var(--accent)]/12 flex items-center justify-center text-[var(--accent)] shrink-0">
            <Icon size={15} strokeWidth={2.4} />
          </div>
        )}
      </div>
      <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-main)] font-mono-num tracking-tight">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </p>
    </div>
  )
}
