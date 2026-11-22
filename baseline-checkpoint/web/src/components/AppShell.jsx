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
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/progress', label: 'Progress', icon: Trophy },
]

export default function AppShell() {
  const { loading, error, reload, awards, dismissAwards } = useHabits()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-main)] transition-colors duration-200">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-[var(--bg-surface)] border-r border-[var(--border-color)] px-4 py-6 gap-1 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center font-extrabold text-xl shadow-md shadow-[var(--accent)]/25 transition-transform duration-200 hover:scale-105">
            H
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight block leading-none">Habitline</span>
            <span className="text-[10px] font-semibold text-[var(--text-subtle)] tracking-wider uppercase flex items-center gap-1 mt-1">
              <Sparkles size={10} className="text-[var(--accent)]" /> Daily Tracker
            </span>
          </div>
        </div>

        <button
          onClick={() => setAddOpen(true)}
          className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-bold py-3 px-4 shadow-md shadow-[var(--accent)]/20 hover:brightness-110 active:scale-[0.98] transition duration-200 cursor-pointer"
        >
          <Plus size={18} strokeWidth={2.5} />
          New habit
        </button>

        <div className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--accent)]/12 text-[var(--accent)] font-bold border-l-3 border-[var(--accent)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-main)]'
                }`
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 px-4 sm:px-6 md:px-10 pt-6 pb-28 md:pb-10 max-w-5xl w-full mx-auto">
          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-rose-500/40 p-4">
              <p>Could not load habit data. {error}</p>
              <button type="button" onClick={reload} className="underline">Retry</button>
            </div>
          )}
          {awards.length > 0 && <div className="mb-4 rounded-xl border border-[var(--accent)] p-3 flex justify-between gap-3">
            <div role="status"><strong>Achievement unlocked</strong>{awards.map((award, index) => <p key={index} className="text-sm">{award.title} · {award.description}</p>)}</div>
            <button type="button" onClick={dismissAwards} className="underline text-sm self-start">Dismiss</button>
          </div>}
          {loading ? <p role="status">Loading your habits…</p> : !error && <Outlet context={{ openAddHabit: () => setAddOpen(true) }} />}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--bg-surface)]/95 backdrop-blur-lg border-t border-[var(--border-color)] pb-[env(safe-area-inset-bottom)] shadow-lg">
        <div className="flex items-center justify-around relative px-2">
          {NAV_ITEMS.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
            <MobileNavItem key={to} to={to} label={label} Icon={Icon} end={end} />
          ))}

          <button
            onClick={() => setAddOpen(true)}
            aria-label="Add habit"
            className="relative -top-4 w-12 h-12 shrink-0 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/30 active:scale-95 transition-transform duration-150 cursor-pointer"
          >
            <Plus size={26} strokeWidth={2.8} />
          </button>

          {NAV_ITEMS.slice(2, -1).map(({ to, label, icon: Icon, end }) => (
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
        `flex flex-col items-center gap-1 py-3 px-1.5 text-[10px] font-semibold transition-colors ${
          isActive ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
        }`
      }
    >
      <Icon size={20} />
      {label}
    </NavLink>
  )
}
