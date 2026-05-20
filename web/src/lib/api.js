/** API root (empty = same origin). Set VITE_API_BASE_URL on Netlify. */
export function getApiRoot() {
  const base = import.meta.env.VITE_API_BASE_URL
  if (!base || typeof base !== 'string') return ''
  const trimmed = base.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/$/, '')
}

/** fetch with session cookie (guest or future server session). */
export function projectFetch(url, init = {}) {
  return fetch(url, { credentials: 'include', ...init })
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
  if (typeof data?.error === 'string' && data.error) return data.error
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
