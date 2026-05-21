import fs from 'fs'
import path from 'path'
import {
  buildRunSummaryFromStudy,
  readStudyInputsForRunSummary,
} from './runSummaryCore.mjs'
import {
  formatParametersLabel,
  groupSimulationsByName,
  parseSimulationFilename,
} from './simulationFilename.mjs'
import {
  buildParametersDisplay,
  formatSiteDataTagShort,
  parseSiteDataTagsFromParametersLabel,
  readSiteDataForm,
  resolveSiteDataFlags,
} from './siteDataLabels.mjs'
import {
  listAllResultCsvEntries,
  PRE_RUN_SIMULATION_NAME,
  resolveResultsCsvPath,
} from './preRunResults.mjs'
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
 * Lists workspace CSVs plus saved account runs when `userId` is set.
 */
export async function executeListBessSimulations(
  projectId,
  { paths: pathsIn, userId } = {},
) {
  const paths = pathsIn ?? resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)

  try {
    const stats = listAllResultCsvEntries(paths)
    const filenames = stats.map((s) => s.filename)

    let activeFile = null
    try {
      if (fs.existsSync(paths.lastOutputMarker)) {
        const raw = fs.readFileSync(paths.lastOutputMarker, 'utf8').trim()
        if (raw) {
          const base = path.basename(path.resolve(raw))
          if (filenames.includes(base)) activeFile = base
        }
      }
    } catch {
      /* ignore */
    }
    if (!activeFile && stats.length) {
      activeFile = stats.find((s) => s.isPreRun)?.filename ?? stats[0].filename
    }

    const siteForm = readSiteDataForm(paths)

    let simulations = stats.map(({ filename, mtimeMs, isPreRun }) => {
      const parsed = parseSimulationFilename(filename)
      const { parametersLabel, isLegacy } = parsed
      const simulationName = isPreRun
        ? PRE_RUN_SIMULATION_NAME
        : parsed.simulationName
      const siteDataFlags = isPreRun
        ? parseSiteDataTagsFromParametersLabel(parametersLabel)
        : resolveSiteDataFlags(parametersLabel, siteForm)
      return {
        filename,
        mtimeMs,
        simulationName,
        parametersLabel,
        parametersDisplay: buildParametersDisplay(
          parametersLabel,
          siteDataFlags,
          formatParametersLabel,
        ),
        siteDataLabel: formatSiteDataTagShort(siteDataFlags),
        siteDataFlags,
        isLegacy,
        isPreRun: Boolean(isPreRun),
        isSaved: false,
      }
    })

    let activeSavedId = null
    if (userId) {
      const {
        executeListSavedSimulations,
        executeRepairSavedSimulationNames,
        mapSavedRowToSimulation,
      } = await import('./savedSimulationsCore.mjs')
      await executeRepairSavedSimulationNames(projectId, userId)
      const saved = await executeListSavedSimulations(projectId, userId)
      if (saved.ok && saved.simulations?.length) {
        const savedRuns = saved.simulations.map((row) =>
          mapSavedRowToSimulation(row, siteForm),
        )
        simulations = [...savedRuns, ...simulations]
        const onlyPreRun =
          stats.length > 0 && stats.every((s) => s.isPreRun)
        if (!activeFile || onlyPreRun) {
          activeSavedId = savedRuns[0].savedId
          activeFile = savedRuns[0].filename
        }
      }
    }

    let groups = groupSimulationsByName(simulations)
    groups.sort((a, b) => {
      const aSaved = a.runs.some((r) => r.isSaved)
      const bSaved = b.runs.some((r) => r.isSaved)
      if (aSaved !== bSaved) return aSaved ? -1 : 1
      const aPre = a.runs.some((r) => r.isPreRun)
      const bPre = b.runs.some((r) => r.isPreRun)
      if (aPre !== bPre) return aPre ? -1 : 1
      if (a.simulationName === '(unnamed)') return 1
      if (b.simulationName === '(unnamed)') return -1
      return a.simulationName.localeCompare(b.simulationName)
    })

    return {
      ok: true,
      status: 200,
      simulations,
      groups,
      activeFile,
      activeSavedId,
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

export function parseBessResultsFromCsvText(text, resultsPath = 'results.csv') {
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
    resultsPath,
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
}

export { resolveResultsCsvPath }

/**
 * Reads a BESS results CSV and returns compact arrays for charting.
 */
export function executeGetBessResults(projectId, query = {}, { paths: pathsIn } = {}) {
  const paths = pathsIn ?? resolveProjectPaths(projectId)
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
    const parsed = parseBessResultsFromCsvText(text, csvPath)
    if (!parsed.ok) return parsed
    const study = readStudyInputsForRunSummary(paths)
    const runSummary = buildRunSummaryFromStudy(study, { projectKind: 'ci-bess' })
    return { ...parsed, runSummary }
  } catch (e) {
    console.error(e)
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : 'Failed to read results.',
    }
  }
}

/** Resolve latest (or named) results CSV for guest download — no auth required. */
export function executeDownloadResults(projectId, query = {}, { paths: pathsIn } = {}) {
  const paths = pathsIn ?? resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)

  const resolved = resolveResultsCsvPath(paths, query.file)
  if (resolved.error) {
    return { ok: false, status: resolved.status, error: resolved.error }
  }
  return {
    ok: true,
    status: 200,
    csvPath: resolved.csvPath,
    filename: path.basename(resolved.csvPath),
  }
}
