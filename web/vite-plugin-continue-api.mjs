import express from 'express'
import { createProjectApiRouter } from './server/projectApiRouter.mjs'
import { PROJECTS } from './server/projectsRegistry.mjs'

/**
 * Handles `/api/projects/*` inside Vite dev & preview so the UI works without a
 * separate backend process (avoids 502 Bad Gateway when only `vite` is running).
 */
export function continueApiPlugin() {
  return {
    name: 'continue-api',
    configureServer(server) {
      server.middlewares.use(createApiApp())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiApp())
    },
  }
}

function createApiApp() {
  const app = express()
  app.use(express.json({ limit: '4mb' }))

  app.get('/api/projects', (req, res) => {
    return res.json({ ok: true, projects: PROJECTS })
  })

  app.use('/api/projects/:projectId', createProjectApiRouter())

  /** Pass unmatched requests through to Vite (static, HMR, etc.). */
  app.use((req, res, next) => next())
  return app
}
