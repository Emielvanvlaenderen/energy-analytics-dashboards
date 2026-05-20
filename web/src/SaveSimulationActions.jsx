import { useState } from 'react'
import { useAuth } from './AuthContext'
import { apiFetch, formatApiError, parseApiResponse } from './lib/api'

export function SaveSimulationActions({ apiBase, selectedFile, saveLabel }) {
  const { user, accessToken, signInWithGitHub, supabaseConfigured } = useAuth()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const canSave = Boolean(saveLabel?.trim() && selectedFile)

  function downloadGuestCsv() {
    if (!selectedFile) {
      setMessage('Select a run first.')
      return
    }
    const q = new URLSearchParams({ file: selectedFile })
    const url = `${apiBase}/bess-results/download?${q}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function saveToAccount() {
    if (!user) {
      sessionStorage.setItem('ea_auth_return', window.location.pathname)
      await signInWithGitHub()
      return
    }
    if (!canSave) {
      setMessage('Select a run first.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await apiFetch(`${apiBase}/saved-simulations`, {
        method: 'POST',
        authToken: accessToken,
        body: JSON.stringify({
          name: saveLabel.trim(),
          file: selectedFile,
        }),
      })
      const { data } = await parseApiResponse(res)
      if (!res.ok || !data.ok) {
        setMessage(formatApiError(res, data, 'Could not save.'))
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
    <section
      className="panel inputs-panel results-page__export"
      aria-label="Export and save"
    >
      <div className="page-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!selectedFile}
          onClick={downloadGuestCsv}
        >
          Download CSV
        </button>
        {supabaseConfigured ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || (user ? !canSave : false)}
            onClick={saveToAccount}
          >
            {saving
              ? 'Saving…'
              : user
                ? 'Save to my account'
                : 'Sign in with GitHub to save'}
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="continue-section__error" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}
