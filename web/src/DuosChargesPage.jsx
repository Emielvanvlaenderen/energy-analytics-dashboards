import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectFetch } from './lib/api'
import { useProjectApi } from './useProjectApi'
import { useSolutionPaths } from './useSolutionPaths'
import { AlertModal } from './AlertModal'
import { BRAND } from './brand'
import { BandMatrix, timeLabel } from './BandMatrix'
import { validateDuosChargesForm } from '../lib/duosFormValidation.js'
import { useStudyInputs } from './StudyInputsContext'

function parseFloatOrEmpty(raw) {
  if (raw === '' || raw === '-' || raw === '.') return ''
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : ''
}

const categories = ['green', 'amber', 'red']

const IMPORT_DUOS_PLACEHOLDER = {
  green: 'e.g. 1.23',
  amber: 'e.g. 12.34',
  red: 'e.g. 67.89',
}

const EXPORT_DUOS_PLACEHOLDER = {
  green: 'e.g. -1.23',
  amber: 'e.g. -12.34',
  red: 'e.g. -67.89',
}

export function DuosChargesPage() {
  const navigate = useNavigate()
  const apiBase = useProjectApi()
  const paths = useSolutionPaths()
  const {
    importNonEnergy,
    setImportNonEnergy,
    duos,
    setDuos,
    bandMatrix,
    setBandMatrix,
  } = useStudyInputs()

  const [continueError, setContinueError] = useState(null)
  const [continueLoading, setContinueLoading] = useState(false)
  const [modalMessage, setModalMessage] = useState(null)
  const [modalTitle, setModalTitle] = useState('Check your inputs')
  const navigateAfterModalClose = useRef(false)

  const timeColumns = useMemo(
    () => Array.from({ length: 48 }, (_, i) => timeLabel(i)),
    [],
  )

  function setDuosField(category, field, value) {
    setDuos((prev) => ({
      ...prev,
      [category]: { ...prev[category], [field]: value },
    }))
  }

  function closeModal() {
    setModalMessage(null)
    if (navigateAfterModalClose.current) {
      navigateAfterModalClose.current = false
      navigate(paths.siteData)
    }
  }

  async function handleContinue() {
    setContinueError(null)
    setModalMessage(null)
    navigateAfterModalClose.current = false

    const validation = validateDuosChargesForm({ importNonEnergy, duos })
    if (!validation.ok) {
      setModalTitle('Check your inputs')
      setModalMessage(validation.message)
      return
    }

    setContinueLoading(true)
    try {
      const res = await projectFetch(`${apiBase}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importNonEnergy,
          duos,
          bandMatrix,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error || res.statusText || 'Could not generate CSV files',
        )
      }
      navigateAfterModalClose.current = true
      setModalTitle('Success')
      setModalMessage('Timeseries successfully generated.')
    } catch (e) {
      setContinueError(
        e instanceof Error
          ? e.message
          : 'Failed to reach the server. Run `npm run dev` so the API is available.',
      )
    } finally {
      setContinueLoading(false)
    }
  }

  return (
    <div className="inputs-page" id="grid-tariffs">
      <AlertModal
        title={modalTitle}
        message={modalMessage}
        onClose={closeModal}
      />

      <header className="page-head">
        <p className="page-head__eyebrow">{BRAND.tagline}</p>
        <h1 id="page-title" className="page-head__title">
          Grid tariffs
        </h1>
        <p className="page-head__lead">
          Network charges (£/MWh) and half-hourly DUoS time bands.
        </p>
      </header>

      <section className="panel inputs-panel" aria-labelledby="page-title">
        <label className="field field--import-ne-full">
          <span className="field__label">
            Import non-energy <span className="field__unit">(£/MWh)</span>
          </span>
          <input
            className="field__input field__input--sm"
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="e.g. 67.89"
            value={importNonEnergy}
            onChange={(e) =>
              setImportNonEnergy(parseFloatOrEmpty(e.target.value))
            }
          />
        </label>

        <div className="charges-table-wrap">
          <table className="charges-table charges-table--pivot">
            <caption className="charges-table__caption">
              DUoS rates by time-of-use band — values in £/MWh (import positive,
              export negative)
            </caption>
            <thead>
              <tr>
                <th scope="col" className="charges-table__corner">
                  DUoS
                </th>
                {categories.map((cat) => (
                  <th key={cat} scope="col" className="charges-table__col-band">
                    <span
                      className={`charges-table__pill charges-table__pill--${cat}`}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </span>
                    <span className="charges-table__col-unit">£/MWh</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="charges-table__row-label">
                  Import DUoS
                </th>
                {categories.map((cat) => (
                  <td key={`imp-${cat}`}>
                    <input
                      className="field__input field__input--sm charges-table__num"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder={IMPORT_DUOS_PLACEHOLDER[cat]}
                      value={duos[cat].import}
                      onChange={(e) =>
                        setDuosField(
                          cat,
                          'import',
                          parseFloatOrEmpty(e.target.value),
                        )
                      }
                      aria-label={`Import DUoS, ${cat}, £ per MWh, positive`}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="charges-table__row-label">
                  Export DUoS
                </th>
                {categories.map((cat) => (
                  <td key={`exp-${cat}`}>
                    <input
                      className="field__input field__input--sm charges-table__num"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder={EXPORT_DUOS_PLACEHOLDER[cat]}
                      value={duos[cat].export}
                      onChange={(e) =>
                        setDuosField(
                          cat,
                          'export',
                          parseFloatOrEmpty(e.target.value),
                        )
                      }
                      aria-label={`Export DUoS, ${cat}, £ per MWh, negative`}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="inputs-subsection inputs-subsection--nested inputs-subsection--nested-only">
          <h2 id="bands-heading" className="inputs-subsection__subtitle">
            Time-of-use bands
          </h2>
          <p className="panel__hint">
            48 half-hour slots (00:00–23:30). Copy a region to Excel as
            tab-separated values; paste the same format back.
          </p>

          <BandMatrix
            matrix={bandMatrix}
            onMatrixChange={setBandMatrix}
            timeColumns={timeColumns}
          />
        </div>

        <div className="continue-section">
          {continueError ? (
            <p className="continue-section__error" role="alert">
              {continueError}
            </p>
          ) : null}
          <div className="page-actions">
            <button
              type="button"
              className="btn btn--primary btn--continue"
              disabled={continueLoading}
              onClick={handleContinue}
            >
              {continueLoading ? 'Generating…' : 'Continue'}
            </button>
          </div>
          <p className="continue-section__note">
            Writes half-hourly import and export charge curves from 2024 through
            the last completed half-hour (Europe/London) as CSV.
          </p>
        </div>
      </section>
    </div>
  )
}
