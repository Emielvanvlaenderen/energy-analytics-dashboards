import { timeLabel as bandTimeLabel } from './BandMatrix'
import {
  V2G_DAY_LABELS,
  V2G_SLOTS,
  scheduleToMatrix,
  timeLabel as v2gTimeLabel,
} from './v2gSchedule'

const DUOS_COLORS = ['green', 'amber', 'red']

function DuosRatesTable({ duos }) {
  if (!duos?.rates) return null
  return (
    <table className="results-params-table">
      <thead>
        <tr>
          <th scope="col">Band</th>
          <th scope="col">Import (£/MWh)</th>
          <th scope="col">Export (£/MWh)</th>
        </tr>
      </thead>
      <tbody>
        {DUOS_COLORS.map((color) => {
          const row = duos.rates[color] ?? {}
          return (
            <tr key={color}>
              <th scope="row" className={`results-params-table__band results-params-table__band--${color}`}>
                {color}
              </th>
              <td>{row.import !== '' && row.import != null ? row.import : '—'}</td>
              <td>{row.export !== '' && row.export != null ? row.export : '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ReadOnlyBandMatrix({ matrix }) {
  if (!Array.isArray(matrix) || matrix.length !== 2) return null
  const rowLabels = ['Weekday', 'Weekend']
  const timeColumns = Array.from({ length: 48 }, (_, i) => bandTimeLabel(i))
  const letter = (band) =>
    band === 'green' ? 'G' : band === 'amber' ? 'A' : 'R'

  return (
    <div className="results-params-matrix results-params-matrix--readonly band-matrix-wrap">
      <div className="matrix-scroll band-matrix-scroll">
        <table className="band-matrix">
          <thead>
            <tr>
              <th className="band-matrix__corner" scope="col" />
              {timeColumns.map((t) => (
                <th key={t} className="band-matrix__time" scope="col">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((label, row) => (
              <tr key={label}>
                <th className="band-matrix__rowhead" scope="row">
                  {label}
                </th>
                {timeColumns.map((_, col) => {
                  const v = matrix[row]?.[col] ?? 'green'
                  return (
                    <td key={col} className="band-matrix__cell">
                      <span
                        className={`band-cell band-cell--${v} results-params-matrix__cell`}
                        aria-label={`${label} ${timeColumns[col]}, ${v}`}
                      >
                        <span className="band-cell__letter">{letter(v)}</span>
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReadOnlyV2gSchedule({ schedule }) {
  const matrix = scheduleToMatrix(schedule)
  const timeColumns = Array.from({ length: V2G_SLOTS }, (_, i) => v2gTimeLabel(i))
  const letter = (state) => (state === 'in' ? 'I' : 'O')

  return (
    <div className="results-params-matrix results-params-matrix--readonly band-matrix-wrap v2g-schedule-wrap">
      <div className="matrix-scroll band-matrix-scroll">
        <table className="band-matrix v2g-schedule-matrix">
          <thead>
            <tr>
              <th className="band-matrix__corner" scope="col" />
              {timeColumns.map((t) => (
                <th key={t} className="band-matrix__time" scope="col">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {V2G_DAY_LABELS.map((label, row) => (
              <tr key={label}>
                <th className="band-matrix__rowhead" scope="row">
                  {label}
                </th>
                {timeColumns.map((_, col) => {
                  const v = matrix[row]?.[col] ?? 'out'
                  return (
                    <td key={col} className="band-matrix__cell">
                      <span
                        className={`band-cell v2g-cell v2g-cell--${v} results-params-matrix__cell`}
                        aria-label={`${label} ${timeColumns[col]}, ${v === 'in' ? 'plugged in' : 'away'}`}
                      >
                        <span className="band-cell__letter">{letter(v)}</span>
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Compact read-only overview of study parameters on the Results page. */
export function ResultsParameterOverview({ runSummary }) {
  const items = runSummary?.items
  const duos = runSummary?.duos
  const v2gSchedule = runSummary?.v2gSchedule
  if (!items?.length && !duos && !v2gSchedule) return null

  return (
    <section
      className="panel inputs-panel results-panel results-page__subsection results-page__params"
      aria-labelledby="results-params-heading"
    >
      <h2 id="results-params-heading" className="panel__title">
        Study parameters
      </h2>

      {items?.length ? (
        <dl className="results-params-grid">
          {items.map((item) => (
            <div key={item.label} className="results-params-grid__item">
              <dt className="results-params-grid__label">{item.label}</dt>
              <dd className="results-params-grid__value">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {duos ? (
        <div className="results-params-visual">
          <h3 className="results-page__subhead">DUoS tariffs</h3>
          {duos.importNonEnergy != null ? (
            <p className="results-params-visual__lead">
              Import non-energy charge: <strong>{duos.importNonEnergy} £/MWh</strong>
            </p>
          ) : null}
          <DuosRatesTable duos={duos} />
          {duos.bandMatrix ? (
            <>
              <h4 className="results-params-visual__caption">Time-of-use bands</h4>
              {duos.profileSummary ? (
                <p className="panel__hint results-params-visual__summary">
                  {duos.profileSummary}
                </p>
              ) : null}
              <ReadOnlyBandMatrix matrix={duos.bandMatrix} />
            </>
          ) : null}
        </div>
      ) : null}

      {v2gSchedule?.rows?.length ? (
        <div className="results-params-visual">
          <h3 className="results-page__subhead">V2G plug-in schedule</h3>
          <p className="panel__hint results-params-visual__summary">
            <strong>In</strong> = plugged in (optimise) · <strong>Out</strong> = away
          </p>
          <ReadOnlyV2gSchedule schedule={v2gSchedule} />
        </div>
      ) : null}
    </section>
  )
}
