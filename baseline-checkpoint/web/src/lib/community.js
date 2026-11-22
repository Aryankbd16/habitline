import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
export const timeQuery = () => 'timeZone=' + encodeURIComponent(timezone())
export const social = (path, method = 'GET', body) => api('/social' + path, { method, body })

export function useResource(load) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    let active = true
    load().then((value) => { if (active) { setData(value); setError('') } })
      .catch((reason) => { if (active) { setData(null); setError(reason.message) } })
    return () => { active = false }
  }, [load, revision])
  const run = async (action) => {
    setWorking(true)
    setError('')
    try {
      await action()
      refresh()
      return true
    } catch (reason) {
      setError(reason.message)
      return false
    } finally {
      setWorking(false)
    }
  }
  return { data, error, working, refresh, run }
}
