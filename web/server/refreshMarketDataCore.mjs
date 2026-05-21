/**
 * Daily refresh: Ember GB day-ahead + PV_Live yield → Supabase Storage.
 */

import { DateTime } from 'luxon'
import {
  DAY_AHEAD_FILENAME,
  fetchEmberUkCsvText,
  parseDayAheadCsv,
} from './dayAheadPrices.mjs'
import { isSupabaseConfigured } from './authCore.mjs'
import {
  GB_DAY_AHEAD_STORAGE_PATH,
  GB_PV_YIELD_STORAGE_PATH,
  logMarketDataRefresh,
  uploadMarketDataFile,
  writeMarketDataManifest,
} from './marketDataStore.mjs'
import {
  fetchPvLiveYieldRows,
  PV_LIVE_YIELD_FILENAME,
  yieldRowsToCsv,
} from './pvLiveApi.mjs'
import { resolvePvFetchRange } from './pvYieldSynthetic.mjs'

function lastUtcFromDayAheadRows(rows) {
  return rows.length ? rows[rows.length - 1].utc : null
}

function lastUtcFromYieldRows(rows) {
  return rows.length ? rows[rows.length - 1].datetime_gmt : null
}

async function refreshDayAheadDataset() {
  const { csvText, cached, source } = await fetchEmberUkCsvText()
  const rows = parseDayAheadCsv(csvText)
  if (!rows.length) {
    throw new Error('Ember UK day-ahead CSV is empty')
  }

  await uploadMarketDataFile(GB_DAY_AHEAD_STORAGE_PATH, csvText, 'text/csv')

  const lastUtc = lastUtcFromDayAheadRows(rows)
  await logMarketDataRefresh({
    dataset: 'day-ahead',
    status: 'ok',
    message: cached ? `${source} (local cache)` : source,
    lastUtc,
    rowCount: rows.length,
  })

  return {
    filename: DAY_AHEAD_FILENAME,
    storagePath: GB_DAY_AHEAD_STORAGE_PATH,
    rowCount: rows.length,
    lastUtc,
    source,
    cached,
  }
}

async function refreshPvYieldDataset() {
  const { startIso, endIso } = resolvePvFetchRange(undefined, undefined)
  const rows = await fetchPvLiveYieldRows({ startIso, endIso })
  if (!rows.length) {
    throw new Error('PV_Live returned no yield rows')
  }

  const csvText = yieldRowsToCsv(rows)
  await uploadMarketDataFile(GB_PV_YIELD_STORAGE_PATH, csvText, 'text/csv')

  const lastUtc = lastUtcFromYieldRows(rows)
  await logMarketDataRefresh({
    dataset: 'pv-yield',
    status: 'ok',
    message: 'PV_Live API',
    lastUtc,
    rowCount: rows.length,
  })

  return {
    filename: PV_LIVE_YIELD_FILENAME,
    storagePath: GB_PV_YIELD_STORAGE_PATH,
    rowCount: rows.length,
    lastUtc,
    source: 'PV_Live API',
  }
}

/**
 * Fetch upstream sources and upload to Supabase Storage.
 * @returns {Promise<{ ok: boolean, status: number, manifest?: object, error?: string, details?: object }>}
 */
export async function executeRefreshMarketData() {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Supabase is not configured on this server.',
    }
  }

  const startedAt = DateTime.utc().toISO()
  const details = { startedAt, dayAhead: null, pvYield: null, errors: [] }

  try {
    details.dayAhead = await refreshDayAheadDataset()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    details.errors.push(`day-ahead: ${msg}`)
    await logMarketDataRefresh({
      dataset: 'day-ahead',
      status: 'error',
      message: msg,
    }).catch(() => {})
  }

  try {
    details.pvYield = await refreshPvYieldDataset()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    details.errors.push(`pv-yield: ${msg}`)
    await logMarketDataRefresh({
      dataset: 'pv-yield',
      status: 'error',
      message: msg,
    }).catch(() => {})
  }

  if (!details.dayAhead && !details.pvYield) {
    await logMarketDataRefresh({
      dataset: 'all',
      status: 'error',
      message: details.errors.join('; '),
    }).catch(() => {})
    return {
      ok: false,
      status: 500,
      error: details.errors.join('; ') || 'Market data refresh failed',
      details,
    }
  }

  const manifest = {
    updatedAt: DateTime.utc().toISO(),
    dayAhead: details.dayAhead,
    pvYield: details.pvYield,
    errors: details.errors.length ? details.errors : undefined,
  }

  await writeMarketDataManifest(manifest)
  await logMarketDataRefresh({
    dataset: 'all',
    status: details.errors.length ? 'partial' : 'ok',
    message: details.errors.length ? details.errors.join('; ') : 'ok',
    lastUtc: details.dayAhead?.lastUtc || details.pvYield?.lastUtc || null,
    rowCount:
      (details.dayAhead?.rowCount ?? 0) + (details.pvYield?.rowCount ?? 0) || null,
  }).catch(() => {})

  return {
    ok: !details.errors.length,
    status: details.errors.length ? 207 : 200,
    manifest,
    details,
  }
}

export function verifyCronSecret(req) {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return false
  const header = req.headers['x-cron-secret']
  const auth = req.headers.authorization || ''
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim()
  const query = req.query?.secret
  return (
    header === expected || bearer === expected || query === expected
  )
}
