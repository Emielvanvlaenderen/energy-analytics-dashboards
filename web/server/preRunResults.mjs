import fs from 'fs'
import path from 'path'
import { isPathInsideRoot } from './projectPaths.mjs'

export const PRE_RUN_SUBDIR = 'pre-run'

/** Single simulation group for all bundled demo CSVs (PV/load variants are separate runs). */
export const PRE_RUN_SIMULATION_NAME = 'Pre-run_demo'

export function getPreRunResultsDir(templateRoot) {
  return path.join(templateRoot, 'results', PRE_RUN_SUBDIR)
}

function listCsvInDir(dir) {
  if (!fs.existsSync(dir)) return []
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.csv'))
  return names.map((filename) => {
    const full = path.join(dir, filename)
    let mtimeMs = 0
    try {
      mtimeMs = fs.statSync(full).mtimeMs
    } catch {
      /* ignore */
    }
    return { path: full, filename, mtimeMs }
  })
}

/** Workspace results plus bundled pre-run CSVs (pre-run listed first). */
export function listAllResultCsvEntries(paths) {
  const preRunDir = getPreRunResultsDir(paths.templateRoot)
  const workspaceDir = paths.resultsDir
  const seen = new Set()
  const out = []

  for (const [dir, isPreRun] of [
    [preRunDir, true],
    [workspaceDir, false],
  ]) {
    for (const row of listCsvInDir(dir)) {
      if (seen.has(row.filename)) continue
      seen.add(row.filename)
      out.push({ ...row, isPreRun })
    }
  }

  out.sort((a, b) => {
    if (a.isPreRun !== b.isPreRun) return a.isPreRun ? -1 : 1
    return b.mtimeMs - a.mtimeMs
  })
  return out
}

/**
 * Resolve a results CSV path: workspace `results/`, then template `results/pre-run/`.
 */
export function resolveResultsCsvPath(paths, fileQuery) {
  const { resultsDir, lastOutputMarker, root, templateRoot } = paths
  const preRunDir = getPreRunResultsDir(templateRoot)
  const repoRoot = templateRoot

  const searchDirs = [resultsDir, preRunDir]

  if (fileQuery && typeof fileQuery === 'string' && fileQuery.trim()) {
    const safe = path.basename(fileQuery.trim())
    if (safe !== fileQuery.trim() || safe.includes('..')) {
      return { error: 'Invalid file.', status: 400 }
    }
    for (const dir of searchDirs) {
      const csvPath = path.join(dir, safe)
      const inWorkspace =
        isPathInsideRoot(root, csvPath) && fs.existsSync(csvPath)
      const inPreRun =
        isPathInsideRoot(repoRoot, csvPath) &&
        dir === preRunDir &&
        fs.existsSync(csvPath)
      if (inWorkspace || inPreRun) {
        return { csvPath }
      }
    }
    return { error: 'Results file not found.', status: 404 }
  }

  if (fs.existsSync(lastOutputMarker)) {
    const rawPath = fs.readFileSync(lastOutputMarker, 'utf8').trim()
    if (rawPath) {
      const csvPath = path.resolve(rawPath)
      if (fs.existsSync(csvPath)) {
        if (isPathInsideRoot(root, csvPath)) return { csvPath }
        if (isPathInsideRoot(repoRoot, csvPath)) return { csvPath }
      }
    }
  }

  const all = listAllResultCsvEntries(paths)
  if (all.length) {
    return { csvPath: all[0].path }
  }

  return {
    error: 'No optimisation results yet. Run Simulate BESS or add CSV files to results/.',
    status: 404,
  }
}
