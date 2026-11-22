import { api } from './api'
import { todayStr } from './dateUtils'

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export async function createHabit(input) {
  const { habit } = await api('/habits', {
    method: 'POST',
    body: { timeZone: timeZone(), habit: { ...input, startDate: input.startDate || todayStr() } },
  })
  return habit
}

export async function updateHabit(habitId, changes) {
  const { habit } = await api(`/habits/${encodeURIComponent(habitId)}`, {
    method: 'PATCH', body: { changes, date: todayStr(), timeZone: timeZone() },
  })
  return habit
}

export async function deleteHabitPermanently(habitId) {
  await api(`/habits/${encodeURIComponent(habitId)}`, { method: 'DELETE' })
}

export async function getUserHabits() {
  return (await api('/habits')).habits
}

export async function getAllCompletions() {
  return (await api('/completions')).completions
}

export async function setCompletion(habitId, date, completed) {
  return api('/completions', { method: 'PUT', body: { habitId, date, completed, timeZone: timeZone() } })
}

export async function getHabitRelationships() {
  return (await api('/habit-relationships')).relationships
}

export async function createHabitRelationship(habitId, relatedHabitId, relationshipType) {
  const { relationship } = await api('/habit-relationships', { method: 'POST', body: { habitId, relatedHabitId, relationshipType } })
  return relationship
}

export async function deleteHabitRelationship(relationshipId) {
  await api(`/habit-relationships/${encodeURIComponent(relationshipId)}`, { method: 'DELETE' })
}
