import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import * as habitService from '../lib/habitService'

const HabitsContext = createContext(null)

export function HabitsProvider({ children }) {
  const { user } = useAuth()
  return <AccountHabits key={user?.id} userId={user?.id}>{children}</AccountHabits>
}

function AccountHabits({ userId, children }) {
  const [habits, setHabits] = useState([])
  const [completions, setCompletions] = useState([]) // ALL completions for user
  const [relationships, setRelationships] = useState([])
  const [loading, setLoading] = useState(Boolean(userId))
  const [awards, setAwards] = useState([])
  const [error, setError] = useState('')
  const request = useRef(0)
  const completionVersion = useRef(0)

  const reload = useCallback(async () => {
    if (!userId) return
    const next = ++request.current
    const version = completionVersion.current
    try {
      const [h, c, r] = await Promise.all([
        habitService.getUserHabits(),
        habitService.getAllCompletions(),
        habitService.getHabitRelationships(),
      ])
      if (request.current !== next) return
      setHabits(h)
      if (version === completionVersion.current) setCompletions(c)
      setRelationships(r)
      setError('')
    } catch (error) {
      if (request.current === next) setError(error.message)
    } finally {
      if (request.current === next) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    reload()
  }, [reload])

  const addHabit = useCallback(
    async (input) => {
      await habitService.createHabit(input)
      await reload()
    },
    [reload]
  )

  const editHabit = useCallback(
    async (habitId, changes) => {
      await habitService.updateHabit(habitId, changes)
      await reload()
    },
    [reload]
  )

  const deleteHabit = useCallback(
    async (habitId) => {
      await habitService.deleteHabitPermanently(habitId)
      await reload()
    },
    [reload]
  )

  const setCompletion = useCallback(
    async (habitId, date, completed) => {
      const { completion, awards: earned } = await habitService.setCompletion(habitId, date, completed)
      completionVersion.current++
      if (earned?.length) setAwards((current) => [...current, ...earned])
      setCompletions((records) => {
        const remaining = records.filter((record) => record.habitId !== habitId || record.date !== date)
        return completion ? [...remaining, completion] : remaining
      })
    },
    []
  )

  const addRelationship = useCallback(async (habitId, relatedHabitId, relationshipType) => {
    await habitService.createHabitRelationship(habitId, relatedHabitId, relationshipType)
    await reload()
  }, [reload])

  const removeRelationship = useCallback(async (relationshipId) => {
    await habitService.deleteHabitRelationship(relationshipId)
    await reload()
  }, [reload])

  const activeHabits = useMemo(() => habits.filter((h) => !h.isArchived), [habits])

  const value = {
    habits,
    activeHabits,
    completions,
    relationships,
    loading,
    addHabit,
    editHabit,
    deleteHabit,
    setCompletion,
    awards,
    dismissAwards: () => setAwards([]),
    error,
    addRelationship,
    removeRelationship,
    reload,
  }

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>
}

export function useHabits() {
  const ctx = useContext(HabitsContext)
  if (!ctx) throw new Error('useHabits must be used within HabitsProvider')
  return ctx
}
