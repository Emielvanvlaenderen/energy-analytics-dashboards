#!/usr/bin/env node
/**
 * Deletes existing result CSVs, runs four shared-parameter optimisations
 * (BESS/V2G × with/without PV & consumption), stores under results/pre-run/.
 *
 * Usage: node scripts/generate-pre-run-results.mjs
 */
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { executeContinue } from '../web/server/continueCore.mjs'
import { CONSUMPTION_FILENAME } from '../web/server/siteDataCore.mjs'
import { PV_SYNTHETIC_FILENAME } from '../web/server/pvYieldSynthetic.mjs'
import {
  generateConstantMwRows,
  rowsToPowerCsv,
} from '../web/server/generateConstantMwSeries.mjs'
import { writePvSyntheticFromYield } from '../web/server/pvYieldSynthetic.mjs'
import { getPreRunResultsDir } from '../web/server/preRunResults.mjs'
import { REPO_ROOT } from '../web/server/repoRoot.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const RANGE = { start: '2024-01-01', end: '2026-05-01' }

const PRE_RUN_SIMULATION_NAME = 'Pre-run_demo'

const SCENARIOS = {
  noSite: {
    simulationName: PRE_RUN_SIMULATION_NAME,
    pvChoice: 'no',
    consumptionChoice: 'no',
    consumptionMw: 0,
    pvInstalledMw: 0,
  },
  withSite: {
    simulationName: PRE_RUN_SIMULATION_NAME,
    pvChoice: 'yes',
    consumptionChoice: 'yes',
    consumptionMw: 0.5,
    pvInstalledMw: 1,
  },
}

const SHARED = {
  fxGbpPerEur: 0.85,
  nbDaysPerPeriod: 3,
  siteImportExportLimitsMw: { maxImportMw: 2, maxExportMw: 2 },
  gridTariffs: {
    importNonEnergy: '70',
    duos: {
      green: { import: '1', export: '-1' },
      amber: { import: '10', export: '-10' },
      red: { import: '60', export: '-60' },
    },
    bandMatrix: buildDemoBandMatrix(),
  },
  bessSimulationCommitted: {
    startDate: '2024-01-01',
    endDate: '2026-05-01',
    capacityMw: 1,
    durationHours: 2,
    chargingEfficiencyPct: 95,
    dischargingEfficiencyPct: 95,
    socLowerPct: 10,
    socUpperPct: 90,
    cyclesPerDayTarget: 1,
  },
  v2gSimulationCommitted: {
    startDate: '2024-01-01',
    endDate: '2026-05-01',
    capacityMw: 1,
    durationHours: 2,
    energyBessMwh: 2,
    maxPowerBessMw: 1,
    socLowerPct: 20,
    socUpperPct: 90,
    returnSocPct: 30,
    targetSocPct: 90,
    chargingEfficiencyPct: 90,
    dischargingEfficiencyPct: 90,
    simulationType: 'V2G',
  },
}

/** Half-hour slot index for local HH:MM (row label = interval start). */
function slotIndex(hour, minute = 0) {
  return hour * 2 + (minute >= 30 ? 1 : 0)
}

/**
 * Weekdays: green by default; amber 07:00–22:00; red 16:00–20:00 (red overrides amber).
 * Weekends: all green.
 */
function buildDemoBandMatrix() {
  const weekday = Array(48).fill('green')
  const amberFrom = slotIndex(7, 0)
  const amberTo = slotIndex(22, 0) - 1 // through 21:30
  const redFrom = slotIndex(16, 0)
  const redTo = slotIndex(20, 0) - 1 // through 19:30

  for (let s = amberFrom; s <= amberTo; s++) weekday[s] = 'amber'
  for (let s = redFrom; s <= redTo; s++) weekday[s] = 'red'

  const weekend = Array(48).fill('green')
  return [weekday, weekend]
}

function loadV2gSchedule() {
  const p = path.join(REPO_ROOT, 'projects/v2g-uk/optimisation/study_inputs.json')
  const study = JSON.parse(fs.readFileSync(p, 'utf8'))
  return study.v2gSchedule
}

