import { defaultSeriesEndLondon, seriesStartLondon } from './seriesRange.mjs'

function formatNum(n) {
  if (Number.isInteger(n)) return String(n)
  const s = n.toFixed(6)
  return s.replace(/\.?0+$/, '')
}

/**
 * Half-hourly constant power (MW) from 2024-01-01 through last completed
 * half-hour in Europe/London.
 */
export function generateConstantMwRows(powerMw) {
  const start = seriesStartLondon()
  const end = defaultSeriesEndLondon()

  const rows = []
  if (end == null) {
    return rows
  }

  let dt = start
  while (dt <= end) {
    const localStr = dt.toFormat('yyyy-LL-dd HH:mm:ss')
    const utcStr = dt.setZone('utc').toFormat('yyyy-LL-dd HH:mm:ss')
    rows.push({ utcStr, localStr, powerMw })
    dt = dt.plus({ minutes: 30 })
  }
  return rows
}

export function rowsToPowerCsv(rows) {
  const header =
    'Country,ISO3 Code,Datetime (UTC),Datetime (Local),Power (MW)'
  const lines = rows.map(
    (r) =>
      `United Kingdom,GBR,${r.utcStr},${r.localStr},${formatNum(r.powerMw)}`,
  )
  return [header, ...lines].join('\n') + '\n'
}
