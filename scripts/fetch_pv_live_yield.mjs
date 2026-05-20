#!/usr/bin/env node
/**
 * Fetches GB national PV (gsp/0) from PV_Live API v4 and writes a CSV where
 * yield columns are % of estimated average power relative to installed MWp for
 * that interval (per extra field `installedcapacity_mwp` in the API).
 *
 * API: https://api.pvlive.uk/pvlive/api/v4/gsp/0
 * Docs (v4.1): https://docs.google.com/document/d/e/2PACX-1vQ7sL0gv0KWfCMQBEPnXUR8D0_6xI4ECEpuD_wVt6OpaZvYwrFGdzR9JVFIXlNwEIqNMJTdaw-3C2Gu/pub
 *
 * Note: With both `start` and `end` set, the API returns at most ~366 days of
 * data ending at `end` (see “Start_end logic” in the guide). This script uses
 * year-bounded chunks so 2024→present is complete.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
const OUT = path.join(PROJECT_ROOT, 'data', 'PV_Live_GB_yield_pct.csv')

const API = 'https://api.pvlive.uk/pvlive/api/v4/gsp/0'

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

function yieldPct(genMw, capMwp) {
  if (!(capMwp > 0) || !Number.isFinite(genMw)) return NaN
  const y = (100 * genMw) / capMwp
  if (!Number.isFinite(y)) return NaN
  return Math.min(100, Math.max(0, y))
}

/** @returns {Promise<{ header: string[], rows: string[][] }>} */
async function fetchChunk(startIso, endIso) {
  const u = new URL(API)
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

function chunkRanges() {
  const endLast = new Date().toISOString()
  return [
    { start: '2024-01-01T00:00:00Z', end: '2025-01-01T00:00:00Z' },
    { start: '2025-01-01T00:00:00Z', end: '2026-01-01T00:00:00Z' },
    { start: '2026-01-01T00:00:00Z', end: endLast },
  ]
}

async function main() {
  const byKey = new Map()

  for (const { start, end } of chunkRanges()) {
    const { header, rows } = await fetchChunk(start, end)
    const idx = {
      gsp: header.indexOf('gsp_id'),
      dt: header.indexOf('datetime_gmt'),
      gen: header.indexOf('generation_mw'),
      cap: header.indexOf('installedcapacity_mwp'),
      lcl: header.indexOf('lcl_mw'),
      ucl: header.indexOf('ucl_mw'),
    }
    if (idx.dt < 0 || idx.gen < 0 || idx.cap < 0) {
      throw new Error(`Unexpected CSV header: ${header.join(',')}`)
    }

    for (const cols of rows) {
      const dt = cols[idx.dt]
      const gsp = cols[idx.gsp] ?? '0'
      const key = `${gsp}|${dt}`
      const gen = parseNum(cols[idx.gen])
      const cap = parseNum(cols[idx.cap])
      const lcl = idx.lcl >= 0 ? parseNum(cols[idx.lcl]) : NaN
      const ucl = idx.ucl >= 0 ? parseNum(cols[idx.ucl]) : NaN
      byKey.set(key, {
        gsp,
        dt,
        y: yieldPct(gen, cap),
        yL: yieldPct(lcl, cap),
        yU: yieldPct(ucl, cap),
        gen,
        cap,
      })
    }
  }

  const mapped = [...byKey.values()].sort((a, b) =>
    a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : 0,
  )

  const outHeader = [
    'gsp_id',
    'datetime_gmt',
    'yield_pct',
    'lcl_yield_pct',
    'ucl_yield_pct',
    'generation_mw',
    'installedcapacity_mwp',
  ]

  const linesOut = [
    outHeader.join(','),
    ...mapped.map((r) =>
      [
        r.gsp,
        r.dt,
        fmt(r.y),
        fmt(r.yL),
        fmt(r.yU),
        fmt(r.gen),
        fmt(r.cap),
      ].join(','),
    ),
  ]

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, linesOut.join('\n') + '\n', 'utf8')

  console.log('Wrote', OUT)
  console.log('Rows:', mapped.length)
  console.log('Range:', mapped[0]?.dt, '→', mapped[mapped.length - 1]?.dt)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
