import { spawn } from 'child_process'
import fs from 'fs'
import {
  projectNotAvailable,
  projectNotFound,
  resolveProjectPaths,
} from './projectPaths.mjs'
import { isProjectAvailable } from './projectsRegistry.mjs'

export function executeRunV2gOptimisation(projectId, { paths: pathsIn } = {}) {
  const paths = pathsIn ?? resolveProjectPaths(projectId)
  if (!paths) return Promise.resolve(projectNotFound(projectId))
  if (!isProjectAvailable(projectId)) {
    return Promise.resolve(projectNotAvailable(projectId))
  }

  if (!fs.existsSync(paths.studyInputsPath)) {
    return Promise.resolve({
      ok: false,
      status: 400,
      error:
        'Study inputs have not been submitted. Complete Grid tariffs, Site data, and V2G simulation, then save before running.',
    })
  }

  const script = paths.runScript
  if (!fs.existsSync(script)) {
    return Promise.resolve({
      ok: false,
      status: 500,
      error: `Missing ${script}`,
    })
  }

  return new Promise((resolve) => {
    const py = process.env.PYTHON || 'python3'
    const child = spawn(py, [script], {
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
            `V2G optimisation script exited with code ${code}`,
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
      if (!resultsCsv && fs.existsSync(paths.lastOutputMarker)) {
        try {
          resultsCsv = fs.readFileSync(paths.lastOutputMarker, 'utf8').trim()
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
