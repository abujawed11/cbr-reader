import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BookIcon } from '../components/icons'

const baseField =
  'w-full rounded-lg border bg-ink-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2'
const fieldClass = (invalid) =>
  `${baseField} ${
    invalid
      ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30'
      : 'border-ink-600 focus:border-accent-500 focus:ring-accent-500/30'
  }`

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/

function Field({ label, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-300">
      {label}
      {children}
      {error ? (
        <span role="alert" className="text-xs font-normal text-red-400">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs font-normal text-slate-500">{hint}</span>
      )}
    </label>
  )
}

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup'
  const { user, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'

  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({}) // { field: message, form: message }
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((prev) => (prev[key] || prev.form ? { ...prev, [key]: undefined, form: undefined } : prev))
  }

  // Already signed in (or just signed in): go where the user was heading.
  if (!loading && user) return <Navigate to={from} replace />

  // Quick checks so people get instant feedback; the server re-validates everything.
  const validate = () => {
    const e = {}
    if (isSignup) {
      if (!USERNAME_RE.test(form.username)) e.username = '3–30 characters: letters, numbers, dot, dash or underscore'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Please enter a valid email address'
      if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
      if (form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match'
    } else {
      if (!form.username.trim()) e.username = 'Enter your username'
      if (!form.password) e.password = 'Enter your password'
    }
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      if (isSignup) await signUp(form)
      else await signIn({ username: form.username, password: form.password })
      navigate(from, { replace: true })
    } catch (err) {
      // Attach server errors to the offending field when we know it, otherwise show them above the button.
      setErrors(err.field && err.field in form ? { [err.field]: err.message } : { form: err.message })
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="animate-pop-in w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="rounded-xl bg-accent-600 p-2 text-white shadow-lg shadow-accent-600/30">
            <BookIcon className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold tracking-tight text-white">Bookshelf</span>
        </Link>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-ink-700 bg-ink-800 p-6 shadow-2xl sm:p-8">
          <div>
            <h1 className="text-xl font-semibold text-white">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {isSignup ? 'Sign up to upload books and unlock paid ones.' : 'Sign in to continue reading.'}
            </p>
          </div>

          <Field label="Username" error={errors.username} hint={isSignup ? 'Shown on your account. Must be unique.' : undefined}>
            <input
              value={form.username}
              onChange={set('username')}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
              className={fieldClass(errors.username)}
            />
          </Field>

          {isSignup && (
            <Field label="Email" error={errors.email}>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
                className={fieldClass(errors.email)}
              />
            </Field>
          )}

          <Field label="Password" error={errors.password} hint={isSignup ? 'At least 8 characters.' : undefined}>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              maxLength={72}
              className={fieldClass(errors.password)}
            />
          </Field>

          {isSignup && (
            <Field label="Confirm password" error={errors.confirmPassword}>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                autoComplete="new-password"
                maxLength={72}
                className={fieldClass(errors.confirmPassword)}
              />
            </Field>
          )}

          {errors.form && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {errors.form}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-600/20 transition hover:bg-accent-500 disabled:opacity-60"
          >
            {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
          </button>

          <p className="text-center text-sm text-slate-400">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Link
              to={isSignup ? '/login' : '/signup'}
              state={location.state}
              className="font-medium text-accent-400 hover:text-accent-500"
            >
              {isSignup ? 'Sign in' : 'Sign up'}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
