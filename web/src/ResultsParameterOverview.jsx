/** Compact read-only overview of study parameters on the Results page. */
export function ResultsParameterOverview({ runSummary }) {
  const items = runSummary?.items
  if (!items?.length) return null

  return (
    <section
      className="panel inputs-panel results-panel results-page__subsection results-page__params"
      aria-labelledby="results-params-heading"
    >
      <h2 id="results-params-heading" className="panel__title">
        Study parameters
      </h2>
      <dl className="results-params-grid">
        {items.map((item) => (
          <div key={item.label} className="results-params-grid__item">
            <dt className="results-params-grid__label">{item.label}</dt>
            <dd className="results-params-grid__value">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
