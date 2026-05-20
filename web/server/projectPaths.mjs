import fs from 'fs'
import path from 'path'
import { PROJECTS_DIR } from './repoRoot.mjs'
import { getProjectById } from './projectsRegistry.mjs'

/**
 * Resolved filesystem paths for one analytics project.
 * @param {string} projectId
 */
export function resolveProjectPaths(projectId) {
  const meta = getProjectById(projectId)
  if (!meta) return null

  const root = path.join(PROJECTS_DIR, projectId)
  const optimisationDir = path.join(root, 'optimisation')
  const dataDir = path.join(root, 'data')
  const resultsDir = path.join(root, 'results')

  return {
    projectId,
    meta,
    root,
    dataDir,
    resultsDir,
    optimisationDir,
    studyInputsPath: path.join(optimisationDir, 'study_inputs.json'),
    lastOutputMarker: path.join(optimisationDir, '.last_optimisation_output.txt'),
    runScript: path.join(optimisationDir, 'run_optimisation_from_study.py'),
    projectKind: meta.id === 'v2g-uk' ? 'v2g' : 'bess',
  }
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

/** Ensures `data/`, `results/`, and `optimisation/` exist for a project. */
export function ensureProjectDirs(paths) {
  for (const dir of [paths.dataDir, paths.resultsDir, paths.optimisationDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function isPathInsideRoot(root, resolvedPath) {
  const rel = path.relative(root, resolvedPath)
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}
