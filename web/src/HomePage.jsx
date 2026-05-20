import { Link } from 'react-router-dom'
import { BRAND } from './brand'
import { PLATFORMS, platformStatusLabel } from './platforms/registry'

export function HomePage() {
  return (
    <div className="inputs-page home-page" id="home">
      <header className="page-head home-page__head">
        <p className="page-head__eyebrow">{BRAND.tagline}</p>
        <h1 className="page-head__title">Analytics Platforms</h1>
        <p className="page-head__lead">
          Choose a solution to open its workflow.
        </p>
      </header>

      <ul className="platform-grid">
        {PLATFORMS.map((p) => {
          const badge = platformStatusLabel(p.status)
          const isAvailable = p.status === 'available'
          return (
            <li key={p.id}>
              <article
                className={`platform-card${isAvailable ? '' : ' platform-card--disabled'}`}
                style={{ '--platform-accent': p.accent }}
              >
                <div className="platform-card__top">
                  <span className="platform-card__region">{p.region}</span>
                  {badge ? (
                    <span className="platform-card__badge">{badge}</span>
                  ) : null}
                </div>
                <h2 className="platform-card__title">{p.title}</h2>
                <p className="platform-card__desc">{p.description}</p>
                {isAvailable ? (
                  <Link
                    to={p.routeBase}
                    className="btn btn--primary platform-card__cta"
                  >
                    {p.cta}
                  </Link>
                ) : (
                  <span className="btn platform-card__cta platform-card__cta--muted">
                    {p.cta}
                  </span>
                )}
              </article>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
