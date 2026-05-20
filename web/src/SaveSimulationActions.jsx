import { useState } from 'react'
import { useAuth } from './AuthContext'
import { apiFetch, getApiRoot } from './lib/api'

export function SaveSimulationActions({
  apiBase,
  selectedFile,
  defaultName,
}) {
  const { user, accessToken, signInWithGitHub, supabaseConfigured } = useAuth()
  const [name, setName] = useState(defaultName ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  function downloadGuestCsv() {
    if (!selectedFile) {
      setMessage('Select a run first.')
      return
    }
    const q = new URLSearchParams({ file: selectedFile })
    const url = `${getApiRoot()}${apiBase}/bess-results/download?${q}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function saveToAccount() {
    if (!user) {
      sessionStorage.setItem('ea_auth_return', window.location.pathname)
      await signInWithGitHub()
      return
    }
    if (!name.trim()) {
      setMessage('Enter a name for this saved run.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await apiFetch(`${apiBase}/saved-simulations`, {
        method: 'POST',
        authToken: accessToken,
        body: JSON.stringify({ name: name.trim(), file: selectedFile }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setMessage(data.error || 'Could not save.')
        return
      }
      setMessage('Saved to your account.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel inputs-panel">
      <h2 className="panel__title">Export &amp; save</h2>
      <p className="panel__hint">
        Download the current run as CSV without signing in. To keep results on the
        server under your account, sign in with GitHub and save.
      </p>
      <div className="page-actions page-actions--solo" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!selectedFile}
          onClick={downloadGuestCsv}
        >
          Download CSV
        </button>
      </div>
      {supabaseConfigured ? (
        <>
          <label className="field field--stacked field--full">
            <span className="field__label">Save as (your account)</span>
            <input
              className="field__input field__input--sm"
              type="text"
              maxLength={64}
              placeholder="e.g. Depot evening V2G"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </label>
          <div className="page-actions page-actions--solo">
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving || !selectedFile}
              onClick={saveToAccount}
            >
              {saving
                ? 'Saving…'
                : user
                  ? 'Save to my account'
                  : 'Sign in with GitHub to save'}
            </button>
          </div>
        </>
      ) : (
        <p className="panel__hint">
          Account save is disabled until Supabase env vars are configured on the server.
        </p>
      )}
      {message ? (
        <p className="continue-section__error" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}
