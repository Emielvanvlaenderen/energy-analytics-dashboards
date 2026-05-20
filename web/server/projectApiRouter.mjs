import { Router } from 'express'
import fs from 'fs'
import { executeContinue } from './continueCore.mjs'
import {
  executeConsumptionConstant,
  executePvSyntheticFromYield,
} from './siteDataCore.mjs'
import {
  executeGetBessResults,
  executeListBessSimulations,
  executeDownloadResults,
} from './bessResultsCore.mjs'
import {
  executeGetStudyInputs,
  executeSaveStudyInputs,
} from './studyInputsCore.mjs'
import { executeRunBessOptimisation } from './runBessOptimisation.mjs'
import { executeRunV2gOptimisation } from './runV2gOptimisation.mjs'
import { executeGetV2gResults } from './v2gResultsCore.mjs'
import { projectNotFound } from './projectPaths.mjs'
import { resolveResultsPaths } from './workspaceCore.mjs'
import { getProjectById } from './projectsRegistry.mjs'
import { isSupabaseConfigured } from './authCore.mjs'
import {
  executeDeleteSavedSimulation,
  executeDownloadSavedSimulation,
  executeListSavedSimulations,
  executeSaveCurrentSimulation,
} from './savedSimulationsCore.mjs'

function requireProject(req, res, next) {
  const projectId = req.params.projectId
  if (!getProjectById(projectId)) {
    const result = projectNotFound(projectId)
    return res.status(result.status).json({ ok: false, error: result.error })
  }
  req.projectId = projectId
  next()
}

function requireAuth(req, res, next) {
  if (!req.authUser) {
    const hasBearer = /^Bearer\s+\S+/i.test(req.headers.authorization || '')
    return res.status(401).json({
      ok: false,
      error: hasBearer
        ? 'Session could not be verified on the API. Sign out and sign in again. If this persists, check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY) on Render.'
        : 'Sign in with GitHub to save simulations to your account.',
    })
  }
  if (!isSupabaseConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'Account storage is not configured on this server.',
    })
  }
  next()
}

const ws = (req) => ({ paths: req.paths })

/** Project-scoped API under `/api/projects/:projectId`. */
export function createProjectApiRouter() {
  const router = Router({ mergeParams: true })

  router.use(requireProject)

  router.get('/study-inputs', (req, res) => {
    const result = executeGetStudyInputs(req.projectId, ws(req))
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, study: result.study })
  })

  router.post('/study-inputs', (req, res) => {
    const result = executeSaveStudyInputs(req.projectId, req.body, ws(req))
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, ...result })
  })

  router.get('/bess-simulations', (req, res) => {
    const result = executeListBessSimulations(req.projectId, {
      paths: resolveResultsPaths(req),
    })
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({
      ok: true,
      simulations: result.simulations,
      groups: result.groups,
      activeFile: result.activeFile,
    })
  })

  router.get('/bess-results', (req, res) => {
    const file =
      typeof req.query.file === 'string' ? req.query.file : undefined
    const resultPaths = { paths: resolveResultsPaths(req) }
    const result =
      req.paths?.projectKind === 'v2g'
        ? executeGetV2gResults(req.projectId, { file }, resultPaths)
        : executeGetBessResults(req.projectId, { file }, resultPaths)
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({
      ok: true,
      resultsPath: result.resultsPath,
      rowCount: result.rowCount,
      monthlyAdded: result.monthlyAdded,
      series: result.series,
    })
  })

  /** Guest download of latest (or selected) results CSV — no auth. */
  router.get('/bess-results/download', (req, res) => {
    const file =
      typeof req.query.file === 'string' ? req.query.file : undefined
    const result = executeDownloadResults(
      req.projectId,
      { file },
      { paths: resolveResultsPaths(req) },
    )
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    )
    fs.createReadStream(result.csvPath).pipe(res)
  })

  router.get('/saved-simulations', requireAuth, async (req, res) => {
    const result = await executeListSavedSimulations(
      req.projectId,
      req.authUser.id,
    )
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, simulations: result.simulations })
  })

  router.post('/saved-simulations', requireAuth, async (req, res) => {
    const result = await executeSaveCurrentSimulation(
      req.projectId,
      req.authUser.id,
      req.body,
      { paths: resolveResultsPaths(req) },
    )
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.status(result.status).json({
      ok: true,
      simulation: result.simulation,
    })
  })

  router.get('/saved-simulations/:id/download', requireAuth, async (req, res) => {
    const result = await executeDownloadSavedSimulation(
      req.projectId,
      req.authUser.id,
      req.params.id,
    )
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    )
    return res.send(result.buffer)
  })

  router.delete('/saved-simulations/:id', requireAuth, async (req, res) => {
    const result = await executeDeleteSavedSimulation(
      req.projectId,
      req.authUser.id,
      req.params.id,
    )
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true })
  })

  router.post('/continue', (req, res) => {
    const result = executeContinue(req.projectId, req.body, ws(req))
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, files: result.files })
  })

  router.post('/site-data/consumption-constant', (req, res) => {
    const result = executeConsumptionConstant(req.projectId, req.body, ws(req))
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, files: result.files })
  })

  router.post('/site-data/pv-synthetic-from-yield', (req, res) => {
    const result = executePvSyntheticFromYield(req.projectId, req.body, ws(req))
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, files: result.files })
  })

  router.post('/run-bess-optimisation', async (req, res) => {
    req.setTimeout(0)
    res.setTimeout(0)
    const result = await (req.paths?.projectKind === 'v2g'
      ? executeRunV2gOptimisation(req.projectId, req.body, ws(req))
      : executeRunBessOptimisation(req.projectId, req.body, ws(req)))
    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        error: result.error,
        workspaceId: result.workspaceId,
        guestSessionId: result.guestSessionId,
        studyInputsPath: result.studyInputsPath,
        fileExists: result.fileExists,
        stdout: result.stdout,
        stderr: result.stderr,
      })
    }
    return res.json({
      ok: true,
      resultsCsv: result.resultsCsv,
    })
  })

  return router
}
