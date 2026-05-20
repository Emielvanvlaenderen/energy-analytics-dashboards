/**
 * PV_Live API v4 — GB national (gsp/0).
 * @see scripts/fetch_pv_live_yield.mjs
 * @see https://api.pvlive.uk/pvlive/api/v4/gsp/0
 */

import { DateTime } from 'luxon'

export const PV_LIVE_API = 'https://api.pvlive.uk/pvlive/api/v4/gsp/0'
export const PV_LIVE_YIELD_FILENAME = 'PV_Live_GB_yield_pct.csv'

/** @param {number} x */
function fmt(x) {
  if (!Number.isFinite(x)) return ''
  const s = x.toFixed(8).replace(/\.?0+$/, '')
  return s === '' ? '0' : s
}

/** @param {string} s */
function parseNum(s) {
  if (s === '' || s == null || String(s).toLowerCase() === 'null') return NaN
  const n = Number.parseFloat(String(s).trim())
  return Number.isFinite(n) ? n : NaN
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return { header: [], rows: [] }
  const header = lines[0].split(',')
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    rows.push(lines[i].split(','))
  }
  return { header, rows }
}

/** yield % = 100 × generation_mw / installedcapacity_mwp (capped 0–100). */
export function yieldPctFromGeneration(genMw, capMwp) {
  if (!(capMwp > 0) || !Number.isFinite(genMw)) return NaN
  const y = (100 * genMw) / capMwp
  if (!Number.isFinite(y)) return NaN
  return Math.min(100, Math.max(0, y))
}

/** @returns {Promise<{ header: string[], rows: string[][] }>} */
export async function fetchPvLiveChunk(startIso, endIso) {
  const u = new URL(PV_LIVE_API)
  u.searchParams.set('start', startIso)
  u.searchParams.set('end', endIso)
  u.searchParams.set('data_format', 'csv')
  u.searchParams.set('extra_fields', 'installedcapacity_mwp,lcl_mw,ucl_mw')
  u.searchParams.set('period', '30')

  const res = await fetch(u.toString(), {
    headers: { 'Accept-Encoding': 'gzip, deflate', Accept: 'text/csv' },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`PV_Live ${res.status}: ${t.slice(0, 500)}`)
  }
  return parseCsv(await res.text())
}

/** Year-bounded chunks (API returns at most ~366 days per request). */
export function buildPvLiveChunkRanges(startIso, endIso) {
  const start = DateTime.fromISO(startIso, { zone: 'utc' })
  const end = DateTime.fromISO(endIso, { zone: 'utc' })
  if (!start.isValid || !end.isValid || end < start) {
    throw new Error('Invalid PV_Live fetch range')
  }

  const chunks = []
  for (let year = start.year; year <= end.year; year++) {
    const chunkStart =
      year === start.year
        ? start
        : DateTime.fromObject({ year, month: 1, day: 1 }, { zone: 'utc' })
    const chunkEnd =
      year === end.year
        ? end.plus({ minutes: 30 })
        : DateTime.fromObject({ year: year + 1, month: 1, day: 1 }, { zone: 'utc' })
    chunks.push({
      start: chunkStart.toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
      end: chunkEnd.toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"),
    })
  }
  return chunks
}

/**
 * Fetch half-hourly yield rows from PV_Live for [startIso, endIso].
 * @returns {Promise<Array<{ datetime_gmt: string, yieldPct: number }>>}
 */
export async function fetchPvLiveYieldRows({ startIso, endIso }) {
  const byKey = new Map()

  for (const { start, end } of buildPvLiveChunkRanges(startIso, endIso)) {
    const { header, rows } = await fetchPvLiveChunk(start, end)
    const idx = {
      dt: header.indexOf('datetime_gmt'),
      gen: header.indexOf('generation_mw'),
      cap: header.indexOf('installedcapacity_mwp'),
    }
    if (idx.dt < 0 || idx.gen < 0 || idx.cap < 0) {
      throw new Error(`Unexpected PV_Live CSV header: ${header.join(',')}`)
    }

    for (const cols of rows) {
      const dt = cols[idx.dt]
      if (!dt) continue
      const gen = parseNum(cols[idx.gen])
      const cap = parseNum(cols[idx.cap])
      const y = yieldPctFromGeneration(gen, cap)
      byKey.set(dt, {
        datetime_gmt: dt,
        yieldPct: Number.isFinite(y) ? y : 0,
      })
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.datetime_gmt < b.datetime_gmt ? -1 : a.datetime_gmt > b.datetime_gmt ? 1 : 0,
  )
}

/** Serialize yield rows to PV_Live_GB_yield_pct.csv format. */
export function yieldRowsToCsv(yieldRows) {
  const header = [
    'gsp_id',
    'datetime_gmt',
    'yield_pct',
    'lcl_yield_pct',
    'ucl_yield_pct',
  ]
  const lines = [
    header.join(','),
    ...yieldRows.map((r) =>
      ['0', r.datetime_gmt, fmt(r.yieldPct), '', ''].join(','),
    ),
  ]
  return lines.join('\n') + '\n'
}
