import { lastNDays, todayStr, humanDate, dayOfWeek } from '../lib/dateUtils'
import { useState } from 'react'

export default function ContributionGrid({ days = 119, intensityFor, todayGlow = true }) {
  const [hover, setHover] = useState(null)
  const dates = lastNDays(days)
  const today = todayStr()

  const firstDow = dayOfWeek(dates[0])
  const padded = Array(firstDow).fill(null).concat(dates)
  const weeks = []
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7))
  }

  const intensityClass = (level) => {
    switch (level) {
      case 3:
        return 'bg-[var(--accent)] shadow-xs'
      case 2:
        return 'bg-[var(--accent)]/65'
      case 1:
        return 'bg-[var(--accent)]/30'
      default:
        return 'bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]'
    }
  }

  return (
    <div className="relative">
      <div className="flex gap-[5px] overflow-x-auto pb-2 scrollbar-thin">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[5px]">
            {week.map((d, di) =>
              d ? (
                <div
                  key={di}
                  onMouseEnter={() => setHover(d)}
                  onMouseLeave={() => setHover(null)}
                  className={`w-[14px] h-[14px] rounded-[5px] ${intensityClass(intensityFor(d))} ${
                    todayGlow && d === today
                      ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-surface)]'
                      : ''
                  } transition-all duration-150 hover:scale-130 hover:z-10 cursor-pointer`}
                  title={`${humanDate(d)}`}
                />
              ) : (
                <div key={di} className="w-[14px] h-[14px]" />
              )
            )}
          </div>
        ))}
      </div>
      {hover && (
        <div className="inline-block mt-3 px-3 py-1 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-xs font-bold text-[var(--accent)] font-mono-num animate-rise shadow-xs">
          {humanDate(hover)}
        </div>
      )}
    </div>
  )
}
