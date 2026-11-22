import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'habitline:theme'
const ACCENT_KEY = 'habitline:accent'

export const ACCENT_OPTIONS = [
  { id: 'amber', label: 'Amber', hex: '#e8a43f' },
  { id: 'teal', label: 'Teal', hex: '#4fb8ac' },
  { id: 'coral', label: 'Coral', hex: '#e2765f' },
  { id: 'violet', label: 'Violet', hex: '#a78bd6' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'indigo', label: 'Indigo', hex: '#6366f1' },
  { id: 'purple', label: 'Purple', hex: '#a855f7' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'lime', label: 'Lime', hex: '#84cc16' },
  { id: 'orange', label: 'Orange', hex: '#ff7849' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
]

function applyTheme(mode) {
  const root = document.documentElement
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode
  root.classList.toggle('light', resolved === 'light')
}

function applyAccent(accentId) {
  const accent = ACCENT_OPTIONS.find((a) => a.id === accentId) || ACCENT_OPTIONS[0]
  const root = document.documentElement
  root.style.setProperty('--accent-base', accent.hex)
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'dark')
  const [accent, setAccentState] = useState(() => localStorage.getItem(ACCENT_KEY) || 'amber')

  useEffect(() => {
    applyTheme(mode)
    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [mode])

  useEffect(() => {
    applyAccent(accent)
  }, [accent])

  const setMode = (m) => {
    localStorage.setItem(STORAGE_KEY, m)
    setModeState(m)
  }
  const setAccent = (a) => {
    localStorage.setItem(ACCENT_KEY, a)
    setAccentState(a)
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
