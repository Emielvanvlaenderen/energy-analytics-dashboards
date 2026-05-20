import { CiBessMethodology } from './CiBessMethodology'
import { useProject } from './ProjectContext'
import { V2G_UK_ID } from './platforms/registry'
import { V2gMethodology } from './V2gMethodology'

export function MethodologyPage() {
  const { projectId } = useProject()
  if (projectId === V2G_UK_ID) {
    return <V2gMethodology />
  }
  return <CiBessMethodology />
}
