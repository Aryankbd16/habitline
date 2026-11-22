import { useEffect, useState } from 'react'
import { todayStr } from './dateUtils'

export function useToday() {
  const [today, setToday] = useState(todayStr)
  useEffect(() => {
    let timeout
    const update = () => {
      clearTimeout(timeout)
      setToday(todayStr())
      const next = new Date()
      next.setHours(24, 0, 0, 0)
      timeout = setTimeout(update, next.getTime() - Date.now() + 50)
    }
    update()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return today
}
