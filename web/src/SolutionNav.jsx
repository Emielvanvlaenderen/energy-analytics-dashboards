import { NavLink } from 'react-router-dom'
import { useProject } from './ProjectContext'
import { CI_BESS_UK_ID, V2G_UK_ID } from './platforms/registry'

export function SolutionNav() {
  const { platform, projectId } = useProject()
  if (!platform || platform.status !== 'available') return null

  const base = platform.routeBase
  const isV2g = projectId === V2G_UK_ID
  const simPath = isV2g ? `${base}/v2g-simulation` : `${base}/bess-simulation`
  const simLabel = isV2g ? 'V2G simulation' : 'BESS simulation'

  return (
    <nav className="nav nav--solution" aria-label={`${platform.title} workflow`}>
      <NavLink
        to={`${base}/methodology`}
        className={({ isActive }) =>
          `nav__link${isActive ? ' nav__link--active' : ''}`
        }
      >
        Methodology
      </NavLink>
      <NavLink
        to={`${base}/grid-tariffs`}
        className={({ isActive }) =>
          `nav__link${isActive ? ' nav__link--active' : ''}`
        }
      >
        Grid tariffs
      </NavLink>
      <NavLink
        to={`${base}/site-data`}
        className={({ isActive }) =>
          `nav__link${isActive ? ' nav__link--active' : ''}`
        }
      >
        Site data
      </NavLink>
      {isV2g ? (
        <NavLink
          to={`${base}/v2g-schedule`}
          className={({ isActive }) =>
            `nav__link${isActive ? ' nav__link--active' : ''}`
          }
        >
          V2G schedule
        </NavLink>
      ) : null}
      <NavLink
        to={simPath}
        className={({ isActive }) =>
          `nav__link${isActive ? ' nav__link--active' : ''}`
        }
      >
        {simLabel}
      </NavLink>
      <NavLink
        to={`${base}/results`}
        className={({ isActive }) =>
          `nav__link${isActive ? ' nav__link--active' : ''}`
        }
      >
        Results
      </NavLink>
    </nav>
  )
}
