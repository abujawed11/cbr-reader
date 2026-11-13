import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // true until the first /me check finishes

  useEffect(() => {
    let cancelled = false
    api
      .fetchMe()
      .then((u) => !cancelled && setUser(u))
      .catch(() => {}) // server unreachable: stay logged out
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (credentials) => {
    const u = await api.login(credentials)
    setUser(u)
    return u
  }, [])

  const signUp = useCallback(async (details) => {
    const u = await api.signup(details)
    setUser(u)
    return u
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, loading, signIn, signUp, signOut }), [user, loading, signIn, signUp, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
