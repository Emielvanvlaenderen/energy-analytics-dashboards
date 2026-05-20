import { spawn } from 'child_process'
import fs from 'fs'
import { projectNotAvailable } from './projectPaths.mjs'
import { isProjectAvailable } from './projectsRegistry.mjs'
import {
  persistStudyInputsBeforeRun,
  studyInputsMissingResponse,
} from './persistStudyInputsForRun.mjs'

/**
 * Runs `projects/{id}/optimisation/run_optimisation_from_study.py`.
 * POST body may include `studySnapshot` (written on this workspace before run).
 */
export function executeRunBessOptimisation(projectId, body, { paths: pathsIn } = {}) {
  const paths = pathsIn
  if (!paths?.studyInputsPath) {
    return Promise.resolve({
      ok: false,
      status: 500,
      error: 'Server misconfiguration: workspace paths missing on optimisation run.',
    })
  }
  if (!isProjectAvailable(projectId)) {
    return Promise.resolve(projectNotAvailable(projectId))
  }

  const saved = persistStudyInputsBeforeRun(projectId, body, paths)
  if (!saved.ok) return Promise.resolve(saved)

  if (!fs.existsSync(paths.studyInputsPath)) {
    return Promise.resolve(studyInputsMissingResponse(paths))
  }

  if (!fs.existsSync(paths.runScript)) {
    return Promise.resolve({
      ok: false,
      status: 500,
      error: `Missing ${paths.runScript}`,
    })
  }

  return new Promise((resolve) => {
    const py = process.env.PYTHON || 'python3'
    const args = [paths.runScript]
    const child = spawn(py, args, {
      cwd: paths.root,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })
    let stderr = ''
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    child.on('error', (err) => {
      resolve({
        ok: false,
        status: 500,
        error: err.message,
        stdout,
        stderr,
      })
    })
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          status: 500,
          error:
            stderr.trim() ||
            stdout.trim() ||
            `optimisation script exited with code ${code}`,
          stdout,
          stderr,
        })
        return
      }
      let resultsCsv = null
      try {
        const line = stdout.trim().split('\n').filter(Boolean).pop()
        if (line) {
          const j = JSON.parse(line)
          if (j.resultsCsv) resultsCsv = j.resultsCsv
        }
      } catch {
        /* ignore */
      }
      if (!resultsCsv) {
        try {
          if (fs.existsSync(paths.lastOutputMarker)) {
            resultsCsv = fs.readFileSync(paths.lastOutputMarker, 'utf8').trim()
          }
        } catch {
          /* ignore */
        }
      }
      resolve({
        ok: true,
        status: 200,
        resultsCsv,
        stdout: stdout.length > 8000 ? stdout.slice(-8000) : stdout,
      })
    })
  })
}
