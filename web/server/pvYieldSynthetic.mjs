import fs from 'fs'
import path from 'path'
import { DateTime } from 'luxon'
import { rowsToPowerCsv } from './generateConstantMwSeries.mjs'
import { PROJECTS_DIR } from './repoRoot.mjs'

export const PV_SYNTHETIC_FILENAME = 'site_pv_generation_synthetic_mw.csv'

/** Prefer API-derived yield; fall back to bundled historical file with yield_pct. */
export const PV_YIELD_FILE_CANDIDATES = [
  'PV_Live_GB_yield_pct.csv',
  'PV_Live Historical Results.csv',
]

/** National GB yield bundled with C&I BESS; shared by all UK simulators. */
export const SHARED_PV_YIELD_DATA_DIR = path.join(
  PROJECTS_DIR,
  'ci-bess-uk',
  'data',
)

/** First existing candidate file in any of the given data directories. */
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

/**
 * Power (MW) = (yield_pct / 100) × installed_mw for each interval.
 * Timestamps follow the yield file (GMT); local column is Europe/London.
 */
export function powerRowsFromYield(yieldRows, installedMw) {
  return yieldRows.map(({ datetime_gmt, yieldPct }) => {
    const utc = DateTime.fromISO(datetime_gmt, { zone: 'utc' })
    if (!utc.isValid) {
      throw new Error(`Bad timestamp: ${datetime_gmt}`)
    }
    const powerMw = (yieldPct / 100) * installedMw
    return {
      utcStr: utc.toFormat('yyyy-LL-dd HH:mm:ss'),
      localStr: utc.setZone('Europe/London').toFormat('yyyy-LL-dd HH:mm:ss'),
      powerMw,
    }
  })
}

export function writePvSyntheticFromYield(dataDir, installedMw, extraSearchDirs = []) {
  const src = findYieldCsvPath(dataDir, ...extraSearchDirs, SHARED_PV_YIELD_DATA_DIR)
  if (!src) {
    return {
      ok: false,
      status: 404,
      error:
        'No PV yield file found. Add PV_Live_GB_yield_pct.csv (from scripts/fetch_pv_live_yield.mjs) or PV_Live Historical Results.csv with a yield_pct column to the data folder.',
    }
  }

  const yieldRows = parseYieldCsvFile(src)
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
      sourceYieldFile: path.basename(src),
    },
  }
}
