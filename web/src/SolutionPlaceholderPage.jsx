import { Link } from 'react-router-dom'
import { useProject } from './ProjectContext'
import { platformStatusLabel } from './platforms/registry'

export function SolutionPlaceholderPage() {
  const { platform } = useProject()
  if (!platform) return null

  const badge = platformStatusLabel(platform.status)

  return (
    <div className="inputs-page solution-placeholder" id="solution-placeholder">
      <header className="page-head">
        <p className="page-head__eyebrow">{platform.region}</p>
        <h1 className="page-head__title">{platform.title}</h1>
        {badge ? (
          <p className="solution-placeholder__badge">{badge}</p>
        ) : null}
        <p className="page-head__lead">{platform.description}</p>
      </header>

      <section className="panel inputs-panel">
        <p className="panel__hint">
          This platform is not wired up in the UI yet. When you are ready to
          build it, add pages under <code>web/src</code> and keep inputs under{' '}
          <code>projects/{platform.id}/</code> (see the README in that folder).
        </p>
        <p className="panel__hint">
          <Link to="/">← All analytics platforms</Link>
        </p>
      </section>
    </div>
  )
}
