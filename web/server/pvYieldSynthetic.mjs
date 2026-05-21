import fs from 'fs'
import path from 'path'
import { DateTime } from 'luxon'
import { rowsToPowerCsv } from './generateConstantMwSeries.mjs'
import {
  defaultSeriesEndLondon,
  seriesStartLondon,
} from './seriesRange.mjs'
import { PROJECTS_DIR } from './repoRoot.mjs'
import {
  fetchPvLiveYieldRows,
  PV_LIVE_YIELD_FILENAME,
  yieldRowsToCsv,
} from './pvLiveApi.mjs'

export const PV_SYNTHETIC_FILENAME = 'site_pv_generation_synthetic_mw.csv'

/** Fallback when PV_Live API is unavailable. */
export const PV_YIELD_FILE_CANDIDATES = [
  PV_LIVE_YIELD_FILENAME,
  'PV_Live Historical Results.csv',
]

export const SHARED_PV_YIELD_DATA_DIR = path.join(
  PROJECTS_DIR,
  'ci-bess-uk',
  'data',
)

export function findYieldCsvPath(...searchDirs) {
  for (const dataDir of searchDirs.filter(Boolean)) {
    for (const name of PV_YIELD_FILE_CANDIDATES) {
      const p = path.join(dataDir, name)
      if (fs.existsSync(p)) return p
    }
  }
  return null
}

export function parseYieldCsvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) {
    throw new Error('PV yield file is empty')
  }
  const header = lines[0].split(',')
  const yi = header.indexOf('yield_pct')
  const dti = header.indexOf('datetime_gmt')
  if (yi < 0 || dti < 0) {
    throw new Error(
      `Expected columns datetime_gmt and yield_pct in ${path.basename(filePath)}`,
    )
  }
  const out = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const datetime_gmt = cols[dti]
    const y = Number.parseFloat(cols[yi])
    if (!datetime_gmt) continue
    out.push({
      datetime_gmt,
      yieldPct: Number.isFinite(y) ? y : 0,
    })
  }
  return out
}

/** ISO date `YYYY-MM-DD` → UTC range for PV_Live fetch. */
export function resolvePvFetchRange(startDate, endDate) {
  const start =
    startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? `${startDate}T00:00:00Z`
      : seriesStartLondon().toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'")

  let endIso
  if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    endIso = `${endDate}T23:30:00Z`
  } else {
    const end = defaultSeriesEndLondon()
    endIso = end
      ? end.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'")
      : new Date().toISOString()
  }

  return { startIso: start, endIso: endIso }
}

export function filterYieldToDateRange(yieldRows, startDate, endDate) {
  if (!startDate || !endDate) return yieldRows
  const t0 = DateTime.fromISO(`${startDate}T00:00:00`, { zone: 'utc' })
  const t1 = DateTime.fromISO(`${endDate}T23:59:59`, { zone: 'utc' })
  return yieldRows.filter((r) => {
    const t = DateTime.fromISO(r.datetime_gmt, { zone: 'utc' })
    return t.isValid && t >= t0 && t <= t1
  })
}

function writeYieldCache(dataDir, yieldRows) {
  fs.mkdirSync(dataDir, { recursive: true })
  const cachePath = path.join(dataDir, PV_LIVE_YIELD_FILENAME)
  fs.writeFileSync(cachePath, yieldRowsToCsv(yieldRows), 'utf8')
  return cachePath
}

/**
 * Load yield from workspace / Supabase file, PV_Live API, or bundled CSV.
 * @param {string} dataDir
 * @param {{ startDate?: string, endDate?: string, useApi?: boolean, preferLocal?: boolean }} options
 */
export async function loadYieldRows(
  dataDir,
  { startDate, endDate, useApi = true, preferLocal = true } = {},
) {
  const localPath = path.join(dataDir, PV_LIVE_YIELD_FILENAME)
  if (preferLocal && fs.existsSync(localPath)) {
    const rows = filterYieldToDateRange(
      parseYieldCsvFile(localPath),
      startDate,
      endDate,
    )
    if (rows.length) {
      return { rows, source: PV_LIVE_YIELD_FILENAME }
    }
  }

  const { startIso, endIso } = resolvePvFetchRange(startDate, endDate)

  if (useApi && process.env.PV_LIVE_DISABLE_API !== 'true') {
    try {
      const rows = await fetchPvLiveYieldRows({ startIso, endIso })
      if (rows.length) {
        writeYieldCache(dataDir, rows)
        return { rows, source: 'PV_Live API' }
      }
    } catch (e) {
      console.warn('[pv] PV_Live API:', e instanceof Error ? e.message : e)
    }
  }

  const src = findYieldCsvPath(
    dataDir,
    path.join(dataDir, '..', 'data'),
    SHARED_PV_YIELD_DATA_DIR,
  )
  if (!src) {
    throw new Error(
      'No PV yield data. PV_Live API fetch failed and no local yield CSV was found.',
    )
  }
  return {
    rows: filterYieldToDateRange(parseYieldCsvFile(src), startDate, endDate),
    source: path.basename(src),
  }
}

/** Power (MW) = (yield_pct / 100) × installed_mw per interval. */
export function powerRowsFromYield(yieldRows, installedMw) {
  return yieldRows.map(({ datetime_gmt, yieldPct }) => {
    const utc = DateTime.fromISO(datetime_gmt, { zone: 'utc' })
    if (!utc.isValid) {
      throw new Error(`Bad timestamp: ${datetime_gmt}`)
    }
    const powerMw = (yieldPct / 100) * installedMw
    return {
      utcStr: utc.toFormat('yyyy-LL-dd HH:mm:ss'),
      localStr: utc.setZone('Europe/London').toFormat('yyyy-MM-dd HH:mm:ss'),
      powerMw,
    }
  })
}

/**
 * Build site_pv_generation_synthetic_mw.csv from PV_Live API yield × installed MW.
 */
export async function writePvSyntheticFromYield(
  dataDir,
  installedMw,
  {
    extraSearchDirs = [],
    startDate,
    endDate,
    useApi = true,
    preferLocal = true,
  } = {},
) {
  void extraSearchDirs

  const { rows: yieldRows, source } = await loadYieldRows(dataDir, {
    startDate,
    endDate,
    useApi,
    preferLocal,
  })

  if (!yieldRows.length) {
    return {
      ok: false,
      status: 404,
      error: 'No PV yield rows for the requested date range.',
    }
  }

  const rows = powerRowsFromYield(yieldRows, installedMw)
  fs.mkdirSync(dataDir, { recursive: true })
  const outPath = path.join(dataDir, PV_SYNTHETIC_FILENAME)
  fs.writeFileSync(outPath, rowsToPowerCsv(rows), 'utf8')

  return {
    ok: true,
    status: 200,
    files: {
      filename: PV_SYNTHETIC_FILENAME,
      directory: dataDir,
      rowCount: rows.length,
      sourceYieldFile: source,
    },
  }
}

/** Study committed dates for PV fetch window. */
export function pvDatesFromStudy(study) {
  const b = study?.bessSimulationCommitted
  const v = study?.v2gSimulationCommitted
  return {
    startDate: b?.startDate || v?.startDate,
    endDate: b?.endDate || v?.endDate,
  }
}
