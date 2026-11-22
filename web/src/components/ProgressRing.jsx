export default function ProgressRing({ value = 0, size = 96, strokeWidth = 8, label, sublabel }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-[var(--border-color)]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke="var(--accent)"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            filter: 'drop-shadow(0 0 3px var(--accent-glow))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono-num font-extrabold text-xl sm:text-2xl leading-none text-[var(--text-main)]">
          {value}%
        </span>
        {label && (
          <span className="text-[9px] font-bold text-[var(--text-subtle)] mt-1 uppercase tracking-widest">
            {label}
          </span>
        )}
      </div>
      {sublabel}
    </div>
  )
}
