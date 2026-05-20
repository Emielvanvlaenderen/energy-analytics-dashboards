import { useState } from 'react'
import { useAuth } from './AuthContext'
import {
  formatApiError,
  jsonBodyWithGuest,
  parseApiResponse,
  projectFetch,
} from './lib/api'
import { readStoredGuestId } from './lib/guestSession'

export function SaveSimulationActions({ apiBase, selectedFile, saveLabel }) {
  const { user, accessToken, signInWithGitHub, supabaseConfigured } = useAuth()
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState(null)

  const canSave = Boolean(saveLabel?.trim() && selectedFile)

  async function downloadGuestCsv() {
    if (!selectedFile) {
      setMessage('Select a run first.')
      return
    }
    setDownloading(true)
    setMessage(null)
    try {
      const q = new URLSearchParams({ file: selectedFile })
      const guestId = readStoredGuestId()
      if (guestId) q.set('guestSessionId', guestId)

      const res = await projectFetch(`${apiBase}/bess-results/download?${q}`)
      if (!res.ok) {
        const { data } = await parseApiResponse(res)
        setMessage(formatApiError(res, data, 'Could not download CSV.'))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = selectedFile
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not download CSV.')
    } finally {
      setDownloading(false)
    }
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
      const headers = { 'Content-Type': 'application/json' }
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`

      const res = await projectFetch(`${apiBase}/saved-simulations`, {
        method: 'POST',
        headers,
        body: jsonBodyWithGuest({
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
          disabled={!selectedFile || downloading}
          onClick={downloadGuestCsv}
        >
          {downloading ? 'Downloading…' : 'Download CSV'}
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
