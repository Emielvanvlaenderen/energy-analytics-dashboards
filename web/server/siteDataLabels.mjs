import fs from 'fs'

const PV_TAG = /^pv[YN]$/
const LOAD_TAG = /^load[YN]$/

export function readSiteDataForm(paths) {
  try {
    if (!paths?.studyInputsPath || !fs.existsSync(paths.studyInputsPath)) {
      return null
    }
    const study = JSON.parse(fs.readFileSync(paths.studyInputsPath, 'utf8'))
    return study.siteDataForm ?? null
  } catch {
    return null
  }
}

export function siteDataFlagsFromForm(form) {
  if (!form || typeof form !== 'object') {
    return { pv: null, consumption: null }
  }
  const pv =
    form.pvChoice === 'yes' ? true : form.pvChoice === 'no' ? false : null
  const consumption =
    form.consumptionChoice === 'yes'
      ? true
      : form.consumptionChoice === 'no'
        ? false
        : null
  return { pv, consumption }
}

/** Tags embedded in results CSV stems: pvY/pvN, loadY/loadN. */
export function parseSiteDataTagsFromParametersLabel(parametersLabel) {
  const parts = String(parametersLabel).split('__')
  let pv = null
  let consumption = null
  for (const p of parts) {
    if (p === 'pvY') pv = true
    else if (p === 'pvN') pv = false
    else if (p === 'loadY') consumption = true
    else if (p === 'loadN') consumption = false
  }
  return { pv, consumption }
}

export function resolveSiteDataFlags(parametersLabel, formFallback) {
  const fromFile = parseSiteDataTagsFromParametersLabel(parametersLabel)
  const hasFileTags = fromFile.pv != null || fromFile.consumption != null
  if (hasFileTags) return fromFile
  return siteDataFlagsFromForm(formFallback)
}

export function formatSiteDataTagShort({ pv, consumption }) {
  const bits = []
  if (pv === true) bits.push('PV')
  else if (pv === false) bits.push('No PV')
  if (consumption === true) bits.push('Consumption')
  else if (consumption === false) bits.push('No consumption')
  return bits.length ? bits.join(' · ') : null
}

export function stripSiteDataTagsFromLabel(parametersLabel) {
  return String(parametersLabel)
    .split('__')
    .filter((p) => !PV_TAG.test(p) && !LOAD_TAG.test(p))
    .join('__')
}

export function buildParametersDisplay(parametersLabel, flags, formatParametersLabel) {
  const core = formatParametersLabel(
    stripSiteDataTagsFromLabel(parametersLabel),
  )
  const tag = formatSiteDataTagShort(flags)
  if (!tag) return core
  if (!core) return tag
  return `${tag} · ${core}`
}
