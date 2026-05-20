/** API root (empty = same origin). Set VITE_API_BASE_URL on Netlify. */
export function getApiRoot() {
  const base = import.meta.env.VITE_API_BASE_URL
  if (!base || typeof base !== 'string') return ''
  const trimmed = base.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/$/, '')
}

import { readStoredGuestId, storeGuestId } from './guestSession.js'

function rememberGuestFromJson(data) {
  if (data?.guestSessionId) storeGuestId(data.guestSessionId)
}

/** JSON POST body with stable guestSessionId (cookies often blocked Netlify → Render). */
export function jsonBodyWithGuest(payload) {
  const guestId = readStoredGuestId()
  if (!guestId) return JSON.stringify(payload)
  return JSON.stringify({ ...payload, guestSessionId: guestId })
}

/** fetch with guest cookie + X-EA-Guest header + guestSessionId in JSON bodies. */
export function projectFetch(url, init = {}) {
  const headers = new Headers(init.headers || {})
  const guestId = readStoredGuestId()
  if (guestId) headers.set('X-EA-Guest', guestId)

  let body = init.body
  if (guestId && typeof body === 'string') {
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object' && !parsed.guestSessionId) {
        body = JSON.stringify({ ...parsed, guestSessionId: guestId })
      }
    } catch {
      /* not JSON */
    }
  }

  return fetch(url, { ...init, headers, body, credentials: 'include' }).then(
    async (res) => {
      const returned = res.headers.get('X-EA-Guest')
      if (returned) storeGuestId(returned)

      if (res.ok) {
        try {
          const data = await res.clone().json()
          rememberGuestFromJson(data)
        } catch {
          /* not JSON */
        }
      }
      return res
    },
  )
}

/** Parse JSON API body; surface HTML/proxy errors as readable messages. */
export async function parseApiResponse(res) {
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 100)
    const isNetlify404 =
      text.includes('Page not found') && text.includes("doesn’t exist on this site")
    data = {
      ok: false,
      error: isNetlify404
        ? 'Netlify returned 404 for this API path. Add redirect: /api/* → https://energy-analytics-api-5u38.onrender.com/api/:splat (200), then redeploy.'
        : res.ok
          ? 'Invalid JSON from API'
          : `HTTP ${res.status}${snippet ? ` — ${snippet}` : ''}`,
    }
  }
  rememberGuestFromJson(data)
  return { res, data }
}

export function formatApiError(res, data, fallback) {
  if (data?.error === 'usage_exceeded' || data?.message === 'Usage exceeded') {
    return (
      'Render free tier usage limit reached. Open the Render dashboard → your service ' +
      '(resume or upgrade to Starter), or use the app locally with npm run dev. ' +
      'Limits reset monthly.'
    )
  }
  if (typeof data?.error === 'string' && data.error) {
    if (data.guestSessionId && data.workspaceId) {
      return `${data.error} (workspace: ${data.workspaceId})`
    }
    return data.error
  }
  if (typeof data?.message === 'string' && data.message) return data.message
  if (res.status === 502 || res.status === 503) {
    return 'API server is waking up or unavailable (Render free tier). Wait 30–60 seconds, or check Render dashboard.'
  }
  if (res.status === 504) {
    return 'API request timed out. Try again in a moment.'
  }
  return fallback || `Request failed (HTTP ${res.status})`
}

export async function apiFetch(path, { authToken, headers: extra, ...init } = {}) {
  const url = `${getApiRoot()}${path.startsWith('/') ? path : `/${path}`}`
  const headers = { ...extra }
  if (init.body != null && !headers['Content-Type'] && !(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }
  return fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  })
}
