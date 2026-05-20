import fs from 'fs'
import path from 'path'
import { validateDuosChargesForm } from '../lib/duosFormValidation.js'
import { saveGridTariffsToStudyInputs } from './studyInputsCore.mjs'
import {
  generateChargeRows,
  rowsToExportCsv,
  rowsToImportCsv,
} from './generateChargeSeries.mjs'
import {
  ensureProjectDirs,
  projectNotAvailable,
  projectNotFound,
  resolveProjectPaths,
} from './projectPaths.mjs'
import { isProjectAvailable } from './projectsRegistry.mjs'

export const IMPORT_FILENAME = 'site_import_charges_timeseries.csv'
export const EXPORT_FILENAME = 'site_export_charges_timeseries.csv'

export function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'Invalid body'
  const { duos, bandMatrix } = body
  if (!duos || typeof duos !== 'object') return 'Missing duos'
  for (const c of ['green', 'amber', 'red']) {
    if (!duos[c] || typeof duos[c].import === 'undefined') {
      return `Missing duos.${c}`
    }
    if (typeof duos[c].export === 'undefined') {
      return `Missing duos.${c}.export`
    }
  }
  if (!Array.isArray(bandMatrix) || bandMatrix.length !== 2) {
    return 'bandMatrix must be 2 rows (weekday / weekend)'
  }
  for (const row of bandMatrix) {
    if (!Array.isArray(row) || row.length !== 48) {
      return 'bandMatrix rows must have 48 half-hour slots'
    }
    for (const cell of row) {
      if (!['green', 'amber', 'red'].includes(cell)) {
        return 'Invalid band cell'
      }
    }
  }
  return null
}

/**
 * Import charge per interval = Import DUoS (band) + non-energy (flat add-on).
 * Export charge per interval = Export DUoS (band) only.
 */
export function executeContinue(projectId, body) {
  const paths = resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)
  if (!isProjectAvailable(projectId)) return projectNotAvailable(projectId)

  const err = validatePayload(body)
  if (err) {
    return { ok: false, status: 400, error: err }
  }

  const business = validateDuosChargesForm(body)
  if (!business.ok) {
    return { ok: false, status: 400, error: business.message }
  }

  try {
    const { importNonEnergy = '', duos, bandMatrix, range } = body
    const rows = generateChargeRows({
      importNonEnergy,
      duos,
      bandMatrix,
      range,
    })

    ensureProjectDirs(paths)

    const importPath = path.join(paths.dataDir, IMPORT_FILENAME)
    const exportPath = path.join(paths.dataDir, EXPORT_FILENAME)

    fs.writeFileSync(importPath, rowsToImportCsv(rows), 'utf8')
    fs.writeFileSync(exportPath, rowsToExportCsv(rows), 'utf8')

    const saved = saveGridTariffsToStudyInputs(projectId, {
      importNonEnergy,
      duos,
      bandMatrix,
    })
    if (!saved.ok) {
      return {
        ok: false,
        status: saved.status ?? 500,
        error:
          typeof saved.error === 'string'
            ? saved.error
            : 'Wrote CSVs but failed to save grid tariffs to study_inputs.json',
      }
    }

    return {
      ok: true,
      status: 200,
      files: {
        import: IMPORT_FILENAME,
        export: EXPORT_FILENAME,
        directory: paths.dataDir,
        rowCount: rows.length,
      },
    }
  } catch (e) {
    console.error(e)
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : 'Failed to write CSV files',
    }
  }
}
