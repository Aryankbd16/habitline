import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as authService from '../lib/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [sessionError, setSessionError] = useState('')
  const restoreSession = useCallback(() => {
    setLoading(true)
    setSessionError('')
    return authService.getCurrentUser()
      .then(setUser)
      .catch((error) => setSessionError(error.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  const signUp = useCallback(async (payload) => {
    const u = await authService.signUp(payload)
    setUser(u)
    return u
  }, [])

  const login = useCallback(async (payload) => {
    const u = await authService.login(payload)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setUser(null)
  }, [])

  const updateProfile = useCallback(
    async (changes) => {
      if (!user) return
      const u = await authService.updateUser(user.id, changes)
      setUser(u)
      return u
    },
    [user]
  )

  const updatePersonalization = useCallback(async (personalization) => {
    if (!user) return
    const u = await authService.updatePersonalization(personalization)
    setUser(u)
    return u
  }, [user])

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionError, restoreSession, signUp, login, logout, updateProfile, updatePersonalization }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
