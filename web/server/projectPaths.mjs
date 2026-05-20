import fs from 'fs'
import path from 'path'
import {
  getDataRoot,
  resolveProjectPaths as resolveWorkspacePaths,
} from './workspaceCore.mjs'
import { getProjectById } from './projectsRegistry.mjs'

export { getDataRoot }

/**
 * @param {string} projectId
 * @param {string} [workspaceId] e.g. guest:uuid
 */
export function resolveProjectPaths(projectId, workspaceId = 'guest:local') {
  return resolveWorkspacePaths(projectId, workspaceId)
}

export function projectNotFound(projectId) {
  return {
    ok: false,
    status: 404,
    error: `Unknown project "${projectId}".`,
  }
}

export function projectNotAvailable(projectId) {
  return {
    ok: false,
    status: 503,
    error: `Project "${projectId}" is not available yet.`,
  }
}

/** Ensures `data/`, `results/`, and `optimisation/` exist for a project workspace. */
export function ensureProjectDirs(paths) {
  for (const dir of [paths.dataDir, paths.resultsDir, paths.optimisationDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function isPathInsideRoot(root, resolvedPath) {
  const rel = path.relative(root, resolvedPath)
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}
