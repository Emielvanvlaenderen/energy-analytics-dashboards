export const BESS_DURATIONS = [2, 3, 4, 6, 8]

export function nearestBessDuration(hours) {
  const n = Number(hours)
  if (!Number.isFinite(n)) return 2
  return BESS_DURATIONS.reduce((best, d) =>
    Math.abs(d - n) < Math.abs(best - n) ? d : best,
  )
}
