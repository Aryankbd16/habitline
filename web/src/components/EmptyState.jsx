export default function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl shadow-xs animate-rise">
      {Icon && (
        <div className="relative mb-5">
          <div className="absolute inset-0 bg-[var(--accent)]/20 rounded-2xl blur-xl" />
          <div className="relative w-16 h-16 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shadow-sm">
            <Icon size={28} strokeWidth={2.2} />
          </div>
        </div>
      )}
      <h3 className="font-extrabold text-xl text-[var(--text-main)] mb-1.5 tracking-tight">{title}</h3>
      {subtitle && (
        <p className="text-sm font-medium text-[var(--text-muted)] max-w-sm mb-7 leading-relaxed">
          {subtitle}
        </p>
      )}
      {action}
    </div>
  )
}