function projectPaths(projectId) {
  const templateRoot = path.join(REPO_ROOT, 'projects', projectId)
  return {
    projectId,
    meta: { id: projectId },
    workspaceId: 'pre-run-generator',
    root: templateRoot,
    templateRoot,
    dataDir: path.join(templateRoot, 'data'),
    resultsDir: path.join(templateRoot, 'results'),
    optimisationDir: path.join(templateRoot, 'optimisation'),
    studyInputsPath: path.join(templateRoot, 'optimisation/study_inputs.json'),
    lastOutputMarker: path.join(
      templateRoot,
      'optimisation/.last_optimisation_output.txt',
    ),
    runScript: path.join(
      templateRoot,
      'optimisation/run_optimisation_from_study.py',
    ),
    projectKind: projectId === 'v2g-uk' ? 'v2g' : 'bess',
  }
}

function rmCsvRecursive(dir) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      rmCsvRecursive(full)
      continue
    }
    if (name.endsWith('.csv')) fs.unlinkSync(full)
  }
}

function deleteAllResults() {
  console.log('Removing existing result CSVs…')
  for (const id of ['ci-bess-uk', 'v2g-uk']) {
    const results = path.join(REPO_ROOT, 'projects', id, 'results')
    rmCsvRecursive(results)
  }
  const workspaces = path.join(REPO_ROOT, '.data/workspaces')
  if (fs.existsSync(workspaces)) {
    rmCsvRecursive(workspaces)
  }
}

function ensureDirs(paths) {
  for (const d of [paths.dataDir, paths.resultsDir, paths.optimisationDir]) {
    fs.mkdirSync(d, { recursive: true })
  }
  fs.mkdirSync(getPreRunResultsDir(paths.templateRoot), { recursive: true })
}

function copyStaticData(paths, projectId) {
  const bessData = path.join(REPO_ROOT, 'projects/ci-bess-uk/data')
  const names = ['day-ahead-prices.csv', 'PV_Live Historical Results.csv']
  for (const name of names) {
    const src = path.join(bessData, name)
    const dest = path.join(paths.dataDir, name)
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.copyFileSync(src, dest)
    }
  }
}

function writeStudy(paths, projectId, scenario) {
  const study = {
    fxGbpPerEur: SHARED.fxGbpPerEur,
    nbDaysPerPeriod: SHARED.nbDaysPerPeriod,
    siteImportExportLimitsMw: SHARED.siteImportExportLimitsMw,
    gridTariffs: SHARED.gridTariffs,
    siteDataForm: {
      consumptionChoice: scenario.consumptionChoice,
      pvChoice: scenario.pvChoice,
      otherChoice: 'no',
      powerMw: scenario.consumptionMw,
      pvInstalledMw: scenario.pvInstalledMw,
    },
    simulationName: scenario.simulationName,
  }
  if (projectId === 'ci-bess-uk') {
    study.bessSimulationCommitted = SHARED.bessSimulationCommitted
  } else {
    study.v2gSimulationCommitted = SHARED.v2gSimulationCommitted
    study.v2gSchedule = loadV2gSchedule()
  }
  fs.writeFileSync(paths.studyInputsPath, JSON.stringify(study, null, 2), 'utf8')
}

function writeZeroPowerCsv(destPath) {
  const rows = generateConstantMwRows(0)
  fs.writeFileSync(destPath, rowsToPowerCsv(rows), 'utf8')
}

async function writeSiteCsvs(paths, scenario) {
  const consPath = path.join(paths.dataDir, CONSUMPTION_FILENAME)
  const pvPath = path.join(paths.dataDir, PV_SYNTHETIC_FILENAME)

  if (scenario.consumptionChoice === 'yes') {
    const rows = generateConstantMwRows(scenario.consumptionMw)
    fs.writeFileSync(consPath, rowsToPowerCsv(rows), 'utf8')
  } else {
    writeZeroPowerCsv(consPath)
  }

  if (scenario.pvChoice === 'yes') {
    const pv = await writePvSyntheticFromYield(paths.dataDir, scenario.pvInstalledMw, {
      extraSearchDirs: [path.join(REPO_ROOT, 'projects/ci-bess-uk/data')],
      startDate: scenario.startDate,
      endDate: scenario.endDate,
      useApi: true,
    })
    if (!pv.ok) throw new Error(pv.error || 'PV synthetic CSV failed')
  } else {
    writeZeroPowerCsv(pvPath)
  }
}

