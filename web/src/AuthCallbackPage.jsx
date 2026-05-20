import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!supabase) {
      setError('Sign-in is not configured.')
      return
    }
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (err) {
        setError(err.message)
        return
      }
      if (data.session) {
        const returnTo = sessionStorage.getItem('ea_auth_return') || '/'
        sessionStorage.removeItem('ea_auth_return')
        navigate(returnTo, { replace: true })
      } else {
        setError('No session returned from GitHub.')
      }
    })
  }, [navigate])

  return (
    <div className="inputs-page" style={{ padding: 48 }}>
      <h1 className="page-head__title">Signing in…</h1>
      {error ? <p className="continue-section__error">{error}</p> : null}
    </div>
  )
}
