import { parseApiResponse, projectFetch } from './api'
import { supabase } from './supabaseClient'

export function runSelectValue(sim) {
  if (sim?.savedId) return `saved:${sim.savedId}`
  return `file:${sim.filename}`
}

export function parseRunSelectValue(key) {
  if (!key) return { savedId: null, filename: null }
  if (key.startsWith('saved:')) return { savedId: key.slice(6), filename: null }
  if (key.startsWith('file:')) return { savedId: null, filename: key.slice(5) }
  return { savedId: null, filename: key }
}

export function runKeyFromActive(activeFile, activeSavedId) {
  if (activeSavedId) return `saved:${activeSavedId}`
  if (activeFile) return `file:${activeFile}`
  return null
}

export function findSimulationByRunKey(simulations, key) {
  const { savedId, filename } = parseRunSelectValue(key)
  if (savedId) {
    return simulations.find((s) => s.savedId === savedId) ?? null
  }
  return simulations.find((s) => !s.savedId && s.filename === filename) ?? null
}

export async function resolveAuthToken(accessToken) {
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) return data.session.access_token
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed.session?.access_token) return refreshed.session.access_token
  }
  return accessToken
}

export async function fetchSimulationList(apiBase, accessToken) {
  const token = await resolveAuthToken(accessToken)
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await projectFetch(`${apiBase}/bess-simulations`, { headers })
  return parseApiResponse(res)
}

export async function fetchResultsPayload(apiBase, runKey, accessToken) {
  const { savedId, filename } = parseRunSelectValue(runKey)
  const token = await resolveAuthToken(accessToken)
  const headers = savedId && token ? { Authorization: `Bearer ${token}` } : {}
  const url = savedId
    ? `${apiBase}/bess-results?savedId=${encodeURIComponent(savedId)}`
    : `${apiBase}/bess-results?file=${encodeURIComponent(filename)}`
  const res = await projectFetch(url, { headers })
  return parseApiResponse(res)
}
