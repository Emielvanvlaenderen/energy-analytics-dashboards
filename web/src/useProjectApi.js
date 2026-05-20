import { useProject } from './ProjectContext'
import { getApiRoot } from './lib/api'

/** Prefix for project-scoped API routes. */
export function useProjectApi() {
  const { apiBase } = useProject()
  const root = getApiRoot()
  return `${root}${apiBase}`
}
