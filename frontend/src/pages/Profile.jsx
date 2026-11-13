import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { changePassword, deleteAccount, updateEmail } from '../api'
import { useAuth } from '../auth/AuthContext'
import { Field, PasswordInput, fieldClass } from '../components/form'
import { ChevronLeftIcon } from '../components/icons'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Card({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-800 p-6 shadow-xl sm:p-8">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function EmailCard() {
  const { user, setUser } = useAuth()
  const [email, setEmail] = useState(user.email)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setDone(false)
    if (!EMAIL_RE.test(email)) return setError('Please enter a valid email address')
    setBusy(true)
    try {
      const updated = await updateEmail(email)
      setUser(updated)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Email address" description="Used to sign in and, in the future, for receipts.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" error={error}>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
              setDone(false)
            }}
            autoComplete="email"
            className={fieldClass(error)}
          />
        </Field>
        {done && <p className="text-sm text-emerald-400">Email updated.</p>}
        <button
          type="submit"
          disabled={busy || email === user.email}
          className="self-start rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-600/20 transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save email'}
        </button>
      </form>
    </Card>
  )
}

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((prev) => (prev[key] || prev.form ? { ...prev, [key]: undefined, form: undefined } : prev))
    setDone(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (!form.currentPassword) found.currentPassword = 'Enter your current password'
    if (form.newPassword.length < 8) found.newPassword = 'Password must be at least 8 characters'
    if (form.newPassword !== form.confirmNewPassword) found.confirmNewPassword = 'Passwords do not match'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      await changePassword(form)
      setForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
      setDone(true)
    } catch (err) {
      setErrors(err.field && err.field in form ? { [err.field]: err.message } : { form: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Current password" error={errors.currentPassword}>
          <PasswordInput
            value={form.currentPassword}
            onChange={set('currentPassword')}
            autoComplete="current-password"
            maxLength={72}
            className={fieldClass(errors.currentPassword)}
          />
        </Field>
        <Field label="New password" error={errors.newPassword} hint="At least 8 characters.">
          <PasswordInput
            value={form.newPassword}
            onChange={set('newPassword')}
            autoComplete="new-password"
            maxLength={72}
            className={fieldClass(errors.newPassword)}
          />
        </Field>
        <Field label="Confirm new password" error={errors.confirmNewPassword}>
          <PasswordInput
            value={form.confirmNewPassword}
            onChange={set('confirmNewPassword')}
            autoComplete="new-password"
            maxLength={72}
            className={fieldClass(errors.confirmNewPassword)}
          />
        </Field>
        {errors.form && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errors.form}
          </p>
        )}
        {done && <p className="text-sm text-emerald-400">Password changed.</p>}
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-600/20 transition hover:bg-accent-500 disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </Card>
  )
}

function DeleteAccountCard() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await deleteAccount(password)
      await signOut()
      navigate('/')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Card title="Delete account" description="This permanently removes your account. It cannot be undone.">
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
        >
          Delete my account
        </button>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Confirm your password" error={error}>
            <PasswordInput
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              autoComplete="current-password"
              maxLength={72}
              className={fieldClass(error)}
            />
          </Field>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy || !password}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Permanently delete'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false)
                setPassword('')
                setError('')
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-ink-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  )
}

export default function Profile() {
  const { user, loading } = useAuth()
  if (!loading && !user) return <Navigate to="/login" state={{ from: '/profile' }} replace />
  if (!user) return null

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-700/70 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="rounded-lg p-2 text-slate-300 hover:bg-ink-700 hover:text-white" title="Back to library" aria-label="Back to library">
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="font-display text-lg font-bold tracking-tight text-white">Account settings</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
        <EmailCard />
        <PasswordCard />
        <DeleteAccountCard />
      </main>
    </div>
  )
}
