export default function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl shadow-xs animate-rise">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center mb-4 text-[var(--accent)] shadow-xs">
          <Icon size={28} />
        </div>
      )}
      <h3 className="font-extrabold text-lg text-[var(--text-main)] mb-1">{title}</h3>
      {subtitle && <p className="text-sm font-medium text-[var(--text-muted)] max-w-sm mb-6 leading-relaxed">{subtitle}</p>}
      {action}
    </div>
  )
}
