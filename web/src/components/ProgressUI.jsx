export const panel = 'rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 sm:p-7 space-y-4 shadow-xs card-hover'
export const control = 'max-w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-xs sm:text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition'
export const action = 'button-press rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-color-hover)] transition cursor-pointer disabled:opacity-40 select-none'
export const primary = action + ' bg-[var(--accent)] text-[var(--accent-fg)] border-transparent hover:brightness-110 shadow-sm shadow-[var(--accent)]/20 font-extrabold'

export function ResourceStatus({ resource }) {
  if (resource.error)
    return (
      <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3">
        <span>{resource.error}</span>
        {!resource.data && (
          <button onClick={resource.refresh} className="underline font-bold cursor-pointer">
            Retry
          </button>
        )}
      </div>
    )
  return !resource.data ? (
    <div className="flex items-center gap-2 py-4 text-xs font-medium text-[var(--text-muted)]">
      <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      <span role="status">Loading…</span>
    </div>
  ) : null
}

export function PersonLabel({ person }) {
  return (
    <span className="inline-flex items-center gap-1.5 break-words">
      {person.avatar && (
        <span aria-hidden="true" className="w-6 h-6 rounded-lg bg-[var(--bg-surface-elevated)] flex items-center justify-center text-sm shrink-0">
          {person.avatar}
        </span>
      )}
      <span className="font-bold text-[var(--text-main)]">{person.displayName}</span>
      <small className="text-xs font-semibold text-[var(--text-subtle)] font-mono-num">
        @{person.username}
      </small>
    </span>
  )
}
