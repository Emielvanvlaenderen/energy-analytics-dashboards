import fs from 'fs'
import path from 'path'
import { isPathInsideRoot } from './projectPaths.mjs'
import { parseSiteDataTagsFromParametersLabel } from './siteDataLabels.mjs'
import { parseSimulationFilename } from './simulationFilename.mjs'
import { getPreRunResultsDir } from './preRunResults.mjs'

/** Keep aligned with scripts/generate-pre-run-results.mjs SHARED block. */
function slotIndex(hour, minute = 0) {
  return hour * 2 + (minute >= 30 ? 1 : 0)
}

function buildDemoBandMatrix() {
  const weekday = Array(48).fill('green')
  const amberFrom = slotIndex(7, 0)
  const amberTo = slotIndex(22, 0) - 1
  const redFrom = slotIndex(16, 0)
  const redTo = slotIndex(20, 0) - 1
  for (let s = amberFrom; s <= amberTo; s++) weekday[s] = 'amber'
  for (let s = redFrom; s <= redTo; s++) weekday[s] = 'red'
  return [weekday, Array(48).fill('green')]
}

const DEMO_GRID_TARIFFS = {
  importNonEnergy: '70',
  duos: {
    green: { import: '1', export: '-1' },
    amber: { import: '10', export: '-10' },
    red: { import: '60', export: '-60' },
  },
  bandMatrix: buildDemoBandMatrix(),
}

const DEMO_BESS = {
  startDate: '2024-01-01',
  endDate: '2026-05-01',
  capacityMw: 1,
  durationHours: 2,
  chargingEfficiencyPct: 95,
  dischargingEfficiencyPct: 95,
  socLowerPct: 10,
  socUpperPct: 90,
  cyclesPerDayTarget: 1,
}

const DEMO_V2G = {
  startDate: '2024-01-01',
  endDate: '2026-05-01',
  capacityMw: 7,
  durationHours: 8,
  energyBessMwh: 56,
  maxPowerBessMw: 7,
  socLowerPct: 20,
  socUpperPct: 90,
  returnSocPct: 30,
  targetSocPct: 90,
  chargingEfficiencyPct: 90,
  dischargingEfficiencyPct: 90,
  simulationType: 'V2G',
}

function loadTemplateV2gSchedule(templateRoot) {
  try {
    const p = path.join(templateRoot, 'optimisation', 'study_inputs.json')
    const study = JSON.parse(fs.readFileSync(p, 'utf8'))
    return study.v2gSchedule ?? null
  } catch {
    return null
  }
}

function siteDataFormFromFilename(filename) {
  const parsed = parseSimulationFilename(filename)
  const flags = parseSiteDataTagsFromParametersLabel(parsed.parametersLabel)
  const withSite = flags.pv === true && flags.consumption === true
  return {
    consumptionChoice: withSite ? 'yes' : 'no',
    pvChoice: withSite ? 'yes' : 'no',
    otherChoice: 'no',
    powerMw: withSite ? 0.5 : 0,
    pvInstalledMw: withSite ? 1 : 0,
  }
}

export function isPreRunResultsCsvPath(paths, csvPath) {
  if (!paths?.templateRoot || !csvPath) return false
  const preRunDir = getPreRunResultsDir(paths.templateRoot)
  return isPathInsideRoot(preRunDir, csvPath)
}

/** Study inputs snapshot for bundled demo CSVs (matches pre-run generator). */
export function getPreRunStudySnapshot(projectId, filename, { templateRoot } = {}) {
  const study = {
    fxGbpPerEur: 0.85,
    nbDaysPerPeriod: 3,
    siteImportExportLimitsMw: { maxImportMw: 2, maxExportMw: 2 },
    gridTariffs: DEMO_GRID_TARIFFS,
    siteDataForm: siteDataFormFromFilename(filename),
    simulationName: 'Pre-run_demo',
  }

  if (projectId === 'v2g-uk') {
    study.v2gSimulationCommitted = DEMO_V2G
    if (templateRoot) {
      study.v2gSchedule = loadTemplateV2gSchedule(templateRoot)
    }
  } else {
    study.bessSimulationCommitted = DEMO_BESS
  }

  return study
}

export function resolveStudyForRunSummary(paths, projectId, csvPath) {
  if (isPreRunResultsCsvPath(paths, csvPath)) {
    return getPreRunStudySnapshot(projectId, path.basename(csvPath), {
      templateRoot: paths.templateRoot,
    })
  }
  try {
    if (paths?.studyInputsPath && fs.existsSync(paths.studyInputsPath)) {
      return JSON.parse(fs.readFileSync(paths.studyInputsPath, 'utf8'))
    }
  } catch {
    /* ignore */
  }
  return null
}
