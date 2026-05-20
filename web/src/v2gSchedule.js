export const V2G_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

export const V2G_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const V2G_SLOTS = 48
export const V2G_DAYS = 7

export function timeLabel(slotIndex) {
  const h = Math.floor(slotIndex / 2)
  const m = (slotIndex % 2) * 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** @returns {'in'|'out'|null} */
export function parsePlugToken(raw) {
  if (raw == null) return null
  const s = String(raw).trim().toLowerCase()
  if (!s) return null
  if (['in', 'i', '1', 'yes', 'plugged', 'plug'].includes(s)) return 'in'
  if (['out', 'o', '0', 'no', 'away'].includes(s)) return 'out'
  return null
}

/** Default: plugged in weekday 18:00–07:00, otherwise out. */
export function defaultV2gSchedule() {
  return matrixToSchedule(defaultV2gMatrix())
}

export function defaultV2gMatrix() {
  const matrix = Array.from({ length: V2G_DAYS }, () =>
    Array.from({ length: V2G_SLOTS }, () => 'out'),
  )
  for (let day = 0; day < V2G_DAYS; day++) {
    const weekend = day >= 5
    for (let slot = 0; slot < V2G_SLOTS; slot++) {
      const h = Math.floor(slot / 2)
      const evening = h >= 18 || h < 7
      matrix[day][slot] = !weekend && evening ? 'in' : 'out'
    }
  }
  return matrix
}

/** 7 weekdays × 48 half-hours (rows = days, cols = times). */
export function scheduleToMatrix(schedule) {
  const matrix = defaultV2gMatrix()
  const rows = schedule?.rows
  if (!rows?.length) return matrix

  for (let slot = 0; slot < V2G_SLOTS; slot++) {
    const src =
      rows[slot] ??
      rows.find((r) => r.hhmm === timeLabel(slot))
    if (!src) continue
    for (let d = 0; d < V2G_DAYS; d++) {
      const day = V2G_WEEKDAYS[d]
      const v = String(src[day] ?? 'out').toLowerCase()
      matrix[d][slot] = v === 'in' ? 'in' : 'out'
    }
  }
  return matrix
}

export function matrixToSchedule(matrix) {
  const rows = []
  for (let slot = 0; slot < V2G_SLOTS; slot++) {
    const row = { hhmm: timeLabel(slot) }
    for (let d = 0; d < V2G_DAYS; d++) {
      row[V2G_WEEKDAYS[d]] = matrix[d]?.[slot] === 'in' ? 'in' : 'out'
    }
    rows.push(row)
  }
  return { rows }
}

export function normalizeV2gSchedule(raw) {
  if (!raw) return defaultV2gSchedule()
  if (raw.rows?.length) {
    return matrixToSchedule(scheduleToMatrix(raw))
  }
  return defaultV2gSchedule()
}
