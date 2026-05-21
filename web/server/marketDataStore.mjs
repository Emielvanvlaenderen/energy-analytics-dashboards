/**
 * Shared GB market datasets in Supabase Storage (day-ahead + PV yield).
 */

import fs from 'fs'
import path from 'path'
import { getSupabaseAdmin, isSupabaseConfigured } from './authCore.mjs'
import { DAY_AHEAD_FILENAME } from './dayAheadPrices.mjs'
import { PV_LIVE_YIELD_FILENAME } from './pvLiveApi.mjs'

export const MARKET_DATA_BUCKET = 'market-data'
export const GB_DAY_AHEAD_STORAGE_PATH = 'gb/day-ahead-prices.csv'
export const GB_PV_YIELD_STORAGE_PATH = `gb/${PV_LIVE_YIELD_FILENAME}`
export const GB_MANIFEST_STORAGE_PATH = 'gb/manifest.json'

export function isMarketDataStoreConfigured() {
  return isSupabaseConfigured()
}

function adminOrThrow() {
  const admin = getSupabaseAdmin()
  if (!admin) {
    throw new Error('Supabase is not configured (market-data store unavailable).')
  }
  return admin
}

/** @returns {Promise<object | null>} */
export async function readMarketDataManifest() {
  if (!isMarketDataStoreConfigured()) return null
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.storage
    .from(MARKET_DATA_BUCKET)
    .download(GB_MANIFEST_STORAGE_PATH)
  if (error || !data) return null
  try {
    return JSON.parse(await data.text())
  } catch {
    return null
  }
}

/**
 * @param {string} storagePath
 * @param {string} destPath
 * @returns {Promise<boolean>}
 */
export async function downloadMarketDataFile(storagePath, destPath) {
  const admin = adminOrThrow()
  const { data, error } = await admin.storage
    .from(MARKET_DATA_BUCKET)
    .download(storagePath)
  if (error || !data) {
    throw new Error(error?.message || `Missing ${storagePath} in ${MARKET_DATA_BUCKET}`)
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, Buffer.from(await data.arrayBuffer()))
  return true
}

/**
 * @param {string} storagePath
 * @param {string | Buffer} body
 * @param {string} contentType
 */
export async function uploadMarketDataFile(storagePath, body, contentType) {
  const admin = adminOrThrow()
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  const { error } = await admin.storage.from(MARKET_DATA_BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(error.message)
}

export async function writeMarketDataManifest(manifest) {
  await uploadMarketDataFile(
    GB_MANIFEST_STORAGE_PATH,
    JSON.stringify(manifest, null, 2) + '\n',
    'application/json',
  )
}

/**
 * @param {{ dataset: string, status: string, message?: string, lastUtc?: string, rowCount?: number }} entry
 */
export async function logMarketDataRefresh(entry) {
  if (!isMarketDataStoreConfigured()) return
  const admin = getSupabaseAdmin()
  await admin.from('market_data_refresh_log').insert({
    dataset: entry.dataset,
    status: entry.status,
    message: entry.message ?? null,
    last_utc: entry.lastUtc ?? null,
    row_count: entry.rowCount ?? null,
  })
}

/**
 * Copy GB datasets from Supabase into a workspace data directory.
 * @returns {Promise<{ dayAhead: { ok: boolean, source?: string }, pvYield: { ok: boolean, source?: string } }>}
 */
export async function syncMarketDataToWorkspace(dataDir) {
  const result = {
    dayAhead: { ok: false },
    pvYield: { ok: false },
  }
  if (!isMarketDataStoreConfigured()) return result

  fs.mkdirSync(dataDir, { recursive: true })

  try {
    await downloadMarketDataFile(
      GB_DAY_AHEAD_STORAGE_PATH,
      path.join(dataDir, DAY_AHEAD_FILENAME),
    )
    result.dayAhead = { ok: true, source: 'supabase' }
  } catch (e) {
    console.warn('[market-data] day-ahead sync:', e instanceof Error ? e.message : e)
  }

  try {
    await downloadMarketDataFile(
      GB_PV_YIELD_STORAGE_PATH,
      path.join(dataDir, PV_LIVE_YIELD_FILENAME),
    )
    result.pvYield = { ok: true, source: 'supabase' }
  } catch (e) {
    console.warn('[market-data] pv yield sync:', e instanceof Error ? e.message : e)
  }

  return result
}

/** @returns {Promise<object | null>} */
export async function getMarketDataStatus() {
  if (!isMarketDataStoreConfigured()) {
    return { configured: false }
  }
  const manifest = await readMarketDataManifest()
  return { configured: true, manifest }
}
