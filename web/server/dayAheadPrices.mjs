/**
 * GB day-ahead wholesale prices for optimisation.
 * Refreshed from Ember's free hourly zip before each run (methodology data source).
 * @see https://ember-energy.org/data/european-wholesale-electricity-prices/
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { DateTime } from 'luxon'
import { REPO_ROOT } from './repoRoot.mjs'
import { pvDatesFromStudy } from './pvYieldSynthetic.mjs'

export const DAY_AHEAD_FILENAME = 'day-ahead-prices.csv'
export const EMBER_HOURLY_ZIP_URL =
  'https://files.ember-energy.org/public-downloads/price/outputs/european_wholesale_electricity_price_data_hourly.zip'
export const EMBER_UK_CSV_ENTRY = 'United Kingdom.csv'
export const DA_CSV_HEADER =
  'Country,ISO3 Code,Datetime (UTC),Datetime (Local),Price (EUR/MWhe)'

const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** @typedef {{ utc: string, local: string, priceEur: number }} DayAheadRow */

function getDataRoot() {
  return process.env.DATA_ROOT || path.join(REPO_ROOT, '.data')
}

function emberCacheDir() {
  return path.join(getDataRoot(), 'cache', 'ember')
}

function parseNum(s) {
  const n = Number.parseFloat(String(s ?? '').trim())
  return Number.isFinite(n) ? n : NaN
}

/** @param {string} text */
export function parseDayAheadCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].split(',')
  const utcIdx = header.indexOf('Datetime (UTC)')
  const localIdx = header.indexOf('Datetime (Local)')
  const priceIdx = header.indexOf('Price (EUR/MWhe)')
  if (utcIdx < 0 || localIdx < 0 || priceIdx < 0) {
    throw new Error('Unexpected day-ahead CSV header')
  }

  /** @type {DayAheadRow[]} */
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const utc = cols[utcIdx]?.trim()
    const local = cols[localIdx]?.trim()
    const priceEur = parseNum(cols[priceIdx])
    if (!utc || !Number.isFinite(priceEur)) continue
    rows.push({ utc, local: local || utc, priceEur })
  }
  return rows
}

/** Remove script forward-fill tails (48+ identical hourly prices). */
export function trimSyntheticFlatTail(rows) {
  if (rows.length < 48) return rows

  const last = rows[rows.length - 1].priceEur
  let runStart = rows.length - 1
  while (runStart > 0 && rows[runStart - 1].priceEur === last) {
    runStart--
  }
  const runLen = rows.length - runStart
  if (runLen >= 48) {
    return rows.slice(0, runStart)
  }
  return rows
}

/** @param {DayAheadRow[]} rows */
export function rowsToDayAheadCsv(rows) {
  const body = rows.map(
    (r) =>
      `United Kingdom,GBR,${r.utc},${r.local},${formatPrice(r.priceEur)}`,
  )
  return [DA_CSV_HEADER, ...body].join('\n') + '\n'
}

/** @param {number} x */
function formatPrice(x) {
  if (!Number.isFinite(x)) return ''
  const s = x.toFixed(4).replace(/\.?0+$/, '')
  return s === '' ? '0' : s
}

