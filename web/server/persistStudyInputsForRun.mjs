import fs from 'fs'
import { executeSaveStudyInputs } from './studyInputsCore.mjs'

const STUDY_FIELD_KEYS = new Set([
  'bessSimulationCommitted',
  'v2gSimulationCommitted',
  'siteDataForm',
  'gridTariffs',
  'siteImportExportLimitsMw',
  'v2gSchedule',
  'simulationName',
  'fxGbpPerEur',
  'nbDaysPerPeriod',
])

/** Study payload from run POST body (studySnapshot wrapper or flat fields). */
export function extractStudyPayload(body) {
  if (!body || typeof body !== 'object') return null
  if (body.studySnapshot && typeof body.studySnapshot === 'object') {
    return body.studySnapshot
  }
  if (body.studyInputs && typeof body.studyInputs === 'object') {
    return body.studyInputs
  }
  const rest = {}
  for (const [k, v] of Object.entries(body)) {
    if (k === 'guestSessionId') continue
    if (STUDY_FIELD_KEYS.has(k)) rest[k] = v
  }
  return Object.keys(rest).length ? rest : null
}

export function guestSessionIdFromPaths(paths) {
  const ws = paths?.workspaceId
  return typeof ws === 'string' && ws.startsWith('guest:') ? ws.slice(6) : undefined
}

/** Write study_inputs.json on this workspace before optimisation (same request). */
export function persistStudyInputsBeforeRun(projectId, body, paths) {
  const payload = extractStudyPayload(body)
  if (!payload) return { ok: true }
  return executeSaveStudyInputs(projectId, payload, { paths })
}

export function studyInputsMissingResponse(paths) {
  return {
    ok: false,
    status: 400,
    error:
      'Study inputs have not been submitted. Complete Grid tariffs, Site data, and BESS simulation, then save before running the optimisation.',
    workspaceId: paths.workspaceId,
    studyInputsPath: paths.studyInputsPath,
    guestSessionId: guestSessionIdFromPaths(paths),
    fileExists: fs.existsSync(paths.studyInputsPath),
  }
}
