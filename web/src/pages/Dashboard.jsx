import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHabits } from '../context/HabitsContext'
import { useToday } from '../lib/useToday'
import { isHabitScheduledOn } from '../lib/schedule'
import { summarizeDay } from '../lib/calculations'
import { buildDashboardSections, dashboardConfig } from '../lib/personalization'
import HabitCard from '../components/HabitCard'
import ProgressRing from '../components/ProgressRing'
import EmptyState from '../components/EmptyState'
import AddHabitModal from '../components/AddHabitModal'
import HabitRelationshipModal from '../components/HabitRelationshipModal'
import { ListChecks, Plus, CheckCircle2, Zap, Target, Calendar, ArrowUpRight, Sparkles } from 'lucide-react'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const { user } = useAuth()
  const { habits, activeHabits, completions, relationships } = useHabits()
  const { openAddHabit } = useOutletContext()
  const today = useToday()
  const [editingHabit, setEditingHabit] = useState(null)
  const [relationshipHabit, setRelationshipHabit] = useState(null)

  const scheduledToday = useMemo(
    () => activeHabits.filter((h) => isHabitScheduledOn(h, today)),
    [activeHabits, today]
  )
  const daily = summarizeDay(habits, completions, today)
  const completedIds = daily.doneIds
  const otherHabits = habits.filter((habit) => !scheduledToday.some(({ id }) => id === habit.id))
  const completionDatesByHabit = useMemo(() => {
    const map = new Map()
    for (const c of completions) {
      if (!map.has(c.habitId)) map.set(c.habitId, new Set())
      map.get(c.habitId).add(c.date)
    }
    return map
  }, [completions])

  const { completion: habitCompletionPct, focus: score, earned, possible } = daily
  const firstName = user?.fullName?.split(' ')[0] || 'Friend'
  const personalization = dashboardConfig(user?.onboarding)
  const sections = useMemo(
    () => buildDashboardSections(scheduledToday, personalization.focusAreas),
    [scheduledToday, personalization.focusAreas]
  )
  const relatedHabitsFor = (habitId) =>
    relationships
      .map((relationship) =>
        relationship.habitId === habitId
          ? relationship.relatedHabitId
          : relationship.relatedHabitId === habitId
          ? relationship.habitId
          : null
      )
      .filter(Boolean)
      .map((id) => activeHabits.find((habit) => habit.id === id))
      .filter(Boolean)

  const renderHabit = (habit, canComplete = true) => (
    <HabitCard
      key={habit.id}
      habit={habit}
      canComplete={canComplete}
      isCompleted={completedIds.has(habit.id)}
      date={today}
      completionDatesSet={completionDatesByHabit.get(habit.id) || new Set()}
      onEdit={setEditingHabit}
      relatedHabits={relatedHabitsFor(habit.id)}
      onRelationships={setRelationshipHabit}
    />
  )

  return (
    <div className="space-y-8 animate-rise">
      {/* Header Greeting Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 sm:p-8 shadow-sm">
        {/* Subtle decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[var(--accent)]/10 blur-3xl"
        />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[11px] font-extrabold uppercase tracking-wider border border-[var(--accent)]/20 mb-2">
              <Sparkles size={11} /> {greeting()}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-main)]">
              {firstName} 👋
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Link
                className="inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)] hover:underline group"
                to="/progress"
              >
                <span>Progress and challenges</span>
                <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <span className="text-xs text-[var(--text-subtle)] hidden sm:inline">·</span>
              <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium">
                {personalization.hasPersonalization
                  ? `Your dashboard is organized around ${personalization.habitsLabel.toLowerCase()}.`
                  : 'Track your routines and stay consistent every day.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] px-4 py-2.5 rounded-2xl shrink-0 self-start sm:self-center shadow-xs">
            <Calendar size={16} className="text-[var(--accent)]" />
            <span className="text-xs font-mono-num font-bold text-[var(--text-main)]">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={CheckCircle2}
          label="Habits Done"
          value={`${daily.completed}/${daily.scheduled.length}`}
          sub={`${daily.scheduled.length - daily.completed} remaining today`}
        />
        <StatCard
          icon={Target}
          label="Daily Rate"
          value={`${habitCompletionPct}%`}
          sub="of scheduled habits completed"
        />
        <StatCard
          icon={Zap}
          label="Points Earned"
          value={`${earned}/${possible}`}
          sub="today's earned score"
          mono
        />
      </div>

      {/* Focus Score Banner */}
      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 sm:p-7 flex flex-col sm:flex-row items-center gap-6 shadow-xs card-hover">
        <div className="relative shrink-0">
          <ProgressRing value={score} size={96} strokeWidth={9} label="FOCUS" />
        </div>
        <div className="text-center sm:text-left min-w-0 flex-1">
          <div className="flex items-center justify-center sm:justify-start gap-2.5 mb-1.5 flex-wrap">
            <h2 className="font-extrabold text-lg sm:text-xl text-[var(--text-main)]">Daily Focus Score</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
              Weighted Metrics
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
            Calculated based on habit point weighting. You have earned{' '}
            <strong className="text-[var(--text-main)] font-mono-num font-bold">{earned}</strong> out of{' '}
            <strong className="text-[var(--text-main)] font-mono-num font-bold">{possible}</strong> total potential points today.
          </p>
        </div>
      </div>

      {/* Today's Habits Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <h2 className="font-extrabold text-lg sm:text-xl tracking-tight text-[var(--text-main)]">
              {personalization.habitsLabel}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-color)] font-mono-num">
              {scheduledToday.length}
            </span>
          </div>
          <button
            onClick={openAddHabit}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:opacity-85 cursor-pointer bg-[var(--accent)]/10 hover:bg-[var(--accent)]/18 px-3 py-1.5 rounded-xl border border-[var(--accent)]/25 transition"
          >
            <Plus size={15} strokeWidth={2.6} /> Add Habit
          </button>
        </div>

        {scheduledToday.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nothing scheduled today"
            subtitle={
              activeHabits.length === 0
                ? "Start building your routine! Create your first habit to begin tracking your daily progress."
                : 'None of your habits are scheduled for today.'
            }
            action={
              <button
                onClick={openAddHabit}
                className="button-press flex items-center gap-2 bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold text-sm px-6 py-3.5 rounded-2xl hover:brightness-110 shadow-lg shadow-[var(--accent)]/25 transition cursor-pointer"
              >
                <Plus size={18} strokeWidth={2.8} /> Create First Habit
              </button>
            }
          />
        ) : (
          <div className="space-y-7">
            {sections.map((section) => (
              <section key={section.id}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-bold text-sm text-[var(--text-main)]">{section.title}</h3>
                  <span className="text-[11px] font-mono-num font-bold text-[var(--text-muted)]">
                    {section.habits.length}
                  </span>
                </div>
                <div className="space-y-3">{section.habits.map((habit) => renderHabit(habit))}</div>
              </section>
            ))}
          </div>
        )}
      </div>

      {otherHabits.length > 0 && (
        <section aria-label="Other habits" className="pt-2 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-extrabold text-[var(--text-main)]">Other habits</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-color)] font-mono-num">
              {otherHabits.length}
            </span>
          </div>
          <div className="space-y-3">{otherHabits.map((habit) => renderHabit(habit, false))}</div>
        </section>
      )}

      <AddHabitModal
        open={!!editingHabit}
        onClose={() => setEditingHabit(null)}
        editingHabit={editingHabit}
      />
      <HabitRelationshipModal
        habit={relationshipHabit}
        open={!!relationshipHabit}
        onClose={() => setRelationshipHabit(null)}
      />
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, mono }) {
  return (
    <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 sm:p-6 shadow-xs card-hover">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/12 flex items-center justify-center text-[var(--accent)]">
            <Icon size={17} strokeWidth={2.4} />
          </div>
        )}
      </div>
      <p className={`text-2xl sm:text-3xl font-extrabold text-[var(--text-main)] tracking-tight ${mono ? 'font-mono-num' : ''}`}>
        {value}
      </p>
      <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">{sub}</p>
    </div>
  )
}
