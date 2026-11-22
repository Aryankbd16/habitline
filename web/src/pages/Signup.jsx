import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AuthShell, AuthField } from './Login'
import { FOCUS_AREAS, PRIMARY_GOALS } from '../lib/personalization'
import { ArrowRight } from 'lucide-react'

const GOALS = PRIMARY_GOALS

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    primaryGoal: '',
    profession: '',
    areasOfFocus: [],
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submitAccount = (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 6 || new TextEncoder().encode(form.password).length > 72) {
      setError('Enter a password of at least 6 characters and at most 72 UTF-8 bytes.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setStep(2)
  }

  const finish = async (e, skip = false) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signUp(skip ? { ...form, primaryGoal: null, profession: '', areasOfFocus: [] } : form)
      navigate('/')
    } catch (err) {
      setError(err.message)
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  if (step === 1) {
    return (
      <AuthShell title="Create your account" subtitle="Create an account on your Habitline server.">
        <form onSubmit={submitAccount} className="space-y-4">
          <AuthField
            label="Full Name"
            value={form.fullName}
            onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
            autoComplete="name"
          />
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
            autoComplete="new-password"
          />
          <AuthField
            label="Confirm Password"
            type="password"
            value={form.confirmPassword}
            onChange={(v) => setForm((f) => ({ ...f, confirmPassword: v }))}
            autoComplete="new-password"
          />
          {error && (
            <p className="text-xs font-bold text-rose-500 bg-rose-500/10 p-3.5 rounded-2xl border border-rose-500/20">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="button-press w-full bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold py-3.5 rounded-2xl hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-[var(--accent)]/25 cursor-pointer mt-2 text-sm flex items-center justify-center gap-2"
          >
            <span>Continue to Setup</span>
            <ArrowRight size={16} strokeWidth={2.6} />
          </button>
        </form>
        <p className="text-center text-xs sm:text-sm font-semibold text-[var(--text-muted)] mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-[var(--accent)] font-extrabold hover:underline">
            Log in
          </Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Personalize your dashboard"
      subtitle="Select your focus area so we can optimize your experience."
    >
      <form onSubmit={finish} className="space-y-4">
        <div>
          <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
            Primary Goal
          </span>
          <div className="grid grid-cols-2 gap-2">
            {GOALS.map((g) => (
              <button
                type="button"
                key={g}
                onClick={() => setForm((f) => ({ ...f, primaryGoal: g }))}
                className={`py-3 px-3 rounded-2xl text-xs font-bold transition cursor-pointer ${
                  form.primaryGoal === g
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs scale-102 font-extrabold'
                    : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-color)] hover:border-[var(--accent)]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <AuthField
          required={false}
          label="Profession / Role"
          value={form.profession}
          onChange={(v) => setForm((f) => ({ ...f, profession: v }))}
        />

        <div>
          <span className="block text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
            Areas of Focus (optional)
          </span>
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map((area) => {
              const selected = form.areasOfFocus.includes(area)
              return (
                <button
                  type="button"
                  key={area}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      areasOfFocus: selected
                        ? f.areasOfFocus.filter((x) => x !== area)
                        : [...f.areasOfFocus, area],
                    }))
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    selected
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs'
                      : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-color)] hover:border-[var(--border-color-hover)]'
                  }`}
                >
                  {area}
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="text-xs font-bold text-rose-500 bg-rose-500/10 p-3.5 rounded-2xl border border-rose-500/20">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={(event) => finish(event, true)}
            className="flex-1 py-3.5 rounded-2xl text-xs font-bold bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)] cursor-pointer transition"
          >
            Skip for now
          </button>
          <button
            type="submit"
            disabled={loading}
            className="button-press flex-1 bg-[var(--accent)] text-[var(--accent-fg)] font-extrabold py-3.5 rounded-2xl hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-[var(--accent)]/20 cursor-pointer disabled:opacity-60 text-xs"
          >
            {loading ? 'Creating…' : 'Finish Setup'}
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
