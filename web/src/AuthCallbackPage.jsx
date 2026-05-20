import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!supabase) {
      setError('Sign-in is not configured.')
      return undefined
    }

    let done = false
    const finish = (session) => {
      if (done || !session) return
      done = true
      const returnTo = sessionStorage.getItem('ea_auth_return') || '/'
      sessionStorage.removeItem('ea_auth_return')
      navigate(returnTo, { replace: true })
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) finish(session)
    })

    ;(async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code')
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setError(exchangeError.message)
            return
          }
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()
        if (sessionError) {
          setError(sessionError.message)
          return
        }
        if (session) {
          finish(session)
          return
        }

        if (code) {
          await new Promise((r) => setTimeout(r, 2000))
          const { data: { session: retry } } = await supabase.auth.getSession()
          if (retry) {
            finish(retry)
            return
          }
        }

        if (!done) {
          setError(
            'No session returned from GitHub. Add this URL in Supabase → Authentication → Redirect URLs: ' +
              `${window.location.origin}/auth/callback`,
          )
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign-in failed.')
      }
    })()

    return () => subscription.unsubscribe()
  }, [navigate])

  return (
    <div className="inputs-page" style={{ padding: 48 }}>
      <h1 className="page-head__title">Signing in…</h1>
      {error ? <p className="continue-section__error">{error}</p> : null}
    </div>
  )
}
