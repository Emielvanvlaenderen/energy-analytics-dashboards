import { useAuth } from './AuthContext'

export function AuthHeader() {
  const { user, displayName, loading, signInWithGitHub, signOut, supabaseConfigured } =
    useAuth()

  if (!supabaseConfigured) return null

  return (
    <div className="auth-header">
      {loading ? (
        <span className="auth-header__text">…</span>
      ) : user ? (
        <>
          <span className="auth-header__text" title={displayName ?? ''}>
            {displayName}
          </span>
          <button type="button" className="btn btn--ghost auth-header__btn" onClick={signOut}>
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn--ghost auth-header__btn"
          onClick={() => signInWithGitHub()}
        >
          Sign in with GitHub
        </button>
      )}
    </div>
  )
}
