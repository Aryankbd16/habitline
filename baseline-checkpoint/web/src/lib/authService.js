import { api } from './api'

export async function signUp({ fullName, email, password, primaryGoal, profession, areasOfFocus }) {
  const { user } = await api('/auth/signup', { method: 'POST', body: {
    fullName, email, password, onboarding: { primaryGoal: primaryGoal || null, profession, areasOfFocus },
  } })
  return user
}

export async function login({ email, password }) {
  const { user } = await api('/auth/login', { method: 'POST', body: { email, password } })
  return user
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' })
}

export async function getCurrentUser() {
  localStorage.removeItem('habitline:session-user-id')
  try {
    const { user } = await api('/auth/session')
    return user
  } catch (error) {
    if (error.status === 401) return null
    throw error
  }
}

export async function updateUser(userId, changes) {
  const { user } = await api(`/users/${userId}`, { method: 'PATCH', body: { changes } })
  return user
}

export async function updatePersonalization(personalization) {
  const { user } = await api('/profile/personalization', { method: 'PUT', body: { personalization } })
  return user
}
