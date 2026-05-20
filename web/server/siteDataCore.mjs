import fs from 'fs'
import path from 'path'
import {
  generateConstantMwRows,
  rowsToPowerCsv,
} from './generateConstantMwSeries.mjs'
import { writePvSyntheticFromYield } from './pvYieldSynthetic.mjs'
import {
  ensureProjectDirs,
  projectNotAvailable,
  projectNotFound,
  resolveProjectPaths,
} from './projectPaths.mjs'
import { isProjectAvailable } from './projectsRegistry.mjs'

export const CONSUMPTION_FILENAME = 'site_consumption_constant_mw.csv'

export function validateConsumptionConstantPayload(body) {
  if (!body || typeof body !== 'object') return 'Invalid body'
  const { powerMw } = body
  if (powerMw === '' || powerMw == null) return 'Missing powerMw'
  const n = Number.parseFloat(String(powerMw))
  if (!Number.isFinite(n) || n <= 0) return 'powerMw must be a positive number'
  return null
}

export function executeConsumptionConstant(projectId, body) {
  const paths = resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)
  if (!isProjectAvailable(projectId)) return projectNotAvailable(projectId)

  const err = validateConsumptionConstantPayload(body)
  if (err) {
    return { ok: false, status: 400, error: err }
  }

  try {
    const powerMw = Number.parseFloat(String(body.powerMw))
    const rows = generateConstantMwRows(powerMw)

    ensureProjectDirs(paths)

    const outPath = path.join(paths.dataDir, CONSUMPTION_FILENAME)
    fs.writeFileSync(outPath, rowsToPowerCsv(rows), 'utf8')

    return {
      ok: true,
      status: 200,
      files: {
        filename: CONSUMPTION_FILENAME,
        directory: paths.dataDir,
        rowCount: rows.length,
      },
    }
  } catch (e) {
    console.error(e)
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : 'Failed to write CSV',
    }
  }
}

export function validateInstalledMwPayload(body) {
  if (!body || typeof body !== 'object') return 'Invalid body'
  const { installedMw } = body
  if (installedMw === '' || installedMw == null) return 'Missing installedMw'
  const n = Number.parseFloat(String(installedMw))
  if (!Number.isFinite(n) || n <= 0) {
    return 'installedMw must be a positive number (MW)'
  }
  return null
}

export function executePvSyntheticFromYield(projectId, body) {
  const paths = resolveProjectPaths(projectId)
  if (!paths) return projectNotFound(projectId)
  if (!isProjectAvailable(projectId)) return projectNotAvailable(projectId)

  const err = validateInstalledMwPayload(body)
  if (err) {
    return { ok: false, status: 400, error: err }
  }

  try {
    const installedMw = Number.parseFloat(String(body.installedMw))
    return writePvSyntheticFromYield(paths.dataDir, installedMw)
  } catch (e) {
    console.error(e)
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : 'Failed to build PV synthetic CSV',
    }
  }
}
