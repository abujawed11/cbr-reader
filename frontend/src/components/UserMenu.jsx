import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function UserMenu() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.username}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-600 text-sm font-semibold uppercase text-white ring-2 ring-transparent transition hover:ring-accent-500/60"
      >
        {user.username.charAt(0)}
      </button>
      {open && (
        <div role="menu" className="animate-pop-in absolute right-0 top-11 w-60 overflow-hidden rounded-xl border border-ink-700 bg-ink-800 shadow-2xl">
          <div className="border-b border-ink-700 px-4 py-3">
            <p className="truncate text-sm font-semibold text-white">{user.username}</p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
            {user.role === 'admin' && (
              <span className="mt-2 inline-block rounded-full bg-accent-500/20 px-2 py-0.5 text-[11px] font-semibold text-accent-400">
                Admin
              </span>
            )}
          </div>
          <Link
            to="/my-library"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-slate-200 hover:bg-ink-700"
          >
            My library
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
            className="w-full border-t border-ink-700 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-ink-700"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
