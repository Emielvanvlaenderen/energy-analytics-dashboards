import fs from 'fs'
import { slugSimulationName } from './simulationFilename.mjs'
import {
  ensureProjectDirs,
  projectNotFound,
  resolveProjectPaths,
} from './projectPaths.mjs'
import { guestSessionIdFromPaths } from './persistStudyInputsForRun.mjs'

export const STUDY_INPUTS_FILENAME = 'study_inputs.json'

function readStudyInputsSync(studyInputsPath) {
  try {
    if (!fs.existsSync(studyInputsPath)) return null
    const raw = fs.readFileSync(studyInputsPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function validateV2gCommitted(v) {
  if (!v || typeof v !== 'object') return 'Invalid v2gSimulationCommitted'
  const keys = [
    'startDate',
    'endDate',
    'energyBessMwh',
    'maxPowerBessMw',
    'socLowerPct',
    'socUpperPct',
    'targetSocPct',
    'returnSocPct',
    'chargingEfficiencyPct',
    'dischargingEfficiencyPct',
    'simulationType',
  ]
  for (const k of keys) {
    if (typeof v[k] === 'undefined') return `Missing v2gSimulationCommitted.${k}`
  }
  return null
}

function validateBessCommitted(b) {
  if (!b || typeof b !== 'object') return 'Invalid bessSimulationCommitted'
  const keys = [
    'startDate',
    'endDate',
    'capacityMw',
    'durationHours',
    'roundtripEfficiencyPct',
    'socLowerPct',
    'socUpperPct',
    'cyclesPerDayTarget',
  ]
  for (const k of keys) {
    if (typeof b[k] === 'undefined') return `Missing bessSimulationCommitted.${k}`
  }
  return null
}

function validateSiteLimitsMw(limits) {
  if (limits === null || limits === undefined) return null
  if (typeof limits !== 'object') return 'Invalid siteImportExportLimitsMw'
  const { maxImportMw, maxExportMw } = limits
  if (!Number.isFinite(Number(maxImportMw)) || !Number.isFinite(Number(maxExportMw))) {
    return 'siteImportExportLimitsMw must include numeric maxImportMw and maxExportMw'
  }
  return null
}

export function executeGetStudyInputs(projectId, { paths: pathsIn } = {}) {
  const paths = pathsIn ?? resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)

  try {
    const study = readStudyInputsSync(paths.studyInputsPath)
    return {
      ok: true,
      status: 200,
      study,
      workspaceId: paths.workspaceId,
      guestSessionId: guestSessionIdFromPaths(paths),
    }
  } catch (e) {
    console.error(e)
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : 'Failed to read study_inputs.json',
    }
  }
}

export function executeSaveStudyInputs(projectId, body, { paths: pathsIn } = {}) {
  const paths = pathsIn ?? resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)

  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid body' }
  }

  const existing = readStudyInputsSync(paths.studyInputsPath) || {}
  const merged = { ...existing }

  if (body.siteImportExportLimitsMw !== undefined) {
    if (body.siteImportExportLimitsMw != null) {
      const err = validateSiteLimitsMw(body.siteImportExportLimitsMw)
      if (err) return { ok: false, status: 400, error: err }
    }
    merged.siteImportExportLimitsMw = body.siteImportExportLimitsMw
  }

  if (body.bessSimulationCommitted !== undefined) {
    const err = validateBessCommitted(body.bessSimulationCommitted)
    if (err) return { ok: false, status: 400, error: err }
    merged.bessSimulationCommitted = body.bessSimulationCommitted
  }

  if (body.v2gSimulationCommitted !== undefined) {
    const err = validateV2gCommitted(body.v2gSimulationCommitted)
    if (err) return { ok: false, status: 400, error: err }
    merged.v2gSimulationCommitted = body.v2gSimulationCommitted
  }

  if (body.v2gSchedule !== undefined) {
    merged.v2gSchedule = body.v2gSchedule
  }

  if (body.simulationName !== undefined) {
    if (body.simulationName == null || body.simulationName === '') {
      delete merged.simulationName
    } else if (typeof body.simulationName !== 'string') {
      return { ok: false, status: 400, error: 'simulationName must be a string' }
    } else {
      const trimmed = body.simulationName.trim()
      if (!trimmed) {
        return { ok: false, status: 400, error: 'simulationName cannot be empty' }
      }
      if (trimmed.length > 64) {
        return { ok: false, status: 400, error: 'simulationName must be 64 characters or fewer' }
      }
      const slug = slugSimulationName(trimmed)
      if (!slug) {
        return { ok: false, status: 400, error: 'simulationName must include letters or numbers' }
      }
      merged.simulationName = trimmed
    }
  }

  if (body.fxGbpPerEur !== undefined) {
    merged.fxGbpPerEur =
      typeof body.fxGbpPerEur === 'number' && Number.isFinite(body.fxGbpPerEur)
        ? body.fxGbpPerEur
        : merged.fxGbpPerEur ?? 0.85
  }

  if (body.nbDaysPerPeriod !== undefined) {
    merged.nbDaysPerPeriod =
      Number.isFinite(Number(body.nbDaysPerPeriod)) && Number(body.nbDaysPerPeriod) > 0
        ? Number(body.nbDaysPerPeriod)
        : merged.nbDaysPerPeriod ?? 3
  }

  if (body.gridTariffs !== undefined) {
    merged.gridTariffs = body.gridTariffs
  }

  if (body.siteDataForm !== undefined) {
    merged.siteDataForm = { ...(merged.siteDataForm || {}), ...body.siteDataForm }
  }

  if (merged.fxGbpPerEur == null || !Number.isFinite(merged.fxGbpPerEur)) {
    merged.fxGbpPerEur = 0.85
  }
  if (
    merged.nbDaysPerPeriod == null ||
    !Number.isFinite(merged.nbDaysPerPeriod) ||
    merged.nbDaysPerPeriod <= 0
  ) {
    merged.nbDaysPerPeriod = 3
  }

  try {
    ensureProjectDirs(paths)
    fs.writeFileSync(paths.studyInputsPath, JSON.stringify(merged, null, 2), 'utf8')
    return {
      ok: true,
      status: 200,
      file: STUDY_INPUTS_FILENAME,
      directory: paths.optimisationDir,
      workspaceId: paths.workspaceId,
      guestSessionId: guestSessionIdFromPaths(paths),
    }
  } catch (e) {
    console.error(e)
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : 'Failed to write study_inputs.json',
    }
  }
}

export function saveGridTariffsToStudyInputs(
  projectId,
  { importNonEnergy, duos, bandMatrix },
  options = {},
) {
  return executeSaveStudyInputs(
    projectId,
    {
    gridTariffs: {
      importNonEnergy: importNonEnergy ?? '',
      duos,
      bandMatrix,
    },
    },
    options,
  )
}
