import fs from 'fs'

const DUOS_COLORS = ['green', 'amber', 'red']
const VALID_DURATIONS = new Set([2, 3, 4, 6, 8])

function timeLabel(slotIndex) {
  const h = Math.floor(slotIndex / 2)
  const m = (slotIndex % 2) * 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatSlotRange(fromSlot, toSlot) {
  const endSlot = toSlot + 1
  const endH = Math.floor(endSlot / 2)
  const endM = (endSlot % 2) * 30
  return `${timeLabel(fromSlot)}–${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

/** Summarise weekday DUoS band pattern (row 0 of band matrix). */
export function summarizeDuosProfile(bandMatrix) {
  if (!Array.isArray(bandMatrix) || bandMatrix.length < 1) {
    return 'Not set'
  }
  const weekday = bandMatrix[0]
  if (!Array.isArray(weekday) || weekday.length !== 48) {
    return 'Not set'
  }

  const segments = []
  let i = 0
  while (i < 48) {
    const color = weekday[i]
    let j = i
    while (j + 1 < 48 && weekday[j + 1] === color) j += 1
    segments.push({ color, from: i, to: j })
    i = j + 1
  }

  const weekend = bandMatrix[1]
  const weekendUniform =
    Array.isArray(weekend) &&
    weekend.length === 48 &&
    weekend.every((c) => c === weekend[0])

  const weekdayParts = segments.map((s) => {
    const range =
      s.from === 0 && s.to === 47
        ? 'all day'
        : formatSlotRange(s.from, s.to)
    return `${s.color} ${range}`
  })

  let text = `Weekdays: ${weekdayParts.join('; ')}`
  if (weekendUniform) {
    text += `. Weekends: ${weekend[0]} all day`
  } else if (Array.isArray(weekend)) {
    text += '. Weekends: custom pattern'
  }
  return text
}

function readNumericMw(raw) {
  if (raw === '' || raw == null) return null
  const n = Number.parseFloat(String(raw))
  return Number.isFinite(n) ? n : null
}

export function normalizeBessCommitted(raw) {
  if (!raw || typeof raw !== 'object') return null
  const durationHours = VALID_DURATIONS.has(Number(raw.durationHours))
    ? Number(raw.durationHours)
    : raw.durationHours === 4
      ? 4
      : 2

  let chargingEfficiencyPct = raw.chargingEfficiencyPct
  let dischargingEfficiencyPct = raw.dischargingEfficiencyPct
  if (
    (chargingEfficiencyPct == null || dischargingEfficiencyPct == null) &&
    raw.roundtripEfficiencyPct != null
  ) {
    const rte = Number(raw.roundtripEfficiencyPct) / 100
    const side = Math.sqrt(Math.max(0, rte)) * 100
    if (chargingEfficiencyPct == null) chargingEfficiencyPct = side
    if (dischargingEfficiencyPct == null) dischargingEfficiencyPct = side
  }

  return {
    ...raw,
    durationHours,
    chargingEfficiencyPct,
    dischargingEfficiencyPct,
  }
}

export function normalizeV2gCommitted(raw) {
  if (!raw || typeof raw !== 'object') return null
  let capacityMw = raw.capacityMw
  let durationHours = raw.durationHours
  if (capacityMw == null || durationHours == null) {
    const power = Number(raw.maxPowerBessMw)
    const energy = Number(raw.energyBessMwh)
    if (Number.isFinite(power) && power > 0 && Number.isFinite(energy) && energy > 0) {
      capacityMw = power
      const ratio = energy / power
      const rounded = Math.round(ratio)
      durationHours = VALID_DURATIONS.has(rounded)
        ? rounded
        : [...VALID_DURATIONS].reduce((best, d) =>
            Math.abs(d - ratio) < Math.abs(best - ratio) ? d : best,
          )
    }
  }
  return {
    ...raw,
    capacityMw,
    durationHours,
  }
}

/** Build a compact overview for the Results page from study_inputs.json shape. */
export function buildRunSummaryFromStudy(study, { projectKind = 'ci-bess' } = {}) {
  if (!study || typeof study !== 'object') {
    return { ok: false, items: [], duos: null, v2gSchedule: null }
  }

  const grid = study.gridTariffs ?? {}
  const form = study.siteDataForm ?? {}
  const items = []

  const importNonEnergy =
    grid.importNonEnergy != null && String(grid.importNonEnergy).trim() !== ''
      ? String(grid.importNonEnergy).trim()
      : null

  items.push({
    label: 'Import non-energy charge',
    value: importNonEnergy != null ? `${importNonEnergy} £/MWh` : 'Not set',
  })

  const pvMw =
    form.pvChoice === 'yes' ? readNumericMw(form.pvInstalledMw) : null
  items.push({
    label: 'PV max capacity',
    value:
      form.pvChoice === 'yes'
        ? pvMw != null
          ? `${pvMw} MW`
          : 'Enabled (capacity not set)'
        : form.pvChoice === 'no'
          ? 'None'
          : 'Not set',
  })

  const loadMw =
    form.consumptionChoice === 'yes' ? readNumericMw(form.powerMw) : null
  items.push({
    label: 'Load average capacity',
    value:
      form.consumptionChoice === 'yes'
        ? loadMw != null
          ? `${loadMw} MW`
          : 'Enabled (capacity not set)'
        : form.consumptionChoice === 'no'
          ? 'None'
          : 'Not set',
  })

  const otherMw =
    form.otherChoice === 'yes' ? readNumericMw(form.powerMw) : null
  items.push({
    label: 'Other generation avg capacity',
    value:
      form.otherChoice === 'yes'
        ? otherMw != null
          ? `${otherMw} MW`
          : 'Enabled (capacity not set)'
        : form.otherChoice === 'no'
          ? 'None'
          : 'Not set',
  })

  const bess = normalizeBessCommitted(study.bessSimulationCommitted)
  if (bess && projectKind !== 'v2g') {
    items.push({
      label: 'Battery capacity / duration',
      value: `${bess.capacityMw ?? '—'} MW · ${bess.durationHours ?? '—'} h`,
    })
    if (bess.chargingEfficiencyPct != null || bess.dischargingEfficiencyPct != null) {
      items.push({
        label: 'Charge / discharge efficiency',
        value: `${bess.chargingEfficiencyPct ?? '—'}% / ${bess.dischargingEfficiencyPct ?? '—'}%`,
      })
    }
  }

  let v2gBattery = null
  if (projectKind === 'v2g' || study.v2gSimulationCommitted) {
    v2gBattery = normalizeV2gCommitted(study.v2gSimulationCommitted)
    if (v2gBattery) {
      items.push({
        label: 'Battery capacity / duration',
        value: `${v2gBattery.capacityMw ?? '—'} MW · ${v2gBattery.durationHours ?? '—'} h`,
      })
      items.push({
        label: 'Charge / discharge efficiency',
        value: `${v2gBattery.chargingEfficiencyPct ?? '—'}% / ${v2gBattery.dischargingEfficiencyPct ?? '—'}%`,
      })
      items.push({
        label: 'Return / target SoC',
        value: `${v2gBattery.returnSocPct ?? '—'}% / ${v2gBattery.targetSocPct ?? '—'}%`,
      })
      items.push({
        label: 'SOC lower / upper limit',
        value: `${v2gBattery.socLowerPct ?? '—'}% / ${v2gBattery.socUpperPct ?? '—'}%`,
      })
    }
  }

  const duos =
    grid.duos || grid.bandMatrix
      ? {
          importNonEnergy,
          rates: grid.duos ?? {},
          bandMatrix: Array.isArray(grid.bandMatrix) ? grid.bandMatrix : null,
          profileSummary: summarizeDuosProfile(grid.bandMatrix),
        }
      : null

  const v2gSchedule =
    (projectKind === 'v2g' || study.v2gSimulationCommitted) && study.v2gSchedule
      ? study.v2gSchedule
      : null

  return { ok: true, items, duos, v2gSchedule, v2gBattery }
}

export function readStudyInputsForRunSummary(paths) {
  try {
    if (!paths?.studyInputsPath || !fs.existsSync(paths.studyInputsPath)) {
      return null
    }
    return JSON.parse(fs.readFileSync(paths.studyInputsPath, 'utf8'))
  } catch {
    return null
  }
}
