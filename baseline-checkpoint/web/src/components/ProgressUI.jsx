export const panel = 'rounded-3xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 space-y-3'
export const control = 'max-w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm'
export const action = 'rounded-xl border border-[var(--border-color)] px-3 py-2 text-sm font-semibold disabled:opacity-50'
export const primary = action + ' bg-[var(--accent)] text-[var(--accent-fg)]'

export function ResourceStatus({ resource }) {
  if (resource.error) return <p role="alert" className="text-sm text-rose-500">{resource.error}{!resource.data && <button onClick={resource.refresh} className="ml-2 underline">Retry</button>}</p>
  return !resource.data && <p role="status">Loading…</p>
}

export function PersonLabel({ person }) {
  return <span className="break-words">{person.avatar && <span aria-hidden="true" className="mr-1">{person.avatar}</span>}{person.displayName} <small className="text-[var(--text-muted)]">@{person.username}</small></span>
}
