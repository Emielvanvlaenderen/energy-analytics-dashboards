import fs from 'fs'
import path from 'path'
import {
  formatParametersLabel,
  groupSimulationsByName,
  parseSimulationFilename,
} from './simulationFilename.mjs'
import {
  isPathInsideRoot,
  projectNotFound,
  resolveProjectPaths,
} from './projectPaths.mjs'

function parseCsvLine(line) {
  return line.split(',').map((s) => s.trim())
}

function monthKeyUtc(ms) {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

function aggregateAddedByMonth(tMs, wholesaleAdded, importAdded, exportAdded) {
  const map = new Map()
  const n = tMs.length
  for (let i = 0; i < n; i++) {
    const key = monthKeyUtc(tMs[i])
    const w = Number.isFinite(wholesaleAdded[i]) ? wholesaleAdded[i] : 0
    const im = Number.isFinite(importAdded[i]) ? importAdded[i] : 0
    const ex = Number.isFinite(exportAdded[i]) ? exportAdded[i] : 0
    const cur = map.get(key) || { wholesale: 0, import: 0, export: 0 }
    cur.wholesale += w
    cur.import += im
    cur.export += ex
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

/**
 * Lists `*.csv` files in `results/`, newest first.
 */
export function executeListBessSimulations(projectId) {
  const paths = resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)

  const resultsDir = paths.resultsDir

  try {
    if (!fs.existsSync(resultsDir)) {
      return {
        ok: true,
        status: 200,
        simulations: [],
        groups: [],
        activeFile: null,
      }
    }
    const names = fs.readdirSync(resultsDir).filter((f) => f.endsWith('.csv'))
    const stats = names.map((filename) => {
      const full = path.join(resultsDir, filename)
      let mtimeMs = 0
      try {
        mtimeMs = fs.statSync(full).mtimeMs
      } catch {
        /* ignore */
      }
      return { filename, mtimeMs }
    })
    stats.sort((a, b) => b.mtimeMs - a.mtimeMs)

    let activeFile = null
    try {
      if (fs.existsSync(paths.lastOutputMarker)) {
        const raw = fs.readFileSync(paths.lastOutputMarker, 'utf8').trim()
        if (raw) {
          const base = path.basename(path.resolve(raw))
          if (names.includes(base)) activeFile = base
        }
      }
    } catch {
      /* ignore */
    }

    const simulations = stats.map(({ filename, mtimeMs }) => {
      const { simulationName, parametersLabel, isLegacy } =
        parseSimulationFilename(filename)
      return {
        filename,
        mtimeMs,
        simulationName,
        parametersLabel,
        parametersDisplay: formatParametersLabel(parametersLabel),
        isLegacy,
      }
    })

    return {
      ok: true,
      status: 200,
      simulations,
      groups: groupSimulationsByName(simulations),
      activeFile,
    }
  } catch (e) {
    console.error(e)
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : 'Failed to list simulations.',
    }
  }
}

function listSimulationPathsNewestFirst(resultsDir) {
  if (!fs.existsSync(resultsDir)) return []
  const names = fs.readdirSync(resultsDir).filter((f) => f.endsWith('.csv'))
  const withStat = names.map((filename) => {
    const full = path.join(resultsDir, filename)
    let mtimeMs = 0
    try {
      mtimeMs = fs.statSync(full).mtimeMs
    } catch {
      /* ignore */
    }
    return { path: full, filename, mtimeMs }
  })
  withStat.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return withStat
}

function resolveResultsCsvPath(paths, fileQuery) {
  const { resultsDir, lastOutputMarker, root } = paths

  if (fileQuery && typeof fileQuery === 'string' && fileQuery.trim()) {
    const safe = path.basename(fileQuery.trim())
    if (safe !== fileQuery.trim() || safe.includes('..')) {
      return { error: 'Invalid file.', status: 400 }
    }
    const csvPath = path.join(resultsDir, safe)
    if (!isPathInsideRoot(root, csvPath) || !fs.existsSync(csvPath)) {
      return { error: 'Results file not found.', status: 404 }
    }
    return { csvPath }
  }

  if (fs.existsSync(lastOutputMarker)) {
    const rawPath = fs.readFileSync(lastOutputMarker, 'utf8').trim()
    if (rawPath) {
      const csvPath = path.resolve(rawPath)
      if (isPathInsideRoot(root, csvPath) && fs.existsSync(csvPath)) {
        return { csvPath }
      }
    }
  }

  const fallback = listSimulationPathsNewestFirst(resultsDir)
  if (fallback.length) {
    return { csvPath: fallback[0].path }
  }

  return {
    error: 'No optimisation results yet. Run Simulate BESS or add CSV files to results/.',
    status: 404,
  }
}

/**
 * Reads a BESS results CSV and returns compact arrays for charting.
 * @param {{ file?: string }} [query] — optional `file` = basename under `results/`
 */
export function executeGetBessResults(projectId, query = {}) {
  const paths = resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)

  try {
    const resolved = resolveResultsCsvPath(paths, query.file)
    if (resolved.error) {
      return {
        ok: false,
        status: resolved.status,
        error: resolved.error,
      }
    }
    const csvPath = resolved.csvPath

    if (!csvPath) {
      return { ok: false, status: 404, error: 'No results file resolved.' }
    }

    const text = fs.readFileSync(csvPath, 'utf8')
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
    if (lines.length < 2) {
      return { ok: false, status: 400, error: 'Results CSV is empty.' }
    }

    const headers = parseCsvLine(lines[0])
    const col = (name) => headers.indexOf(name)

    const iUtc = col('timestamp_UTC')
    const iPv = col('ov_MW')
    const iCons = col('cons_MW')
    const iSite = col('site_MW')
    const iAction = col('action')
    const iDa = col('settlement_price')
    const iImp = col('import_costs')
    const iExp = col('export_costs')
    const iCharge = col('charge')
    const iDischarge = col('discharge')
    const iSoc = col('soc')
    const iWholesaleAdded = col('wholesale_added')
    const iImportAdded = col('import_added')
    const iExportAdded = col('export_added')
    if (
      iUtc < 0 ||
      iPv < 0 ||
      iCons < 0 ||
      iSite < 0 ||
      iAction < 0 ||
      iDa < 0 ||
      iImp < 0 ||
      iExp < 0 ||
      iCharge < 0 ||
      iDischarge < 0 ||
      iSoc < 0 ||
      iWholesaleAdded < 0 ||
      iImportAdded < 0 ||
      iExportAdded < 0
    ) {
      return {
        ok: false,
        status: 400,
        error:
          'Results CSV is missing required columns (timestamp_UTC, ov_MW, cons_MW, site_MW, action, settlement_price, import_costs, export_costs, charge, discharge, soc, wholesale_added, import_added, export_added).',
      }
    }

    const tMs = []
    const pv = []
    const siteOfftake = []
    const siteMw = []
    const action = []
    const settlementPrice = []
    const importCosts = []
    const exportCosts = []
    const chargeMw = []
    const dischargeMw = []
    const socPct = []
    const wholesaleAdded = []
    const importAdded = []
    const exportAdded = []

    for (let r = 1; r < lines.length; r++) {
      const cols = parseCsvLine(lines[r])
      const ts = cols[iUtc]
      const ms = Date.parse(ts)
      if (!Number.isFinite(ms)) continue
      tMs.push(ms)
      pv.push(Number.parseFloat(cols[iPv]))
      siteOfftake.push(Number.parseFloat(cols[iCons]))
      siteMw.push(Number.parseFloat(cols[iSite]))
      action.push(Number.parseFloat(cols[iAction]))
      settlementPrice.push(Number.parseFloat(cols[iDa]))
      importCosts.push(Number.parseFloat(cols[iImp]))
      exportCosts.push(Number.parseFloat(cols[iExp]))
      chargeMw.push(Number.parseFloat(cols[iCharge]))
      dischargeMw.push(Number.parseFloat(cols[iDischarge]))
      socPct.push(Number.parseFloat(cols[iSoc]))
      wholesaleAdded.push(Number.parseFloat(cols[iWholesaleAdded]))
      importAdded.push(Number.parseFloat(cols[iImportAdded]))
      exportAdded.push(Number.parseFloat(cols[iExportAdded]))
    }

    /**
     * Day-ahead uses settlement_price from results CSV.
     * import_price = day-ahead + import_cost; export_price = day-ahead − export_cost.
     */
    const totalImportPrice = tMs.map((_, i) => settlementPrice[i] + importCosts[i])
    const totalExportPrice = tMs.map((_, i) => settlementPrice[i] - exportCosts[i])

    const monthlyAdded = aggregateAddedByMonth(
      tMs,
      wholesaleAdded,
      importAdded,
      exportAdded,
    )

    return {
      ok: true,
      status: 200,
      resultsPath: csvPath,
      rowCount: tMs.length,
      monthlyAdded,
      series: {
        tMs,
        pv,
        siteOfftake,
        siteMw,
        action,
        settlementPrice,
        importCosts,
        exportCosts,
        totalImportPrice,
        totalExportPrice,
        chargeMw,
        dischargeMw,
        socPct,
        wholesaleAdded,
        importAdded,
        exportAdded,
      },
    }
  } catch (e) {
    console.error(e)
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : 'Failed to read results.',
    }
  }
}
