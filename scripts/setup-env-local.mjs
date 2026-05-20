#!/usr/bin/env node
/**
 * Writes web/.env.local for local dev (GitHub sign-in + Save to my account).
 *
 * Usage:
 *   node scripts/setup-env-local.mjs
 *   node scripts/setup-env-local.mjs "<anon-key>" "<service-role-key>"
 *
 * Keys: Supabase → Project Settings → API → Legacy anon / service_role (Reveal, then Copy).
 */
import { writeFileSync } from 'fs'
import { createInterface } from 'readline'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '../web/.env.local')
const projectUrl = 'https://qdtsobuqpmyljeidavjm.supabase.co'

function assertJwt(label, value) {
  const v = (value || '').trim()
  if (!v.startsWith('eyJ')) {
    console.error(`${label} must be a JWT starting with eyJ (use Reveal + Copy in Supabase).`)
    process.exit(1)
  }
  return v
}

async function prompt(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => rl.question(label, resolve))
  rl.close()
  return answer.trim()
}

async function main() {
  let anon = process.argv[2]
  let service = process.argv[3]

  if (!anon || !service) {
    console.log('Supabase → Settings → API → Legacy anon, service_role API keys\n')
    if (!anon) anon = await prompt('anon (public) key: ')
    if (!service) service = await prompt('service_role (secret) key: ')
  }

  anon = assertJwt('anon', anon)
  service = assertJwt('service_role', service)

  const lines = [
    '# Local development (gitignored)',
    '# https://supabase.com/dashboard/project/qdtsobuqpmyljeidavjm/settings/api',
    '',
    `VITE_SUPABASE_URL=${projectUrl}`,
    `VITE_SUPABASE_ANON_KEY=${anon}`,
    '',
    `SUPABASE_URL=${projectUrl}`,
    `SUPABASE_ANON_KEY=${anon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service}`,
    '',
    '# Same-origin API via Vite plugin (default for npm run dev)',
    '# VITE_API_BASE_URL=',
    '',
    '# Optional: use repo projects/ instead of guest workspaces',
    '# USE_LEGACY_PROJECT_DIRS=true',
    '',
  ]

  writeFileSync(envPath, lines.join('\n'))
  console.log(`Wrote ${envPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