function runTariffs(paths) {
  const result = executeContinue(
    paths.projectId,
    {
      importNonEnergy: SHARED.gridTariffs.importNonEnergy,
      duos: SHARED.gridTariffs.duos,
      bandMatrix: SHARED.gridTariffs.bandMatrix,
      range: RANGE,
    },
    { paths },
  )
  if (!result.ok) throw new Error(result.error || 'continue / DUoS CSV failed')
}

function runOptimisation(paths) {
  const py = process.env.PYTHON || 'python3'
  console.log(`  Running ${paths.projectId} optimisation…`)
  const t0 = Date.now()
  const r = spawnSync(py, [paths.runScript], {
    cwd: paths.root,
    encoding: 'utf8',
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0)
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout)
    throw new Error(`optimisation exited ${r.status} after ${elapsed}s`)
  }
  console.log(`  Done in ${elapsed}s`)
  let resultsCsv = null
  try {
    const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop()
    if (line) resultsCsv = JSON.parse(line).resultsCsv
  } catch {
    /* ignore */
  }
  if (!resultsCsv && fs.existsSync(paths.lastOutputMarker)) {
    resultsCsv = fs.readFileSync(paths.lastOutputMarker, 'utf8').trim()
  }
  if (!resultsCsv || !fs.existsSync(resultsCsv)) {
    throw new Error('No results CSV produced')
  }
  return resultsCsv
}

function moveToPreRun(resultsCsv, paths, scenario) {
  const preRunDir = getPreRunResultsDir(paths.templateRoot)
  let destName = path.basename(resultsCsv)
  if (scenario?.simulationName) {
    const pv = scenario.pvChoice === 'yes' ? 'pvY' : 'pvN'
    const load = scenario.consumptionChoice === 'yes' ? 'loadY' : 'loadN'
    const stem = destName.replace(/\.csv$/i, '')
    const parts = stem.split('__')
    const simSlug = parts[0]
    const rest = parts.slice(1).join('__')
    destName = `${simSlug}__${pv}__${load}__${rest}.csv`
  }
  const dest = path.join(preRunDir, destName)
  fs.mkdirSync(preRunDir, { recursive: true })
  fs.renameSync(resultsCsv, dest)
  console.log(`  Stored ${path.relative(REPO_ROOT, dest)}`)
  return dest
}

async function runProjectScenario(projectId, scenarioKey) {
  const scenario = SCENARIOS[scenarioKey]
  const paths = projectPaths(projectId)
  ensureDirs(paths)
  copyStaticData(paths, projectId)
  writeStudy(paths, projectId, scenario)
  runTariffs(paths)
  await writeSiteCsvs(paths, scenario)
  const csv = runOptimisation(paths)
  moveToPreRun(csv, paths, scenario)
}

function deleteV2gPreRunResults() {
  const preRunDir = getPreRunResultsDir(
    path.join(REPO_ROOT, 'projects', 'v2g-uk'),
  )
  rmCsvRecursive(preRunDir)
}

async function main() {
  if (process.env.V2G_ONLY === '1') {
    console.log('Regenerating V2G pre-run demo only…')
    deleteV2gPreRunResults()
    for (const scenarioKey of ['noSite', 'withSite']) {
      console.log(`\n=== v2g-uk / ${scenarioKey} ===`)
      await runProjectScenario('v2g-uk', scenarioKey)
    }
    console.log('\nV2G pre-run results updated.')
    return
  }

  deleteAllResults()
  const order = [
    ['ci-bess-uk', 'noSite'],
    ['ci-bess-uk', 'withSite'],
    ['v2g-uk', 'noSite'],
    ['v2g-uk', 'withSite'],
  ]
  for (const [projectId, scenarioKey] of order) {
    console.log(`\n=== ${projectId} / ${scenarioKey} ===`)
    await runProjectScenario(projectId, scenarioKey)
  }
  console.log('\nAll pre-run results written to projects/*/results/pre-run/')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
