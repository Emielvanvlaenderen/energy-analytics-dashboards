import { Navigate, Outlet, useParams } from 'react-router-dom'
import { ProjectProvider } from './ProjectContext'
import { CI_BESS_UK_ID, getPlatformById } from './platforms/registry'

const STUDY_PROJECTS = new Set([CI_BESS_UK_ID, 'v2g-uk'])
import { StudyInputsProvider } from './StudyInputsContext'

export function SolutionLayout() {
  const { projectId } = useParams()
  const platform = getPlatformById(projectId)

  if (!platform) {
    return <Navigate to="/" replace />
  }

  const content =
    platform.status === 'available' && STUDY_PROJECTS.has(projectId) ? (
      <StudyInputsProvider>
        <Outlet />
      </StudyInputsProvider>
    ) : (
      <Outlet />
    )

  return <ProjectProvider projectId={projectId}>{content}</ProjectProvider>
}
