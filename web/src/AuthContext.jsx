import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch } from './lib/api'
import { supabase, supabaseConfigured } from './lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(supabaseConfigured)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return undefined
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const signInWithGitHub = useCallback(async () => {
    if (!supabase) return
    const redirectTo = `${window.location.origin}/auth/callback`
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo },
    })
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }, [])

  const accessToken = session?.access_token ?? null

  const value = useMemo(
    () => ({
      user,
      session,
      accessToken,
      loading,
      supabaseConfigured,
      signInWithGitHub,
      signOut,
      displayName:
        user?.user_metadata?.user_name ||
        user?.user_metadata?.full_name ||
        user?.email ||
        null,
    }),
    [user, session, accessToken, loading, signInWithGitHub, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Sync profile from Supabase JWT to server (optional). */
export function useMe() {
  const { accessToken } = useAuth()
  const [me, setMe] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await apiFetch('/api/me', {
        authToken: accessToken ?? undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!cancelled && data.ok) setMe(data.user)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  return me
}
