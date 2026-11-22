import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { daysInMonth, todayStr } from '../lib/dateUtils'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * dayStatus(dateStr) => 'completed' | 'partial' | 'missed' | 'none' | 'future'
 */
export default function MonthCalendar({ dayStatus, onSelectDate, selectedDate }) {
  const today = todayStr()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const total = daysInMonth(cursor.year, cursor.month)
  const firstDow = new Date(cursor.year, cursor.month, 1).getDay()
  const cells = Array(firstDow).fill(null)
  for (let day = 1; day <= total; day++) {
    const m = String(cursor.month + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    cells.push(`${cursor.year}-${m}-${d}`)
  }

  const nav = (delta) => {
    setCursor((c) => {
      let month = c.month + delta
      let year = c.year
      if (month < 0) { month = 11; year-- }
      if (month > 11) { month = 0; year++ }
      return { year, month }
    })
  }

  const dotColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-[var(--accent)] shadow-xs'
      case 'partial': return 'bg-[var(--accent)]/50'
      case 'missed': return 'bg-rose-500/80'
      default: return ''
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-extrabold text-lg text-[var(--text-main)]">{MONTH_NAMES[cursor.month]} {cursor.year}</h3>
        <div className="flex gap-1.5">
          <button aria-label="Previous month" onClick={() => nav(-1)} className="w-8 h-8 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition cursor-pointer">
            <ChevronLeft size={16} />
          </button>
          <button aria-label="Next month" onClick={() => nav(1)} className="w-8 h-8 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition cursor-pointer">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />
          const isFuture = dateStr > today
          const status = isFuture ? 'future' : dayStatus(dateStr)
          const isToday = dateStr === today
          const isSelected = dateStr === selectedDate
          return (
            <button
              key={dateStr}
              aria-label={dateStr}
              aria-pressed={isSelected}
              disabled={isFuture}
              onClick={() => onSelectDate?.(dateStr)}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-semibold transition cursor-pointer ${
                isSelected
                  ? 'ring-2 ring-[var(--accent)] bg-[var(--accent)]/15 font-extrabold text-[var(--text-main)] shadow-xs'
                  : isToday
                  ? 'bg-[var(--bg-surface-elevated)] border border-[var(--accent)]/40 font-bold text-[var(--accent)]'
                  : 'bg-[var(--bg-surface-elevated)] text-[var(--text-main)] border border-transparent hover:border-[var(--border-color-hover)] hover:bg-[var(--bg-surface-hover)]'
              } ${isFuture ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}`}
            >
              <span className="font-mono-num">{Number(dateStr.slice(-2))}</span>
              {!isFuture && status !== 'none' && (
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor(status)}`} />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex items-center flex-wrap gap-3 mt-5 pt-4 border-t border-[var(--border-color)] text-xs font-semibold text-[var(--text-muted)]">
        <Legend color="bg-[var(--accent)]" label="Completed" />
        <Legend color="bg-[var(--accent)]/50" label="Partial" />
        <Legend color="bg-rose-500/80" label="Missed" />
      </div>
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} /> {label}
    </span>
  )
}
