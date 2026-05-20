import { createContext, useContext, useMemo } from 'react'
import { getPlatformById } from './platforms/registry'

const ProjectContext = createContext(null)

export function ProjectProvider({ projectId, children }) {
  const platform = getPlatformById(projectId)
  const apiBase = `/api/projects/${projectId}`

  const value = useMemo(
    () => ({
      projectId,
      platform,
      apiBase,
    }),
    [projectId, platform, apiBase],
  )

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProject must be used within ProjectProvider')
  }
  return ctx
}

/** Safe when outside a solution (e.g. home page). */
export function useProjectOptional() {
  return useContext(ProjectContext)
}
