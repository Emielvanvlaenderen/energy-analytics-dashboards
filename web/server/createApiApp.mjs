import express from 'express'
import fs from 'fs'
import { attachAuth, isSupabaseConfigured } from './authCore.mjs'
import { createProjectApiRouter } from './projectApiRouter.mjs'
import { getProjectById, PROJECTS } from './projectsRegistry.mjs'
import {
  attachWorkspace,
  ensureWorkspaceSeeded,
  getWorkspaceId,
} from './workspaceCore.mjs'
import { ensureProjectDirs } from './projectPaths.mjs'
import { resolveProjectPaths } from './workspaceCore.mjs'

export function createApiApp() {
  const app = express()
  app.use(express.json({ limit: '4mb' }))

  app.use(attachAuth)

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      supabase: isSupabaseConfigured(),
    })
  })

  app.get('/api/me', (req, res) => {
    if (!req.authUser) {
      return res.json({ ok: true, user: null })
    }
    const meta = req.authUser.user_metadata || {}
    return res.json({
      ok: true,
      user: {
        id: req.authUser.id,
        email: req.authUser.email ?? null,
        name: meta.user_name || meta.full_name || meta.name || null,
        avatarUrl: meta.avatar_url || null,
      },
    })
  })

  app.get('/api/projects', (req, res) => {
    return res.json({ ok: true, projects: PROJECTS })
  })

  app.use('/api/projects/:projectId', attachWorkspace, (req, res, next) => {
    const projectId = req.params.projectId
    if (!getProjectById(projectId)) {
      return res.status(404).json({
        ok: false,
        error: `Unknown project "${projectId}".`,
      })
    }
    req.projectId = projectId
    const workspaceId = getWorkspaceId(req)
    req.workspaceId = workspaceId
    req.paths = resolveProjectPaths(projectId, workspaceId)
    if (!req.paths) {
      return res.status(404).json({ ok: false, error: 'Unknown project.' })
    }
    ensureWorkspaceSeeded(req.paths)
    ensureProjectDirs(req.paths)
    next()
  })

  app.use('/api/projects/:projectId', createProjectApiRouter())

  app.use((req, res, next) => next())
  return app
}

/** CORS for split UI (Netlify) + API (Render). */
export function applyApiCors(app) {
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  app.use((req, res, next) => {
    const origin = req.headers.origin
    const allow =
      !origins.length ||
      (origin && origins.includes(origin)) ||
      process.env.NODE_ENV !== 'production'

    if (allow && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Access-Control-Expose-Headers', 'X-EA-Guest')
      res.setHeader('Vary', 'Origin')
    }
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-EA-Guest',
    )
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204)
    }
    next()
  })
}
