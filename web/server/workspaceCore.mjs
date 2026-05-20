import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { PROJECTS_DIR, REPO_ROOT } from './repoRoot.mjs'
import { getProjectById } from './projectsRegistry.mjs'
import {
  PV_YIELD_FILE_CANDIDATES,
  SHARED_PV_YIELD_DATA_DIR,
  writePvSyntheticFromYield,
} from './pvYieldSynthetic.mjs'

export const GUEST_COOKIE = 'ea_guest'
export const GUEST_HEADER = 'x-ea-guest'
const GUEST_MAX_AGE_MS = 72 * 60 * 60 * 1000
const GUEST_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isGuestUuid(value) {
  return typeof value === 'string' && GUEST_UUID_RE.test(value) && value.length <= 64
}

export function getDataRoot() {
  return process.env.DATA_ROOT || path.join(REPO_ROOT, '.data')
}

/** @returns {string} e.g. guest:uuid or user:uuid */
export function getWorkspaceId(req) {
  if (req.authUser?.id) {
    return `user:${req.authUser.id}`
  }
  return `guest:${req.guestSessionId}`
}

export function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k) out[k] = decodeURIComponent(rest.join('='))
  }
  return out
}

/** Cookie, header, query, or JSON body (cross-origin cookies often blocked). */
export function resolveGuestSessionId(req) {
  const cookies = parseCookies(req.headers.cookie)
  if (isGuestUuid(cookies[GUEST_COOKIE])) return cookies[GUEST_COOKIE]
  const header = req.headers[GUEST_HEADER]
  if (isGuestUuid(header)) return header
  const queryId = req.query?.guestSessionId
  if (isGuestUuid(queryId)) return queryId
  const bodyId = req.body?.guestSessionId
  if (isGuestUuid(bodyId)) return bodyId
  return null
}

/** Guest workspace for results when user ran as guest then signs in to save/download. */
export function resolveResultsPaths(req) {
  const projectId = req.projectId
  if (!projectId) return req.paths ?? null
  const guestId =
    req.query?.guestSessionId ||
    req.body?.guestSessionId ||
    (req.workspaceId?.startsWith('guest:') ? req.workspaceId.slice(6) : null)
  if (isGuestUuid(guestId)) {
    return resolveProjectPaths(projectId, `guest:${guestId}`)
  }
  return req.paths ?? null
}

/** Copy extended day-ahead prices from repo template into this workspace. */
export function syncDayAheadFromTemplate(paths) {
  const src = path.join(paths.templateRoot, 'data', 'day-ahead-prices.csv')
  const dest = path.join(paths.dataDir, 'day-ahead-prices.csv')
  if (!fs.existsSync(src)) return
  fs.mkdirSync(paths.dataDir, { recursive: true })
  fs.copyFileSync(src, dest)
}

/** Rebuild PV synthetic from yield through series end (study installed MW). */
export function refreshPvFromStudy(paths, study) {
  const form = study?.siteDataForm
  if (form?.pvChoice !== 'yes') return
  const mw = Number.parseFloat(String(form.pvInstalledMw ?? ''))
  if (!Number.isFinite(mw) || mw <= 0) return
  writePvSyntheticFromYield(paths.dataDir, mw, [
    path.join(paths.templateRoot, 'data'),
  ])
}

/** Day-ahead from template; PV regenerated from study (yield extended to series end). */
export function refreshMarketDataForStudy(paths, study) {
  syncDayAheadFromTemplate(paths)
  refreshPvFromStudy(paths, study)
}

export function ensureGuestSession(req, res) {
  let id = resolveGuestSessionId(req)
  const isNew = !isGuestUuid(id)
  if (isNew) {
    id = crypto.randomUUID()
    const prod = process.env.NODE_ENV === 'production'
    const origin = req.headers.origin
    const host = req.headers.host || ''
    const crossSite =
      prod &&
      Boolean(origin) &&
      !String(origin).includes(host.split(':')[0])
    const sameSite = crossSite ? 'None' : 'Lax'
    const secure = prod ? '; Secure' : ''
    res.setHeader(
      'Set-Cookie',
      `${GUEST_COOKIE}=${id}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${Math.floor(GUEST_MAX_AGE_MS / 1000)}${secure}`,
    )
  }
  req.guestSessionId = id
  res.setHeader('X-EA-Guest', id)
}

export function resolveProjectPaths(projectId, workspaceId) {
  const meta = getProjectById(projectId)
  if (!meta) return null

  const templateRoot = path.join(PROJECTS_DIR, projectId)
  const useLegacy =
    process.env.USE_LEGACY_PROJECT_DIRS === 'true' && workspaceId?.startsWith('guest:')

  const root = useLegacy
    ? templateRoot
    : path.join(getDataRoot(), 'workspaces', workspaceId, projectId)

  const optimisationDir = path.join(root, 'optimisation')
  const dataDir = path.join(root, 'data')
  const resultsDir = path.join(root, 'results')

  return {
    projectId,
    meta,
    workspaceId,
    root,
    templateRoot,
    dataDir,
    resultsDir,
    optimisationDir,
    studyInputsPath: path.join(optimisationDir, 'study_inputs.json'),
    lastOutputMarker: path.join(optimisationDir, '.last_optimisation_output.txt'),
    runScript: path.join(optimisationDir, 'run_optimisation_from_study.py'),
    projectKind: meta.id === 'v2g-uk' ? 'v2g' : 'bess',
  }
}

function copyIfMissing(src, dest) {
  if (!fs.existsSync(src)) return
  if (fs.existsSync(dest)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function copyDirPyAndCsv(templateDir, destDir) {
  if (!fs.existsSync(templateDir)) return
  fs.mkdirSync(destDir, { recursive: true })
  for (const name of fs.readdirSync(templateDir)) {
    const src = path.join(templateDir, name)
    const dest = path.join(destDir, name)
    if (fs.statSync(src).isDirectory()) continue
    const ext = path.extname(name).toLowerCase()
    if (!['.py', '.csv', '.txt'].includes(ext)) continue
    copyIfMissing(src, dest)
  }
}

/** GB national PV yield profile — same file for C&I BESS and V2G UK. */
function ensurePvYieldFiles(dataDir, templateRoot) {
  for (const name of PV_YIELD_FILE_CANDIDATES) {
    const dest = path.join(dataDir, name)
    if (fs.existsSync(dest)) continue
    copyIfMissing(path.join(templateRoot, 'data', name), dest)
    if (!fs.existsSync(dest)) {
      copyIfMissing(path.join(SHARED_PV_YIELD_DATA_DIR, name), dest)
    }
  }
}

/** Seed guest/user workspace from repo template project (idempotent). */
export function ensureWorkspaceSeeded(paths) {
  const { templateRoot, optimisationDir, dataDir, resultsDir } = paths
  fs.mkdirSync(resultsDir, { recursive: true })
  copyDirPyAndCsv(path.join(templateRoot, 'optimisation'), optimisationDir)
  copyDirPyAndCsv(path.join(templateRoot, 'data'), dataDir)
  ensurePvYieldFiles(dataDir, templateRoot)
}

export function attachWorkspace(req, res, next) {
  ensureGuestSession(req, res)
  next()
}
