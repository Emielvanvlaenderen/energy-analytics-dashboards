import { nearestBessDuration } from './bessDurations'

/** Derive UI fields from committed V2G battery (supports legacy MWh/MW). */
export function v2gBatteryFromCommitted(v) {
  if (!v || typeof v !== 'object') {
    return { capacityMw: '', durationHours: 2 }
  }
  if (v.capacityMw != null && v.durationHours != null) {
    return {
      capacityMw: v.capacityMw,
      durationHours: nearestBessDuration(v.durationHours),
    }
  }
  const power = Number(v.maxPowerBessMw)
  const energy = Number(v.energyBessMwh)
  if (Number.isFinite(power) && power > 0 && Number.isFinite(energy) && energy > 0) {
    return {
      capacityMw: power,
      durationHours: nearestBessDuration(energy / power),
    }
  }
  return { capacityMw: '', durationHours: 2 }
}

/** Map UI battery fields to committed payload (keeps legacy keys for Python). */
export function v2gCommittedBatteryFields(capacityMw, durationHours) {
  const cap = Number(capacityMw)
  const dur = Number(durationHours)
  const energyBessMwh = cap * dur
  return {
    capacityMw: cap,
    durationHours: dur,
    energyBessMwh,
    maxPowerBessMw: cap,
  }
}
