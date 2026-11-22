import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutGrid,
  CalendarDays,
  BarChart3,
  Target,
  UserRound,
  Settings as SettingsIcon,
  Plus,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import { useHabits } from '../context/HabitsContext'
import AddHabitModal from './AddHabitModal'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/progress', label: 'Progress', icon: Trophy },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function AppShell() {
  const { loading, error, reload, awards, dismissAwards } = useHabits()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-main)] transition-colors duration-200">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-[var(--bg-surface)] border-r border-[var(--border-color)] px-4 py-6 gap-2 sticky top-0 h-screen select-none z-20">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 px-2 mb-6">
          <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-base)] text-[var(--accent-fg)] flex items-center justify-center font-extrabold text-xl shadow-lg shadow-[var(--accent)]/25 transition-transform duration-200 hover:scale-105">
            H
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[var(--bg-surface)]" />
          </div>
          <div className="min-w-0">
            <span className="font-extrabold text-xl tracking-tight block leading-none bg-gradient-to-r from-[var(--text-main)] to-[var(--text-muted)] bg-clip-text text-transparent">
              Habitline
            </span>
            <span className="text-[10px] font-bold text-[var(--text-subtle)] tracking-widest uppercase flex items-center gap-1 mt-1">
              <Sparkles size={10} className="text-[var(--accent)] shrink-0" /> Routine OS
            </span>
          </div>
        </div>

        {/* New Habit Action Button */}
        <button
          onClick={() => setAddOpen(true)}
          className="button-press mb-4 flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold text-sm py-3 px-4 shadow-lg shadow-[var(--accent)]/25 hover:brightness-110 active:scale-[0.98] transition duration-200 cursor-pointer"
        >
          <Plus size={18} strokeWidth={2.6} />
          New habit
        </button>

        {/* Navigation list */}
        <div className="space-y-1 flex-1 overflow-y-auto pr-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-extrabold shadow-xs shadow-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-main)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={19}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={`transition-transform duration-200 group-hover:scale-110 ${
                      isActive ? 'text-[var(--accent)]' : 'text-[var(--text-subtle)] group-hover:text-[var(--text-main)]'
                    }`}
                  />
                  <span>{label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-xs shadow-[var(--accent)]" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Sidebar Footer Info */}
        <div className="pt-3 border-t border-[var(--border-color)] px-2">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-subtle)] font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
            <span className="font-mono-num text-[10px] uppercase tracking-wider">v2.4 Pro</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 px-4 sm:px-6 md:px-10 pt-6 pb-28 md:pb-12 max-w-5xl w-full mx-auto">
          {error && (
            <div role="alert" className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 shadow-sm flex items-center justify-between gap-3 text-sm animate-rise">
              <p className="text-rose-400 font-medium">Could not load habit data. {error}</p>
              <button type="button" onClick={reload} className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 font-bold hover:bg-rose-500/30 transition cursor-pointer shrink-0">
                Retry
              </button>
            </div>
          )}

          {awards.length > 0 && (
            <div className="mb-6 rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4.5 flex items-center justify-between gap-4 shadow-lg backdrop-blur-md animate-rise">
              <div className="flex items-center gap-3.5" role="status">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shrink-0 shadow-md shadow-[var(--accent)]/30">
                  <Trophy size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <strong className="block text-sm font-extrabold text-[var(--text-main)]">Achievement unlocked</strong>
                  {awards.map((award, index) => (
                    <p key={index} className="text-xs font-semibold text-[var(--text-muted)] mt-0.5">
                      {award.title} · {award.description}
                    </p>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={dismissAwards}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 transition cursor-pointer self-center shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              <p role="status" className="text-sm font-medium text-[var(--text-muted)]">Loading your habits…</p>
            </div>
          ) : !error && (
            <Outlet context={{ openAddHabit: () => setAddOpen(true) }} />
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--bg-surface)]/95 backdrop-blur-xl border-t border-[var(--border-color)] pb-[env(safe-area-inset-bottom)] shadow-2xl">
        <div className="flex items-center justify-around relative px-1 py-1 max-w-md mx-auto">
          {NAV_ITEMS.slice(0, 3).map(({ to, label, icon: Icon, end }) => (
            <MobileNavItem key={to} to={to} label={label} Icon={Icon} end={end} />
          ))}

          <button
            onClick={() => setAddOpen(true)}
            aria-label="Add habit"
            className="button-press -top-3 relative w-12 h-12 shrink-0 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/40 active:scale-95 transition-transform duration-150 cursor-pointer"
          >
            <Plus size={26} strokeWidth={2.8} />
          </button>

          {NAV_ITEMS.slice(3).map(({ to, label, icon: Icon, end }) => (
            <MobileNavItem key={to} to={to} label={label} Icon={Icon} end={end} />
          ))}
        </div>
      </nav>

      <AddHabitModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function MobileNavItem({ to, label, Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 rounded-xl text-[9px] font-semibold transition-all duration-150 ${
          isActive
            ? 'text-[var(--accent)] font-extrabold scale-105'
            : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
        }`
      }
    >
      <Icon size={19} />
      <span className="truncate max-w-[48px]">{label}</span>
    </NavLink>
  )
}
