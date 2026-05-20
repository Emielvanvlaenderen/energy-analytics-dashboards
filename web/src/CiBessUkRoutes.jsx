import { Navigate, Route, Routes } from 'react-router-dom'
import { BessSimulationPage } from './BessSimulationPage'
import { DuosChargesPage } from './DuosChargesPage'
import { MethodologyPage } from './MethodologyPage'
import { ResultsPage } from './ResultsPage'
import { SiteDataPage } from './SiteDataPage'
import { useProject } from './ProjectContext'

export function CiBessUkRoutes() {
  const { platform } = useProject()
  const base = platform?.routeBase ?? '/solutions/ci-bess-uk'

  return (
    <Routes>
      <Route index element={<Navigate to="grid-tariffs" replace />} />
      <Route path="grid-tariffs" element={<DuosChargesPage />} />
      <Route path="site-data" element={<SiteDataPage />} />
      <Route path="bess-simulation" element={<BessSimulationPage />} />
      <Route path="results" element={<ResultsPage />} />
      <Route path="methodology" element={<MethodologyPage />} />
      <Route
        path="site-demand"
        element={<Navigate to={`${base}/site-data`} replace />}
      />
    </Routes>
  )
}
