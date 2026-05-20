import { useProject } from './ProjectContext'

/** Prefix for project-scoped API routes. */
export function useProjectApi() {
  const { apiBase } = useProject()
  return apiBase
}
