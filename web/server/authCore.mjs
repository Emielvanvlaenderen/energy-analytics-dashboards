import { createClient } from '@supabase/supabase-js'

let adminClient = null

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
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
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_ANON_KEY,
  )
}

/** @returns {Promise<{ id: string, email?: string, user_metadata?: object } | null>} */
export async function verifyBearerToken(req) {
  const header = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) return null

  const admin = getSupabaseAdmin()
  if (!admin) return null

  const token = match[1].trim()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
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
