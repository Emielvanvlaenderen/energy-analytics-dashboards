/** Persists guest workspace id when third-party cookies to Render are blocked. */
export const GUEST_STORAGE_KEY = 'ea_guest_id'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isGuestSessionId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function readStoredGuestId() {
  try {
    const fromSession = sessionStorage.getItem(GUEST_STORAGE_KEY)
    if (isGuestSessionId(fromSession)) return fromSession
    const fromLocal = localStorage.getItem(GUEST_STORAGE_KEY)
    return isGuestSessionId(fromLocal) ? fromLocal : null
  } catch {
    return null
  }
}

export function storeGuestId(id) {
  if (!isGuestSessionId(id)) return
  try {
    sessionStorage.setItem(GUEST_STORAGE_KEY, id)
    localStorage.setItem(GUEST_STORAGE_KEY, id)
  } catch {
    /* private mode */
  }
}
