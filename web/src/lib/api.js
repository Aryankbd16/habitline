const API_BASE = import.meta.env.VITE_API_URL || '/api'

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'X-Habitline-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => { throw new Error('Could not reach the Habitline server. Check the connection and try again.') })
  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(payload?.error || 'The local database could not complete that request.'), { status: response.status })
  if (!payload) throw new Error('The server returned an unexpected response. Check the API configuration.')
  return payload
}
