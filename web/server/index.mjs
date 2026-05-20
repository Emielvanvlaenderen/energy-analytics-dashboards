import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { applyApiCors, createApiApp } from './createApiApp.mjs'

// createApiApp returns a sub-app; mount after CORS so preflight and credentials work cross-origin.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

const app = express()
applyApiCors(app)
app.use(createApiApp())

if (process.env.SERVE_STATIC !== 'false') {
  app.use(express.static(distDir, { index: false }))
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const PORT = Number(process.env.PORT) || 3001
const server = app.listen(PORT, () => {
  console.log(`API + app http://localhost:${PORT}`)
  console.log(`DATA_ROOT=${process.env.DATA_ROOT || '(default .data)'}`)
})
server.timeout = 3_600_000
server.headersTimeout = 3_700_000
