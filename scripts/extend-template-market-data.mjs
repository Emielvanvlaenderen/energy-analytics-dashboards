#!/usr/bin/env node
/**
 * Extend bundled day-ahead prices (and PV if needed) through the same end date
 * as site_consumption_constant_mw.csv so simulations are not clipped early.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(__dirname, '..')
const PROJECTS = ['ci-bess-uk', 'v2g-uk']

function parseUtc(s) {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!m) throw new Error(`Bad UTC timestamp: ${s}`)
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  )
}

function formatUtc(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

function londonLocalFromUtcMs(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((x) => [x.type, x.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

function readCsvEndUtc(csvPath, utcCol = 'Datetime (UTC)') {
  const text = fs.readFileSync(csvPath, 'utf8').trim()
  const lines = text.split(/\r?\n/)
  const header = lines[0].split(',')
  const idx = header.indexOf(utcCol)
  if (idx < 0) throw new Error(`No ${utcCol} in ${csvPath}`)
  const last = lines[lines.length - 1].split(',')
  return parseUtc(last[idx])
}

function extendDayAhead(dataDir) {
  const file = path.join(dataDir, 'day-ahead-prices.csv')
  const consEnd = readCsvEndUtc(path.join(dataDir, 'site_consumption_constant_mw.csv'))
  let daEnd = readCsvEndUtc(file)
  if (daEnd >= consEnd) {
    console.log(`  day-ahead already through ${formatUtc(consEnd).slice(0, 10)}`)
    return
  }

  const text = fs.readFileSync(file, 'utf8').trim()
  const lines = text.split(/\r?\n/)
  const lastCols = lines[lines.length - 1].split(',')
  const price = lastCols[lastCols.length - 1]

  let t = daEnd + 3600 * 1000
  const extra = []
  while (t <= consEnd) {
    const utc = formatUtc(t)
    const local = londonLocalFromUtcMs(t)
    extra.push(`United Kingdom,GBR,${utc},${local},${price}`)
    t += 3600 * 1000
  }

  fs.writeFileSync(file, `${lines.join('\n')}\n${extra.join('\n')}\n`, 'utf8')
  console.log(`  extended day-ahead by ${extra.length} hours`)
}

function extendPvFromExisting(dataDir) {
  const file = path.join(dataDir, 'site_pv_generation_synthetic_mw.csv')
  const consEnd = readCsvEndUtc(path.join(dataDir, 'site_consumption_constant_mw.csv'))
  const pvEnd = readCsvEndUtc(file)
  if (pvEnd >= consEnd) {
    console.log(`  PV already through ${formatUtc(consEnd).slice(0, 10)}`)
    return
  }

  const text = fs.readFileSync(file, 'utf8').trim()
  const lines = text.split(/\r?\n/)
  const lastCols = lines[lines.length - 1].split(',')
  const power = lastCols[lastCols.length - 1]

  let t = pvEnd + 30 * 60 * 1000
  const extra = []
  while (t <= consEnd) {
    const utc = formatUtc(t)
    const local = londonLocalFromUtcMs(t)
    extra.push(`United Kingdom,GBR,${utc},${local},${power}`)
    t += 30 * 60 * 1000
  }

  fs.writeFileSync(file, `${lines.join('\n')}\n${extra.join('\n')}\n`, 'utf8')
  console.log(`  extended PV by ${extra.length} rows`)
}

for (const id of PROJECTS) {
  const dataDir = path.join(REPO, 'projects', id, 'data')
  console.log(id)
  extendDayAhead(dataDir)
  extendPvFromExisting(dataDir)
}
