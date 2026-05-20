import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { PROJECTS_DIR, REPO_ROOT } from './repoRoot.mjs'
import { getProjectById } from './projectsRegistry.mjs'
import {
  PV_YIELD_FILE_CANDIDATES,
  SHARED_PV_YIELD_DATA_DIR,
} from './pvYieldSynthetic.mjs'

export const GUEST_COOKIE = 'ea_guest'
const GUEST_MAX_AGE_MS = 72 * 60 * 60 * 1000

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

export function ensureGuestSession(req, res) {
  const cookies = parseCookies(req.headers.cookie)
  let id = cookies[GUEST_COOKIE]
  const valid =
    typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) && id.length <= 64
  if (!valid) {
    id = crypto.randomUUID()
    const prod = process.env.NODE_ENV === 'production'
    const origin = req.headers.origin
    const host = req.headers.host || ''
    // Netlify UI → Render API: Origin is netlify.app, Host is onrender.com.
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
