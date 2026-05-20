import express from 'express'
import { applyApiCors, createApiApp } from './server/createApiApp.mjs'

/**
 * Handles `/api/*` inside Vite dev & preview so the UI works without a
 * separate backend process (avoids 502 Bad Gateway when only `vite` is running).
 */
export function continueApiPlugin() {
  const app = express()
  applyApiCors(app)
  app.use(createApiApp())
  return {
    name: 'continue-api',
    configureServer(server) {
      server.middlewares.use(app)
    },
    configurePreviewServer(server) {
      server.middlewares.use(app)
    },
  }
}
