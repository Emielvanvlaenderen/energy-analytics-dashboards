/** Client-side mirror of server grouping (uses API-parsed fields when available). */

export function groupSimulationsByName(simulations) {
  const map = new Map()
  for (const sim of simulations) {
    const name = sim.simulationName ?? '(unnamed)'
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

export function findSimulationMeta(simulations, filename) {
  return simulations.find((s) => s.filename === filename) ?? null
}

/** Simulation name dropdown — pre-run uses one group; PV/load shown on run picker. */
export function formatSimulationGroupOption(group) {
  const run = group.runs?.[0]
  if (run?.isPreRun || group.simulationName === 'Pre-run_demo') {
    return 'Pre-run (demo)'
  }
  const name =
    group.simulationName === '(unnamed)'
      ? 'Previous runs (no name)'
      : group.simulationName.replace(/_/g, ' ')
  const tag = run?.siteDataLabel
  return tag ? `${name} — ${tag}` : name
}

/** Run picker label (server builds parametersDisplay; this is a fallback). */
export function formatRunOptionLabel(sim) {
  return sim.parametersDisplay ?? sim.parametersLabel ?? sim.filename
}
