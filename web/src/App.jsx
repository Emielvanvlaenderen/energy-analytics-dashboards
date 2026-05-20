import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { BRAND } from './brand'
import { BrandLogo } from './BrandLogo'
import { HomePage } from './HomePage'
import { ProjectProvider } from './ProjectContext'
import { SolutionLayout } from './SolutionLayout'
import { SolutionNav } from './SolutionNav'
import { SolutionRoutes } from './SolutionRoutes'
import { getPlatformById } from './platforms/registry'
import { AuthHeader } from './AuthHeader'
import { AuthCallbackPage } from './AuthCallbackPage'

function AppHeader() {
  const location = useLocation()
  const solutionMatch = location.pathname.match(/^\/solutions\/([^/]+)/)
  const projectId = solutionMatch?.[1]
  const platform = projectId ? getPlatformById(projectId) : null
  const onSolution = Boolean(platform)

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <NavLink
          to="/"
          className="brand"
          end
          aria-label={`${BRAND.name} — ${BRAND.tagline}, home`}
        >
          <BrandLogo />
          <span className="brand__text">
            <span className="brand__name">{BRAND.name}</span>
            <span className="brand__tagline">
              {onSolution ? platform.title : BRAND.tagline}
            </span>
          </span>
        </NavLink>
        {onSolution ? (
          <ProjectProvider projectId={projectId}>
            <SolutionNav />
          </ProjectProvider>
        ) : null}
        <AuthHeader />
      </div>
    </header>
  )
}

function App() {
  return (
    <div className="app">
      <AppHeader />

      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          <Route path="/solutions/:projectId/*" element={<SolutionLayout />}>
            <Route path="*" element={<SolutionRoutes />} />
          </Route>

          <Route
            path="/site-data"
            element={<Navigate to="/solutions/ci-bess-uk/site-data" replace />}
          />
          <Route
            path="/bess-simulation"
            element={
              <Navigate to="/solutions/ci-bess-uk/bess-simulation" replace />
            }
          />
          <Route
            path="/results"
            element={<Navigate to="/solutions/ci-bess-uk/results" replace />}
          />
          <Route
            path="/methodology"
            element={
              <Navigate to="/solutions/ci-bess-uk/methodology" replace />
            }
          />
          <Route
            path="/grid-tariffs"
            element={
              <Navigate to="/solutions/ci-bess-uk/grid-tariffs" replace />
            }
          />
          <Route
            path="/site-demand"
            element={<Navigate to="/solutions/ci-bess-uk/site-data" replace />}
          />
        </Routes>
      </main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <span className="site-footer__copy">
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.tagline}
          </span>
        </div>
      </footer>
    </div>
  )
}

export default App
