import crypto from 'crypto'
import fs from 'fs'
import { executeDownloadResults } from './bessResultsCore.mjs'
import { getSupabaseAdmin, isSupabaseConfigured } from './authCore.mjs'
import {
  formatParametersLabel,
  parseSimulationFilename,
  slugSimulationName,
} from './simulationFilename.mjs'
import {
  buildParametersDisplay,
  readSiteDataForm,
  resolveSiteDataFlags,
} from './siteDataLabels.mjs'

const BUCKET = 'simulation-results'

function displaySimulationName(raw) {
  if (!raw) return '(unnamed)'
  return String(raw).replace(/_/g, ' ')
}

/** Resolve simulation name from DB row (handles legacy combined labels). */
export function resolveSavedSimulationName(row) {
  if (row.simulation_name?.trim()) {
    return displaySimulationName(row.simulation_name.trim())
  }
  const parsed = parseSimulationFilename(row.results_filename || '')
  if (parsed.simulationName && parsed.simulationName !== '(unnamed)') {
    return displaySimulationName(parsed.simulationName)
  }
  const legacy = String(row.name || '').trim()
  if (legacy.includes(' — ')) {
    return legacy.split(' — ')[0].trim()
  }
  return legacy ? displaySimulationName(legacy) : 'Saved run'
}

/** Map Supabase row → results picker entry (same shape as workspace CSV list). */
export function mapSavedRowToSimulation(row, siteForm = null) {
  const parsed = parseSimulationFilename(row.results_filename || '')
  const simulationName = resolveSavedSimulationName(row)
  const parametersLabel = parsed.parametersLabel
  const siteDataFlags = resolveSiteDataFlags(parametersLabel, siteForm)

  return {
    savedId: row.id,
    filename: row.results_filename,
    simulationName,
    parametersLabel,
    parametersDisplay: buildParametersDisplay(
      parametersLabel,
      siteDataFlags,
      formatParametersLabel,
    ),
    mtimeMs: new Date(row.created_at).getTime(),
    isSaved: true,
    isLegacy: parsed.isLegacy,
    isPreRun: false,
    siteDataLabel: '',
    siteDataFlags,
  }
}

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
    .select('id, name, simulation_name, project_id, results_filename, created_at')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.message?.includes('simulation_name')) {
      const fallback = await admin
        .from('saved_simulations')
        .select('id, name, project_id, results_filename, created_at')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (fallback.error) {
        return { ok: false, status: 500, error: fallback.error.message }
      }
      return { ok: true, status: 200, simulations: fallback.data ?? [] }
    }
    return { ok: false, status: 500, error: error.message }
  }
  return { ok: true, status: 200, simulations: data ?? [] }
}

function normalizeSaveSimulationName(raw) {
  const trimmed = String(raw || '').trim().slice(0, 64)
  if (!trimmed) return null
  const slug = slugSimulationName(trimmed)
  if (!slug) return null
  return trimmed
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

  let simulationName = normalizeSaveSimulationName(body?.name)
  if (!simulationName) {
    const parsed = parseSimulationFilename(dl.filename)
    if (parsed.simulationName && parsed.simulationName !== '(unnamed)') {
      simulationName = displaySimulationName(parsed.simulationName)
    }
  }
  if (!simulationName) {
    return { ok: false, status: 400, error: 'Enter a simulation name before saving.' }
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

  const insertRow = {
    id,
    user_id: userId,
    project_id: projectId,
    name: simulationName,
    simulation_name: simulationName,
    results_filename: dl.filename,
    storage_path: storagePath,
    study_inputs: study,
  }

  let { data, error: insertError } = await admin
    .from('saved_simulations')
    .insert(insertRow)
    .select('id, name, simulation_name, project_id, results_filename, created_at')
    .single()

  if (insertError?.message?.includes('simulation_name')) {
    const legacyRow = { ...insertRow }
    delete legacyRow.simulation_name
    ;({ data, error: insertError } = await admin
      .from('saved_simulations')
      .insert(legacyRow)
      .select('id, name, project_id, results_filename, created_at')
      .single())
  }

  if (insertError) {
    await admin.storage.from(BUCKET).remove([storagePath])
    const msg = insertError.message.includes('unique')
      ? 'You already saved this run to your account.'
      : insertError.message.includes('simulation_name')
        ? 'Saved simulations need a database update. Run supabase/migrations/002_saved_simulation_name.sql in Supabase, then try again.'
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
    .select('storage_path, results_filename, project_id, study_inputs')
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
    studyInputs: data.study_inputs ?? null,
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

/** Repair legacy rows where name stored the full label (optional, idempotent). */
export async function executeRepairSavedSimulationNames(projectId, userId) {
  if (!isSupabaseConfigured()) return { ok: true, repaired: 0 }
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('saved_simulations')
    .select('id, name, simulation_name, results_filename')
    .eq('user_id', userId)
    .eq('project_id', projectId)

  if (error) {
    if (error.message?.includes('simulation_name')) {
      return { ok: true, repaired: 0 }
    }
    return { ok: false, repaired: 0, error: error.message }
  }

  if (!data?.length) return { ok: true, repaired: 0 }

  let repaired = 0
  for (const row of data) {
    const needsFix =
      !row.simulation_name ||
      row.name.includes(' — ') ||
      row.name !== resolveSavedSimulationName(row)
    if (!needsFix) continue
    const simulationName = resolveSavedSimulationName(row)
    const { error: upErr } = await admin
      .from('saved_simulations')
      .update({ name: simulationName, simulation_name: simulationName })
      .eq('id', row.id)
    if (!upErr) repaired += 1
  }
  return { ok: true, repaired }
}
