import { DateTime } from 'luxon'
import { defaultSeriesEndLondon, seriesStartLondon } from './seriesRange.mjs'

function slotIndexFromLocal(dt) {
  const m = dt.hour * 60 + dt.minute
  return Math.min(47, Math.floor(m / 30))
}

function parseNum(v) {
  if (v === '' || v == null) return 0
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Half-hourly series for Europe/London, aligned to DUoS band matrix.
 * @param {object} params
 * @param {string|number} params.importNonEnergy
 * @param {{green:{import,export},amber:{import,export},red:{import,export}}} params.duos
 * @param {string[][]} params.bandMatrix — [weekday|weekend][slot 0–47]
 * @param {{start: string, end: string}} [params.range] — ISO dates in Europe/London
 */
export function generateChargeRows({ importNonEnergy, duos, bandMatrix, range }) {
  const nonEnergy = parseNum(importNonEnergy)
  const start = range?.start
    ? DateTime.fromISO(range.start, { zone: 'Europe/London' })
    : seriesStartLondon()
  const end = range?.end
    ? DateTime.fromISO(range.end, { zone: 'Europe/London' })
    : defaultSeriesEndLondon()

  const rows = []
  if (end == null) {
    return rows
  }

  let dt = start
  while (dt <= end) {
    const weekend = dt.weekday === 6 || dt.weekday === 7
    const row = weekend ? 1 : 0
    const slot = slotIndexFromLocal(dt)
    const band = bandMatrix?.[row]?.[slot] ?? 'green'
    const d = duos?.[band] ?? { import: 0, export: 0 }
    /** Import DUoS for band + flat non-energy add-on (same every timestamp). */
    const importCharge = parseNum(d.import) + nonEnergy
    /** Export DUoS for band only. */
    const exportCharge = parseNum(d.export)

    const localStr = dt.toFormat("yyyy-LL-dd HH:mm:ss")
    const utc = dt.setZone('utc')
    const utcStr = utc.toFormat("yyyy-LL-dd HH:mm:ss")

    rows.push({
      utcStr,
      localStr,
      importCharge,
      exportCharge,
    })

    dt = dt.plus({ minutes: 30 })
  }

  return rows
}

export function rowsToImportCsv(rows) {
  const header =
    'Country,ISO3 Code,Datetime (UTC),Datetime (Local),Import charge (£/MWh)'
  const lines = rows.map(
    (r) =>
      `United Kingdom,GBR,${r.utcStr},${r.localStr},${formatNum(r.importCharge)}`,
  )
  return [header, ...lines].join('\n') + '\n'
}

export function rowsToExportCsv(rows) {
  const header =
    'Country,ISO3 Code,Datetime (UTC),Datetime (Local),Export charge (£/MWh)'
  const lines = rows.map(
    (r) =>
      `United Kingdom,GBR,${r.utcStr},${r.localStr},${formatNum(r.exportCharge)}`,
  )
  return [header, ...lines].join('\n') + '\n'
}

function formatNum(n) {
  if (Number.isInteger(n)) return String(n)
  const s = n.toFixed(6)
  return s.replace(/\.?0+$/, '')
}
