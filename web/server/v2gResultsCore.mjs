import fs from 'fs'
import {
  executeListBessSimulations,
  parseBessResultsFromCsvText,
} from './bessResultsCore.mjs'
import { resolveResultsCsvPath } from './preRunResults.mjs'
import { projectNotFound, resolveProjectPaths } from './projectPaths.mjs'

export { executeListBessSimulations as executeListV2gSimulations }
export { parseBessResultsFromCsvText }

function parseCsvLine(line) {
  return line.split(',').map((s) => s.trim())
}

function monthKeyUtc(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function aggregateAddedByMonth(tMs, wholesale, imp, exp) {
  const map = new Map()
  for (let i = 0; i < tMs.length; i++) {
    const key = monthKeyUtc(tMs[i])
    const cur = map.get(key) || { wholesale: 0, import: 0, export: 0 }
    cur.wholesale += Number.isFinite(wholesale[i]) ? wholesale[i] : 0
    cur.import += Number.isFinite(imp[i]) ? imp[i] : 0
    cur.export += Number.isFinite(exp[i]) ? exp[i] : 0
    map.set(key, cur)
  }
  const months = [...map.keys()].sort()
  return {
    months,
    wholesale: months.map((k) => map.get(k).wholesale),
    import: months.map((k) => map.get(k).import),
    export: months.map((k) => map.get(k).export),
  }
}

export function parseV2gResultsFromCsvText(text, resultsPath = 'results.csv') {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) {
    return { ok: false, status: 400, error: 'Results CSV is empty.' }
  }

  const headers = parseCsvLine(lines[0])
  const col = (name) => headers.indexOf(name)

  const iUtc = col('timestamp_utc')
  const iSite = col('site_mw')
  const iAction = col('action_MW')
  const iPlug = col('plugplay_action_MW')
  const iDa = col('settlement_price')
  const iImp = col('import_charge')
  const iExp = col('export_charge')
  const iSoc = col('soc_percent')
  const iPlugSoc = col('plugplay_soc_percent')
  const iAvail = col('bess_available')
  const iW = col('added_value_wholesale')
  const iAi = col('added_value_import')
  const iAe = col('added_value_export')
  const iT = col('added_value_total')

  if (iUtc < 0 || iSite < 0 || iAction < 0) {
    return {
      ok: false,
      status: 400,
      error: 'Results CSV is missing required V2G columns.',
    }
  }

  const tMs = []
  const siteMw = []
  const action = []
  const plugplayAction = []
  const settlementPrice = []
  const importCharge = []
  const exportCharge = []
  const socPct = []
  const plugplaySoc = []
  const pluggedIn = []
  const wholesaleAdded = []
  const importAdded = []
  const exportAdded = []
  const totalAdded = []

  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r])
    const ms = Date.parse(cols[iUtc])
    if (!Number.isFinite(ms)) continue
    tMs.push(ms)
    siteMw.push(Number.parseFloat(cols[iSite]))
    action.push(Number.parseFloat(cols[iAction]))
    plugplayAction.push(iPlug >= 0 ? Number.parseFloat(cols[iPlug]) : 0)
    settlementPrice.push(iDa >= 0 ? Number.parseFloat(cols[iDa]) : 0)
    importCharge.push(iImp >= 0 ? Number.parseFloat(cols[iImp]) : 0)
    exportCharge.push(iExp >= 0 ? Number.parseFloat(cols[iExp]) : 0)
    socPct.push(iSoc >= 0 ? Number.parseFloat(cols[iSoc]) : 0)
    plugplaySoc.push(iPlugSoc >= 0 ? Number.parseFloat(cols[iPlugSoc]) : 0)
    pluggedIn.push(iAvail >= 0 ? Number.parseFloat(cols[iAvail]) : 0)
    wholesaleAdded.push(iW >= 0 ? Number.parseFloat(cols[iW]) : 0)
    importAdded.push(iAi >= 0 ? Number.parseFloat(cols[iAi]) : 0)
    exportAdded.push(iAe >= 0 ? Number.parseFloat(cols[iAe]) : 0)
    totalAdded.push(iT >= 0 ? Number.parseFloat(cols[iT]) : 0)
  }

  const monthlyAdded = aggregateAddedByMonth(
    tMs,
    wholesaleAdded,
    importAdded,
    exportAdded,
  )

  return {
    ok: true,
    status: 200,
    resultsPath,
    rowCount: tMs.length,
    monthlyAdded,
    series: {
      tMs,
      siteMw,
      action,
      plugplayAction,
      settlementPrice,
      importCharge,
      exportCharge,
      socPct,
      plugplaySoc,
      pluggedIn,
      wholesaleAdded,
      importAdded,
      exportAdded,
      totalAdded,
    },
  }
}

export function executeGetV2gResults(projectId, query = {}, { paths: pathsIn } = {}) {
  const paths = pathsIn ?? resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)

  try {
    const resolved = resolveResultsCsvPath(paths, query.file)
    if (resolved.error) {
      return { ok: false, status: resolved.status, error: resolved.error }
    }
    const csvPath = resolved.csvPath
    const text = fs.readFileSync(csvPath, 'utf8')
    return parseV2gResultsFromCsvText(text, csvPath)
  } catch (e) {
    console.error(e)
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : 'Failed to read V2G results.',
    }
  }
}
