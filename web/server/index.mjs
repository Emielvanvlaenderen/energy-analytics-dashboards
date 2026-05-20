import cors from 'cors'
import express from 'express'
import { createProjectApiRouter } from './projectApiRouter.mjs'
import { PROJECTS } from './projectsRegistry.mjs'

const app = express()
app.use(cors())
app.use(express.json({ limit: '4mb' }))

app.get('/api/projects', (req, res) => {
  return res.json({ ok: true, projects: PROJECTS })
})

app.use('/api/projects/:projectId', createProjectApiRouter())

const PORT = Number(process.env.PORT) || 3001
const server = app.listen(PORT, () => {
  console.log(`API server http://localhost:${PORT}`)
  console.log(`Projects API: /api/projects/:projectId/...`)
  console.log(`Registered: ${PROJECTS.map((p) => p.id).join(', ')}`)
})
server.timeout = 3_600_000
server.headersTimeout = 3_700_000
