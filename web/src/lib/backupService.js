import { api } from './api'

const SCHEMA_VERSION = 2

export async function exportUserData(userId) {
  const [userResult, habitsResult, completionsResult, relationshipsResult] = await Promise.all([
    api(`/users/${encodeURIComponent(userId)}`),
    api('/habits'),
    api('/completions'),
    api('/habit-relationships'),
  ])
  const payload = { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), app: 'habitline', user: userResult.user, habits: habitsResult.habits, completions: completionsResult.completions, relationships: relationshipsResult.relationships, settings: [] }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `habit-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function importUserData(file) {
  let data
  try { data = JSON.parse(await file.text()) } catch { throw new Error('That file is not valid JSON. Export a backup from Habitline and try again.') }
  if (data?.app !== 'habitline' || !Array.isArray(data.habits)) throw new Error('This file does not look like a Habitline backup.')
  return api('/data/import', { method: 'POST', body: { habits: data.habits, completions: data.completions ?? [], relationships: data.relationships ?? [] } })
}

export async function resetAllData() {
  await api('/data', { method: 'DELETE' })
}
