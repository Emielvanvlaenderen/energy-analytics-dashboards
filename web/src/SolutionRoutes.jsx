import { Route, Routes } from 'react-router-dom'
import { CiBessUkRoutes } from './CiBessUkRoutes'
import { V2gUkRoutes } from './V2gUkRoutes'
import { useProject } from './ProjectContext'
import { CI_BESS_UK_ID } from './platforms/registry'
import { SolutionPlaceholderPage } from './SolutionPlaceholderPage'

export function SolutionRoutes() {
  const { projectId } = useProject()

  if (projectId === CI_BESS_UK_ID) {
    return <CiBessUkRoutes />
  }

  if (projectId === 'v2g-uk') {
    return <V2gUkRoutes />
  }

  return (
    <Routes>
      <Route index element={<SolutionPlaceholderPage />} />
      <Route path="*" element={<SolutionPlaceholderPage />} />
    </Routes>
  )
}
