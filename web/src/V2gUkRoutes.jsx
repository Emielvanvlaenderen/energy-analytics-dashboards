import { Navigate, Route, Routes } from 'react-router-dom'
import { DuosChargesPage } from './DuosChargesPage'
import { MethodologyPage } from './MethodologyPage'
import { SiteDataPage } from './SiteDataPage'
import { V2gResultsPage } from './V2gResultsPage'
import { V2gSchedulePage } from './V2gSchedulePage'
import { V2gSimulationPage } from './V2gSimulationPage'
import { useProject } from './ProjectContext'

export function V2gUkRoutes() {
  const { platform } = useProject()
  const base = platform?.routeBase ?? '/solutions/v2g-uk'

  return (
    <Routes>
      <Route index element={<Navigate to="grid-tariffs" replace />} />
      <Route path="grid-tariffs" element={<DuosChargesPage />} />
      <Route path="site-data" element={<SiteDataPage />} />
      <Route path="v2g-schedule" element={<V2gSchedulePage />} />
      <Route path="v2g-simulation" element={<V2gSimulationPage />} />
      <Route path="bess-simulation" element={<Navigate to={`${base}/v2g-simulation`} replace />} />
      <Route path="results" element={<V2gResultsPage />} />
      <Route path="methodology" element={<MethodologyPage />} />
    </Routes>
  )
}
