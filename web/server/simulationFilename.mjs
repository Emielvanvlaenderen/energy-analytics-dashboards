/** Slug for CSV filename prefix (matches Python ``_slug``). */
export function slugSimulationName(raw) {
  return String(raw)
    .trim()
    .split('')
    .map((c) => (/[a-zA-Z0-9._-]/.test(c) ? c : '_'))
    .join('')
}

/**
 * Parses a results CSV basename into simulation name + parameter stem.
 * New runs: `{name}__bess_auction__…`. Legacy: `bess_auction__…` (no name prefix).
 */
export function parseSimulationFilename(filename) {
  const stem = String(filename).replace(/\.csv$/i, '')
  const parts = stem.split('__')
  if (parts[0] === 'bess_auction') {
    return {
      simulationName: '(unnamed)',
      parametersLabel: stem,
      isLegacy: true,
    }
  }
  const simulationName = parts[0] || '(unnamed)'
  const parametersLabel = parts.slice(1).join('__') || stem
  return {
    simulationName,
    parametersLabel,
    isLegacy: false,
  }
}

/** Human-readable label for the parameter segment in the run picker. */
export function formatParametersLabel(parametersLabel) {
  return parametersLabel.split('__').join(' · ')
}

export function groupSimulationsByName(simulations) {
  const map = new Map()
  for (const sim of simulations) {
    const name = sim.simulationName
    if (!map.has(name)) map.set(name, [])
    map.get(name).push(sim)
  }
  const groups = [...map.entries()].map(([simulationName, runs]) => ({
    simulationName,
    runs: runs.sort((a, b) => b.mtimeMs - a.mtimeMs),
  }))
  groups.sort((a, b) => {
    if (a.simulationName === '(unnamed)') return 1
    if (b.simulationName === '(unnamed)') return -1
    return a.simulationName.localeCompare(b.simulationName)
  })
  return groups
}
