/**
 * Analytics platforms / solutions available in the dashboard.
 * Add a folder under `projects/{id}/` and register it here.
 */

export const PROJECTS = [
  {
    id: 'ci-bess-uk',
    title: 'C&I BESS Simulator',
    region: 'UK',
    description:
      'Commercial and industrial battery storage: grid tariffs, site data, PuLP optimisation, and added-value results.',
    status: 'available',
    accent: '#1B4332',
    routeBase: '/solutions/ci-bess-uk',
  },
  {
    id: 'v2g-uk',
    title: 'V2G Charging',
    region: 'UK',
    description:
      'Vehicle-to-grid charging economics and dispatch for UK fleets and charge points.',
    status: 'available',
    accent: '#1e3a5f',
    routeBase: '/solutions/v2g-uk',
  },
  {
    id: 'benelux-ancillary',
    title: 'BE/NL Ancillary Service',
    region: 'BE · NL',
    description:
      'Ancillary and balancing revenue modelling for batteries in Belgium and the Netherlands.',
    status: 'wip',
    accent: '#5b21b6',
    routeBase: '/solutions/benelux-ancillary',
  },
]

export function getProjectById(projectId) {
  return PROJECTS.find((p) => p.id === projectId) ?? null
}

export function isProjectAvailable(projectId) {
  const p = getProjectById(projectId)
  return p?.status === 'available'
}
