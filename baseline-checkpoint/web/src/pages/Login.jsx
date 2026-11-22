import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Sparkles } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to keep your daily streak alive.">
      <form onSubmit={submit} className="space-y-4">
        <AuthField
          label="Email Address"
          type="email"
          value={form.email}
          onChange={(v) => setForm((f) => ({ ...f, email: v }))}
          autoComplete="email"
        />
        <AuthField
          label="Password"
          type="password"
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          autoComplete="current-password"
        />
        {error && <p className="text-sm font-semibold text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--accent)] text-[var(--accent-fg)] font-bold py-3.5 rounded-xl hover:brightness-110 active:scale-[0.98] transition shadow-md shadow-[var(--accent)]/20 cursor-pointer disabled:opacity-60 mt-2"
        >
          {loading ? 'Logging in…' : 'Log in to Habitline'}
        </button>
      </form>
      <p className="text-center text-sm font-medium text-[var(--text-muted)] mt-6">
        New to Habitline?{' '}
        <Link to="/signup" className="text-[var(--accent)] font-bold hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[var(--bg-app)] text-[var(--text-main)] transition-colors duration-200">
      <div className="w-full max-w-md animate-rise">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center font-extrabold text-2xl shadow-lg shadow-[var(--accent)]/25 mb-3 transition-transform hover:scale-105">
            H
          </div>
          <span className="font-extrabold text-2xl tracking-tight block">Habitline</span>
          <span className="text-xs font-semibold text-[var(--text-subtle)] tracking-wider uppercase flex items-center gap-1 mt-1">
            <Sparkles size={11} className="text-[var(--accent)]" /> Commercial Grade Routine Tracker
          </span>
        </div>
        
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] p-7 sm:p-8 rounded-3xl shadow-xl">
          <h1 className="text-2xl font-extrabold text-center text-[var(--text-main)] mb-1">{title}</h1>
          <p className="text-center text-sm font-medium text-[var(--text-muted)] mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

export function AuthField({ label, type = 'text', value, onChange, autoComplete, required = true }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] placeholder-[var(--text-subtle)] rounded-xl px-4 py-3 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] transition"
      />
    </label>
  )
}
