import { api } from './api'

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export const getGoals = async () => (await api('/goals?timeZone=' + encodeURIComponent(timeZone()))).goals
export const getMilestones = async () => (await api('/milestones?timeZone=' + encodeURIComponent(timeZone()))).milestones

export function saveGoal(goal, id) {
  return api(id ? '/goals/' + encodeURIComponent(id) : '/goals', {
    method: id ? 'PATCH' : 'POST', body: { goal, timeZone: timeZone() },
  })
}

export const deleteGoal = (id) => api('/goals/' + encodeURIComponent(id), { method: 'DELETE' })
