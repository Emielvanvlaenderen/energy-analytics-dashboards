import { Router } from 'express'
import { executeContinue } from './continueCore.mjs'
import {
  executeConsumptionConstant,
  executePvSyntheticFromYield,
} from './siteDataCore.mjs'
import {
  executeGetBessResults,
  executeListBessSimulations,
} from './bessResultsCore.mjs'
import {
  executeGetStudyInputs,
  executeSaveStudyInputs,
} from './studyInputsCore.mjs'
import { executeRunBessOptimisation } from './runBessOptimisation.mjs'
import { executeRunV2gOptimisation } from './runV2gOptimisation.mjs'
import { executeGetV2gResults } from './v2gResultsCore.mjs'
import { projectNotFound, resolveProjectPaths } from './projectPaths.mjs'
import { getProjectById } from './projectsRegistry.mjs'

function requireProject(req, res, next) {
  const projectId = req.params.projectId
  if (!getProjectById(projectId)) {
    const result = projectNotFound(projectId)
    return res.status(result.status).json({ ok: false, error: result.error })
  }
  req.projectId = projectId
  next()
}

/** Project-scoped API under `/api/projects/:projectId`. */
export function createProjectApiRouter() {
  const router = Router({ mergeParams: true })

  router.use(requireProject)

  router.get('/study-inputs', (req, res) => {
    const result = executeGetStudyInputs(req.projectId)
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, study: result.study })
  })

  router.post('/study-inputs', (req, res) => {
    const result = executeSaveStudyInputs(req.projectId, req.body)
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, ...result })
  })

  router.get('/bess-simulations', (req, res) => {
    const result = executeListBessSimulations(req.projectId)
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
    const paths = resolveProjectPaths(req.projectId)
    const result =
      paths?.projectKind === 'v2g'
        ? executeGetV2gResults(req.projectId, { file })
        : executeGetBessResults(req.projectId, { file })
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

  router.post('/continue', (req, res) => {
    const result = executeContinue(req.projectId, req.body)
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, files: result.files })
  })

  router.post('/site-data/consumption-constant', (req, res) => {
    const result = executeConsumptionConstant(req.projectId, req.body)
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, files: result.files })
  })

  router.post('/site-data/pv-synthetic-from-yield', (req, res) => {
    const result = executePvSyntheticFromYield(req.projectId, req.body)
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }
    return res.json({ ok: true, files: result.files })
  })

  router.post('/run-bess-optimisation', async (req, res) => {
    req.setTimeout(0)
    res.setTimeout(0)
    const paths = resolveProjectPaths(req.projectId)
    const result = await (paths?.projectKind === 'v2g'
      ? executeRunV2gOptimisation(req.projectId)
      : executeRunBessOptimisation(req.projectId))
    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        error: result.error,
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
