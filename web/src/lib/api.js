/** API root (empty = same origin). Set VITE_API_BASE_URL on Netlify. */
export function getApiRoot() {
  const base = import.meta.env.VITE_API_BASE_URL
  if (!base || typeof base !== 'string') return ''
  return base.replace(/\/$/, '')
}

/** fetch with session cookie (guest or future server session). */
export function projectFetch(url, init = {}) {
  return fetch(url, { credentials: 'include', ...init })
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
