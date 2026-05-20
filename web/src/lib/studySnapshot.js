/** Full study payload for one-shot save before optimisation (guest workspace). */
export function buildStudySnapshot({
  importNonEnergy,
  duos,
  bandMatrix,
  siteImportExportLimitsMw,
  siteDataForm,
  bessSimulationCommitted,
  v2gSimulationCommitted,
  v2gSchedule,
  simulationName,
}) {
  const snapshot = {}
  if (siteImportExportLimitsMw != null) {
    snapshot.siteImportExportLimitsMw = siteImportExportLimitsMw
  }
  if (siteDataForm != null) {
    snapshot.siteDataForm = siteDataForm
  }
  if (bessSimulationCommitted != null) {
    snapshot.bessSimulationCommitted = bessSimulationCommitted
  }
  if (v2gSimulationCommitted != null) {
    snapshot.v2gSimulationCommitted = v2gSimulationCommitted
  }
  if (v2gSchedule != null) {
    snapshot.v2gSchedule = v2gSchedule
  }
  if (simulationName != null && String(simulationName).trim()) {
    snapshot.simulationName = String(simulationName).trim()
  }
  if (
    importNonEnergy !== undefined &&
    duos != null &&
    bandMatrix != null
  ) {
    snapshot.gridTariffs = { importNonEnergy, duos, bandMatrix }
  }
  return snapshot
}