function cacheTtlMs() {
  const raw = Number(process.env.EMBER_CACHE_TTL_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CACHE_TTL_MS
}

function lastRowDate(rows) {
  return rows.length ? rows[rows.length - 1].utc.slice(0, 10) : null
}

function cacheNeedsRefresh(ukPath, studyEndDate) {
  if (!fs.existsSync(ukPath)) return true

  const ageMs = Date.now() - fs.statSync(ukPath).mtimeMs
  if (ageMs > cacheTtlMs()) return true

  if (studyEndDate && /^\d{4}-\d{2}-\d{2}$/.test(studyEndDate)) {
    const rows = parseDayAheadCsv(fs.readFileSync(ukPath, 'utf8'))
    const last = lastRowDate(rows)
    if (last && studyEndDate > last) return true
  }

  return false
}

async function downloadEmberZip(zipPath) {
  const url = process.env.EMBER_HOURLY_ZIP_URL?.trim() || EMBER_HOURLY_ZIP_URL
  const res = await fetch(url, { headers: { Accept: 'application/zip' } })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Ember zip ${res.status}: ${t.slice(0, 200)}`)
  }
  fs.mkdirSync(path.dirname(zipPath), { recursive: true })
  fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()))
}

/** Extract United Kingdom.csv from the Ember hourly zip. */
export function extractUkCsvFromZip(zipPath, ukPath) {
  fs.mkdirSync(path.dirname(ukPath), { recursive: true })

  const unzip = spawnSync('unzip', ['-p', zipPath, EMBER_UK_CSV_ENTRY], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (unzip.status === 0 && unzip.stdout?.length) {
    fs.writeFileSync(ukPath, unzip.stdout)
    return
  }

  const py = spawnSync(
    process.env.PYTHON || 'python3',
    [
      '-c',
      `import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    data = z.read(${JSON.stringify(EMBER_UK_CSV_ENTRY)})
open(sys.argv[2], "wb").write(data)`,
      zipPath,
      ukPath,
    ],
    { encoding: 'utf8' },
  )
  if (py.status !== 0) {
    throw new Error(
      py.stderr?.trim() ||
        unzip.stderr?.toString()?.trim() ||
        'Failed to extract United Kingdom.csv from Ember zip',
    )
  }
}

/**
 * Download Ember hourly zip (cached) and return UK CSV text.
 * @returns {Promise<{ csvText: string, source: string, cached: boolean }>}
 */
export async function fetchEmberUkCsvText({ studyEndDate } = {}) {
  const cacheDir = emberCacheDir()
  const zipPath = path.join(cacheDir, 'european_wholesale_electricity_price_data_hourly.zip')
  const ukPath = path.join(cacheDir, EMBER_UK_CSV_ENTRY)
  const refresh = cacheNeedsRefresh(ukPath, studyEndDate)

  if (refresh) {
    await downloadEmberZip(zipPath)
    extractUkCsvFromZip(zipPath, ukPath)
  }

  if (!fs.existsSync(ukPath)) {
    throw new Error('Ember UK price CSV missing after download')
  }

  const csvText = fs.readFileSync(ukPath, 'utf8')
  if (!csvText.trim()) {
    throw new Error('Ember UK price CSV is empty')
  }

  return {
    csvText,
    source: 'Ember European wholesale hourly (United Kingdom.csv)',
    cached: !refresh,
  }
}

/**
 * Download Ember hourly zip (cached) and return parsed UK rows.
 * @returns {Promise<{ rows: DayAheadRow[], source: string, cached: boolean }>}
 */
export async function fetchEmberUkDayAhead({ studyEndDate } = {}) {
  const { csvText, source, cached } = await fetchEmberUkCsvText({ studyEndDate })
  const rows = parseDayAheadCsv(csvText)
  if (!rows.length) {
    throw new Error('Ember UK price CSV is empty')
  }

  return {
    rows,
    source,
    cached,
  }
}

function loadBundledFallback(templatePath) {
  if (!fs.existsSync(templatePath)) return []
  return trimSyntheticFlatTail(
    parseDayAheadCsv(fs.readFileSync(templatePath, 'utf8')),
  )
}

/**
 * Write workspace day-ahead-prices.csv from Ember (with bundled fallback).
 */
export async function refreshDayAheadForStudy(paths, study) {
  const dest = path.join(paths.dataDir, DAY_AHEAD_FILENAME)
  const templatePath = path.join(paths.templateRoot, 'data', DAY_AHEAD_FILENAME)
  fs.mkdirSync(paths.dataDir, { recursive: true })

  const { endDate } = pvDatesFromStudy(study)
  let rows = []
  let source = 'bundled template'
  let cached = false

  if (process.env.DAY_AHEAD_DISABLE_API !== 'true') {
    try {
      const ember = await fetchEmberUkDayAhead({ studyEndDate: endDate })
      rows = ember.rows
      source = ember.source
      cached = ember.cached
    } catch (e) {
      console.warn('[day-ahead] Ember:', e instanceof Error ? e.message : e)
    }
  }

  if (!rows.length) {
    rows = loadBundledFallback(templatePath)
    source = 'bundled template (Ember unavailable)'
  }

  if (!rows.length) {
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, dest)
    }
    return { ok: false, source: 'template (no rows)' }
  }

  fs.writeFileSync(dest, rowsToDayAheadCsv(rows), 'utf8')
  return {
    ok: true,
    source,
    cached,
    rowCount: rows.length,
    lastUtc: rows[rows.length - 1]?.utc ?? null,
  }
}
