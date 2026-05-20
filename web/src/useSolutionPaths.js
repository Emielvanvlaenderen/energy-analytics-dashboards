import { useProject } from './ProjectContext'
import { V2G_UK_ID } from './platforms/registry'

export function useSolutionPaths() {
  const { platform, projectId } = useProject()
  const base = platform?.routeBase ?? '/solutions/ci-bess-uk'
  const isV2g = projectId === V2G_UK_ID

  return {
    base,
    home: '/',
    gridTariffs: `${base}/grid-tariffs`,
    siteData: `${base}/site-data`,
    v2gSchedule: `${base}/v2g-schedule`,
    bessSimulation: `${base}/bess-simulation`,
    v2gSimulation: `${base}/v2g-simulation`,
    afterSiteData: isV2g ? `${base}/v2g-schedule` : `${base}/bess-simulation`,
    simulation: isV2g ? `${base}/v2g-simulation` : `${base}/bess-simulation`,
    results: `${base}/results`,
    methodology: `${base}/methodology`,
  }
}
