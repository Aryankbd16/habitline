import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Sparkles, ArrowRight } from 'lucide-react'

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
        {error && (
          <p className="text-xs font-bold text-rose-500 bg-rose-500/10 p-3.5 rounded-2xl border border-rose-500/20">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="button-press w-full bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold py-3.5 rounded-2xl hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-[var(--accent)]/25 cursor-pointer disabled:opacity-60 text-sm mt-2 flex items-center justify-center gap-2"
        >
          {loading ? 'Logging in…' : 'Log in to Habitline'}
          {!loading && <ArrowRight size={16} strokeWidth={2.6} />}
        </button>
      </form>
      <p className="text-center text-xs sm:text-sm font-semibold text-[var(--text-muted)] mt-6">
        New to Habitline?{' '}
        <Link to="/signup" className="text-[var(--accent)] font-extrabold hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[var(--bg-app)] text-[var(--text-main)] transition-colors duration-200 relative overflow-hidden">
      {/* Background ambient mesh */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-[var(--accent)]/12 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-md animate-rise">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-14 h-14 rounded-3xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-base)] text-[var(--accent-fg)] flex items-center justify-center font-extrabold text-2xl shadow-xl shadow-[var(--accent)]/30 mb-3.5 transition-transform hover:scale-105">
            H
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[var(--bg-surface)]" />
          </div>
          <span className="font-extrabold text-2xl sm:text-3xl tracking-tight block">Habitline</span>
          <span className="text-[11px] font-bold text-[var(--text-subtle)] tracking-widest uppercase flex items-center gap-1.5 mt-1.5">
            <Sparkles size={11} className="text-[var(--accent)]" /> Routine OS
          </span>
        </div>

        {/* Card */}
        <div
          className="bg-[var(--bg-surface)] border border-[var(--border-color)] p-7 sm:p-9 rounded-3xl shadow-xl relative"
          style={{
            boxShadow: '0 20px 50px -12px rgba(0,0,0,0.4), inset 0 1px 0 0 rgba(255,255,255,0.08)',
          }}
        >
          <h1 className="text-2xl font-extrabold text-center text-[var(--text-main)] mb-1.5 tracking-tight">
            {title}
          </h1>
          <p className="text-center text-xs sm:text-sm font-medium text-[var(--text-muted)] mb-7 leading-relaxed">
            {subtitle}
          </p>
          {children}
        </div>
      </div>
    </div>
  )
}

export function AuthField({ label, type = 'text', value, onChange, autoComplete, required = true }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
        {label}
      </span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full bg-[var(--bg-surface-elevated)] text-[var(--text-main)] placeholder-[var(--text-subtle)] rounded-2xl px-4 py-3.5 text-sm outline-none border border-[var(--border-color)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition font-medium"
      />
    </label>
  )
}
