import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme, ACCENT_OPTIONS } from '../context/ThemeContext'
import { useHabits } from '../context/HabitsContext'
import { exportUserData, importUserData, resetAllData } from '../lib/backupService'
import { Sun, Moon, Monitor, Download, Upload, Trash2, LogOut, Archive, Check } from 'lucide-react'

export default function Settings() {
  const { user, logout } = useAuth()
  const { mode, setMode, accent, setAccent } = useTheme()
  const { habits, reload, editHabit, deleteHabit } = useHabits()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [message, setMessage] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const archivedHabits = habits.filter((h) => h.isArchived)

  const reportFailure = (action) => async () => {
    setMessage('')
    try { await action() } catch (error) { setMessage(error.message) }
  }

  const handleExport = reportFailure(() => exportUserData(user.id))

  const handleImportClick = () => fileInputRef.current?.click()

  const handleImportFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const res = await importUserData(file)
      await reload()
      setMessage(`Imported ${res.habitsImported} habits and ${res.completionsImported} completions.`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      e.target.value = ''
    }
  }

  const handleReset = reportFailure(async () => {
    await resetAllData()
    await reload()
    setConfirmReset(false)
    setMessage('All habit data has been cleared.')
  })

  const handleLogout = reportFailure(async () => {
    await logout()
    navigate('/login')
  })

  return (
    <div className="space-y-8 animate-rise">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-main)]">Settings</h1>
      </div>

      <Section title="Appearance & Theme">
        <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-2.5">Theme Mode</p>
        <div className="flex gap-3 mb-6">
          {[
            { id: 'light', icon: Sun, label: 'Light' },
            { id: 'dark', icon: Moon, label: 'Dark' },
            { id: 'system', icon: Monitor, label: 'System' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex-1 flex flex-col items-center gap-2 py-3.5 px-3 rounded-2xl text-xs font-extrabold transition cursor-pointer ${
                mode === id
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-md shadow-[var(--accent)]/20'
                  : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)]'
              }`}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>

        <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-2.5">
          Accent Color Palette ({ACCENT_OPTIONS.length} Colors)
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {ACCENT_OPTIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccent(a.id)}
              aria-label={a.label}
              title={a.label}
              className={`group flex flex-col items-center gap-1.5 p-2 rounded-xl border transition cursor-pointer ${
                accent === a.id
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs'
                  : 'border-[var(--border-color)] hover:border-[var(--border-color-hover)] bg-[var(--bg-surface-elevated)]'
              }`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 shadow-xs"
                style={{ backgroundColor: a.hex }}
              >
                {accent === a.id && <Check size={16} className="text-black" strokeWidth={3} />}
              </div>
              <span className="text-[10px] font-bold text-[var(--text-subtle)] truncate w-full text-center">{a.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Habits Management">
        <SettingsRow icon={Archive} label={`Archived Habits (${archivedHabits.length})`} description="Habits removed from daily schedule without losing past history.">
          {archivedHabits.length === 0 ? (
            <p className="text-xs font-semibold text-[var(--text-subtle)] mt-2">No archived habits.</p>
          ) : (
            <div className="space-y-2 mt-3 w-full">
              {archivedHabits.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] rounded-xl px-4 py-2.5">
                  <span className="font-bold text-[var(--text-main)] flex items-center gap-2">
                    <span>{h.icon}</span> {h.name}
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={reportFailure(() => editHabit(h.id, { isArchived: false }))}
                      className="text-xs font-bold text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Restore
                    </button>
                    <button
                      onClick={reportFailure(async () => { if (confirm(`Permanently delete "${h.name}" and all its history?`)) await deleteHabit(h.id) })}
                      className="text-xs font-bold text-rose-500 hover:underline cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SettingsRow>
      </Section>

      <Section title="Data & Backups">
        <SettingsRow icon={Download} label="Export User Data" description="Download habits, completions and relationships as a JSON backup.">
          <button onClick={handleExport} className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 shadow-xs cursor-pointer">
            Export JSON
          </button>
        </SettingsRow>
        <SettingsRow icon={Upload} label="Import Backup File" description="Restore habits and history from a previous export file.">
          <button onClick={handleImportClick} className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--bg-surface-elevated)] text-[var(--text-main)] border border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)] cursor-pointer">
            Choose File
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
        </SettingsRow>
        <SettingsRow icon={Trash2} label="Clear All Data" description="Permanently delete all habits and history. Cannot be undone.">
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30 hover:bg-rose-500/25 cursor-pointer">
              Reset All Data
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setConfirmReset(false)} className="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--bg-surface-elevated)] text-[var(--text-main)] border border-[var(--border-color)] cursor-pointer">
                Cancel
              </button>
              <button onClick={handleReset} className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white shadow-xs hover:bg-rose-600 cursor-pointer">
                Confirm Reset
              </button>
            </div>
          )}
        </SettingsRow>

        {message && <p className="text-xs font-bold text-[var(--accent)] mt-3 p-3 bg-[var(--accent)]/10 rounded-xl border border-[var(--accent)]/30">{message}</p>}
      </Section>

      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-bold bg-rose-500/10 text-rose-500 border border-rose-500/25 hover:bg-rose-500/20 transition cursor-pointer"
      >
        <LogOut size={18} /> Log Out of Account
      </button>

      <p className="text-[11px] text-[var(--text-subtle)] text-center leading-relaxed pb-4 max-w-lg mx-auto font-medium">
        Habit records are stored on your Habitline server.
      </p>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 shadow-xs">
      <h3 className="font-extrabold text-base text-[var(--text-main)] mb-5">{title}</h3>
      {children}
    </div>
  )
}

function SettingsRow({ icon: Icon, label, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 border-b border-[var(--border-color)] last:border-0 last:pb-0">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && <Icon size={18} className="mt-0.5 text-[var(--text-subtle)] shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-main)]">{label}</p>
          {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
          {children && typeof children !== 'undefined' && Icon === Archive ? children : null}
        </div>
      </div>
      {Icon !== Archive && <div className="shrink-0 self-end sm:self-center">{children}</div>}
    </div>
  )
}
