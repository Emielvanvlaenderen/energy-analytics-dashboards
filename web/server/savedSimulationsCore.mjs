import crypto from 'crypto'
import fs from 'fs'
import { executeDownloadResults } from './bessResultsCore.mjs'
import { getSupabaseAdmin, isSupabaseConfigured } from './authCore.mjs'
import {
  buildSavedSimulationName,
  formatParametersLabel,
  parseSimulationFilename,
} from './simulationFilename.mjs'
import {
  buildParametersDisplay,
  readSiteDataForm,
  resolveSiteDataFlags,
} from './siteDataLabels.mjs'

const BUCKET = 'simulation-results'

export async function executeListSavedSimulations(projectId, userId) {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Saved simulations are not configured (Supabase env missing).',
    }
  }
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('saved_simulations')
    .select('id, name, project_id, results_filename, created_at')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    return { ok: false, status: 500, error: error.message }
  }
  return { ok: true, status: 200, simulations: data ?? [] }
}

export async function executeSaveCurrentSimulation(
  projectId,
  userId,
  body,
  { paths },
) {
  if (!paths) return { ok: false, status: 500, error: 'Workspace not resolved.' }
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Saved simulations are not configured (Supabase env missing).',
    }
  }

  const dl = executeDownloadResults(projectId, { file: body?.file }, { paths })
  if (!dl.ok) {
    return { ok: false, status: dl.status, error: dl.error }
  }

  let name =
    typeof body?.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 64)
      : null
  if (!name) {
    const parsed = parseSimulationFilename(dl.filename)
    const siteForm = readSiteDataForm(paths)
    const flags = resolveSiteDataFlags(parsed.parametersLabel, siteForm)
    const parametersDisplay = buildParametersDisplay(
      parsed.parametersLabel,
      flags,
      formatParametersLabel,
    )
    name = buildSavedSimulationName(
      parsed.simulationName,
      parametersDisplay,
      parsed.parametersLabel,
    )
  }
  if (!name) {
    return { ok: false, status: 400, error: 'Could not derive a name for this run.' }
  }

  let study = null
  try {
    if (fs.existsSync(paths.studyInputsPath)) {
      study = JSON.parse(fs.readFileSync(paths.studyInputsPath, 'utf8'))
    }
  } catch {
    /* optional snapshot */
  }

  const admin = getSupabaseAdmin()
  const id = crypto.randomUUID()
  const storagePath = `${userId}/${projectId}/${id}/${dl.filename}`
  const csvBytes = fs.readFileSync(dl.csvPath)

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, csvBytes, {
      contentType: 'text/csv',
      upsert: false,
    })

  if (uploadError) {
    return { ok: false, status: 500, error: uploadError.message }
  }

  const { data, error: insertError } = await admin
    .from('saved_simulations')
    .insert({
      id,
      user_id: userId,
      project_id: projectId,
      name,
      results_filename: dl.filename,
      storage_path: storagePath,
      study_inputs: study,
    })
    .select('id, name, project_id, results_filename, created_at')
    .single()

  if (insertError) {
    await admin.storage.from(BUCKET).remove([storagePath])
    const msg = insertError.message.includes('unique')
      ? 'You already have a saved simulation with this name.'
      : insertError.message
    return { ok: false, status: 400, error: msg }
  }

  return { ok: true, status: 201, simulation: data }
}

export async function executeDownloadSavedSimulation(
  projectId,
  userId,
  simulationId,
) {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Saved simulations are not configured.',
    }
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('saved_simulations')
    .select('storage_path, results_filename, project_id')
    .eq('id', simulationId)
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 404, error: 'Saved simulation not found.' }

  const { data: blob, error: dlError } = await admin.storage
    .from(BUCKET)
    .download(data.storage_path)

  if (dlError) {
    return { ok: false, status: 500, error: dlError.message }
  }

  const buf = Buffer.from(await blob.arrayBuffer())
  return {
    ok: true,
    status: 200,
    buffer: buf,
    filename: data.results_filename || 'results.csv',
  }
}

export async function executeDeleteSavedSimulation(
  projectId,
  userId,
  simulationId,
) {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 503, error: 'Saved simulations are not configured.' }
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('saved_simulations')
    .select('storage_path')
    .eq('id', simulationId)
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 404, error: 'Saved simulation not found.' }

  await admin.storage.from(BUCKET).remove([data.storage_path])
  const { error: delError } = await admin
    .from('saved_simulations')
    .delete()
    .eq('id', simulationId)

  if (delError) return { ok: false, status: 500, error: delError.message }
  return { ok: true, status: 200 }
}
