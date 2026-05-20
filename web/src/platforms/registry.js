/** Analytics platforms shown on the home page (keep in sync with server/projectsRegistry.mjs). */

export const PLATFORMS = [
  {
    id: 'ci-bess-uk',
    title: 'C&I BESS Simulator',
    region: 'UK',
    description:
      'Commercial and industrial battery storage: grid tariffs, site data, PuLP optimisation, and added-value results.',
    status: 'available',
    accent: '#1B4332',
    routeBase: '/solutions/ci-bess-uk',
    cta: 'Open Simulator',
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
    cta: 'Open Simulator',
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
    cta: 'Work in Progress',
  },
]

export const CI_BESS_UK_ID = 'ci-bess-uk'
export const V2G_UK_ID = 'v2g-uk'

export function getPlatformById(id) {
  return PLATFORMS.find((p) => p.id === id) ?? null
}

export function platformStatusLabel(status) {
  if (status === 'available') return null
  if (status === 'coming-soon') return 'Coming Soon'
  if (status === 'wip') return 'Work in Progress'
  return null
}
