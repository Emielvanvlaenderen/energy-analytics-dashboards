import { createClient } from '@supabase/supabase-js'

let adminClient = null

function env(name) {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : ''
}

export function getSupabaseAdmin() {
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return adminClient
}

export function isSupabaseConfigured() {
  return Boolean(
    env('SUPABASE_URL') &&
      env('SUPABASE_SERVICE_ROLE_KEY') &&
      env('SUPABASE_ANON_KEY'),
  )
}

function supabaseAuthBaseUrl() {
  return env('SUPABASE_URL').replace(/\/$/, '')
}

function supabaseApiKey() {
  return env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY')
}

/**
 * Validate user JWT via Supabase Auth REST API (reliable on Node/Render).
 * @returns {Promise<{ id: string, email?: string, user_metadata?: object } | null>}
 */
export async function verifyBearerToken(req) {
  const header = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) return null

  const url = supabaseAuthBaseUrl()
  const apikey = supabaseApiKey()
  if (!url || !apikey) {
    console.warn('[auth] Missing SUPABASE_URL or API key on server')
    return null
  }

  const token = match[1].trim()

  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey,
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(
        `[auth] /auth/v1/user ${res.status}`,
        body.slice(0, 240) || res.statusText,
      )
      return null
    }

    const user = await res.json()
    if (!user?.id) return null
    return user
  } catch (e) {
    console.warn('[auth] verify error', e instanceof Error ? e.message : e)
    return null
  }
}

export async function attachAuth(req, res, next) {
  try {
    const user = await verifyBearerToken(req)
    if (user) req.authUser = user
  } catch {
    /* guest-only */
  }
  next()
}
