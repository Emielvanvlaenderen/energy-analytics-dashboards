import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertModal } from './AlertModal'
import { SimulationNameModal } from './SimulationNameModal'
import { BRAND } from './brand'
import { useStudyInputs } from './StudyInputsContext'
import { jsonBodyWithGuest, projectFetch } from './lib/api'
import { buildStudySnapshot } from './lib/studySnapshot'
import { useProjectApi } from './useProjectApi'
import { useSolutionPaths } from './useSolutionPaths'

import { BESS_DURATIONS } from './lib/bessDurations'
  if (raw === '' || raw === '-' || raw === '.') return ''
  const n = Number.parseInt(String(raw), 10)
  return Number.isFinite(n) ? n : ''
}

function parseFloatOrEmpty(raw) {
  if (raw === '' || raw === '-' || raw === '.') return ''
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : ''
}

function readPct(raw) {
  return typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
}

/** @returns {string | null} error message or null if valid */
function validateBessForCommit(b) {
  if (!b.startDate || !b.endDate) {
    return 'Enter both a start date and an end date.'
  }
  if (b.endDate < b.startDate) {
    return 'End date must be on or after the start date.'
  }

  const cap =
    typeof b.capacityMw === 'number'
      ? b.capacityMw
      : Number.parseInt(String(b.capacityMw), 10)
  if (!Number.isFinite(cap) || cap < 1) {
    return 'BESS capacity must be a positive integer (MW).'
  }

  const dh = Number(b.durationHours)
  if (!BESS_DURATIONS.includes(dh)) {
    return 'BESS duration must be 2, 3, 4, 6, or 8 hours.'
  }

  const ce = readPct(b.chargingEfficiencyPct)
  const de = readPct(b.dischargingEfficiencyPct)
  if (!Number.isFinite(ce) || ce < 0 || ce > 100) {
    return 'Charging efficiency must be between 0 and 100 (%).'
  }
  if (!Number.isFinite(de) || de < 0 || de > 100) {
    return 'Discharging efficiency must be between 0 and 100 (%).'
  }

  const slo = readPct(b.socLowerPct)
  const sup = readPct(b.socUpperPct)
  if (!Number.isFinite(slo) || slo < 0 || slo > 100) {
    return 'SOC lower limit must be between 0 and 100 (%).'
  }
  if (!Number.isFinite(sup) || sup < 0 || sup > 100) {
    return 'SOC upper limit must be between 0 and 100 (%).'
  }
  if (slo >= sup) {
    return 'SOC lower limit must be less than the upper limit.'
  }

  const cyc = readPct(b.cyclesPerDayTarget)
  if (!Number.isFinite(cyc) || cyc < 0) {
    return 'Cycles per day target must be zero or positive.'
  }

  return null
}

export function BessSimulationPage() {
  const navigate = useNavigate()
  const apiBase = useProjectApi()
  const paths = useSolutionPaths()
  const {
    importNonEnergy,
    duos,
    bandMatrix,
    siteImportExportLimitsMw,
    siteDataForm,
    bessSimulationInputs,
    setBessSimulationInputs,
    setBessSimulationCommitted,
  } = useStudyInputs()

  const [modalTitle, setModalTitle] = useState('Check your inputs')
  const [modalMessage, setModalMessage] = useState(null)
  const [simulateLoading, setSimulateLoading] = useState(false)
  const [nameModalOpen, setNameModalOpen] = useState(false)
  const [pendingCommitted, setPendingCommitted] = useState(null)
  const [lastSimulationName, setLastSimulationName] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await projectFetch(`${apiBase}/study-inputs`)
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || !data.ok || !data.study?.simulationName) return
        setLastSimulationName(String(data.study.simulationName))
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function patchBess(patch) {
    setBessSimulationInputs((prev) => ({ ...prev, ...patch }))
  }

  const b = bessSimulationInputs

  function handleSimulateBess() {
    setModalMessage(null)
    const err = validateBessForCommit(b)
    if (err) {
      setModalTitle('Cannot simulate')
      setModalMessage(err)
      return
    }

    const cap = Number.parseInt(String(b.capacityMw), 10)
    const ce = readPct(b.chargingEfficiencyPct)
    const de = readPct(b.dischargingEfficiencyPct)
    const slo = readPct(b.socLowerPct)
    const sup = readPct(b.socUpperPct)
    const cyc = readPct(b.cyclesPerDayTarget)
    const dh = BESS_DURATIONS.includes(Number(b.durationHours))
      ? Number(b.durationHours)
      : 2

    setPendingCommitted({
      startDate: b.startDate,
      endDate: b.endDate,
      capacityMw: cap,
      durationHours: dh,
      chargingEfficiencyPct: ce,
      dischargingEfficiencyPct: de,
      socLowerPct: slo,
      socUpperPct: sup,
      cyclesPerDayTarget: cyc,
    })
    setNameModalOpen(true)
  }

  function closeNameModal() {
    if (simulateLoading) return
    setNameModalOpen(false)
    setPendingCommitted(null)
  }

  async function runSimulationWithName(simulationName) {
    if (!pendingCommitted) return
    const committed = pendingCommitted
    setBessSimulationCommitted(committed)
    setLastSimulationName(simulationName)

    setSimulateLoading(true)
    try {
      const studySnapshot = buildStudySnapshot({
        importNonEnergy,
        duos,
        bandMatrix,
        siteImportExportLimitsMw,
        siteDataForm,
        bessSimulationCommitted: committed,
        simulationName,
      })

      const runRes = await projectFetch(`${apiBase}/run-bess-optimisation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonBodyWithGuest({ studySnapshot }),
      })
      const runData = await runRes.json().catch(() => ({}))
      if (!runRes.ok || !runData.ok) {
        const detail =
          typeof runData.error === 'string'
            ? runData.error
            : 'The optimisation did not complete successfully.'
        const missingInputs =
          runRes.status === 400 ||
          /study inputs have not been submitted|study_inputs\.json is missing/i.test(
            detail,
          )
        setModalTitle(missingInputs ? 'Inputs not submitted' : 'Optimisation failed')
        setModalMessage(detail)
        return
      }

      setNameModalOpen(false)
      setPendingCommitted(null)
      navigate(paths.results)
    } catch (e) {
      setModalTitle('Error')
      setModalMessage(
        e instanceof Error ? e.message : 'Could not reach the optimisation API.',
      )
    } finally {
      setSimulateLoading(false)
    }
  }

  function closeModal() {
    setModalMessage(null)
  }

  return (
    <div className="inputs-page" id="bess-simulation">
      <AlertModal title={modalTitle} message={modalMessage} onClose={closeModal} />
      <SimulationNameModal
        open={nameModalOpen}
        defaultName={lastSimulationName}
        loading={simulateLoading}
        onConfirm={runSimulationWithName}
        onCancel={closeNameModal}
      />

      <header className="page-head">
        <p className="page-head__eyebrow">{BRAND.tagline}</p>
        <h1 className="page-head__title">BESS simulation</h1>
        <p className="page-head__lead">
          Configure the battery energy storage study period, asset parameters,
          efficiency, state-of-charge bounds, and cycling target. Values are
          kept for optimisation and results.
        </p>
      </header>

      <section className="panel inputs-panel" aria-labelledby="bess-limits">
        <h2 id="bess-limits" className="panel__title">
          Site power limits (from Site data)
        </h2>
        {siteImportExportLimitsMw ? (
          <ul className="bess-limits-list">
            <li>
              Maximum site import:{' '}
              <strong>{siteImportExportLimitsMw.maxImportMw} MW</strong>
            </li>
            <li>
              Maximum site export:{' '}
              <strong>{siteImportExportLimitsMw.maxExportMw} MW</strong>
            </li>
          </ul>
        ) : (
          <p className="panel__hint">
            No limits were committed yet. Go back to Site data and use Continue
            to save maximum import and export.
          </p>
        )}
      </section>

      <section className="panel inputs-panel" aria-labelledby="bess-params">
        <h2 id="bess-params" className="panel__title">
          BESS parameters
        </h2>

        <div className="bess-form">
          <div className="bess-form__row bess-form__row--dates">
            <label className="field field--stacked">
              <span className="field__label">Start date</span>
              <input
                className="field__input field__input--sm"
                type="date"
                value={b.startDate}
                onChange={(e) => patchBess({ startDate: e.target.value })}
              />
            </label>
            <label className="field field--stacked">
              <span className="field__label">End date</span>
              <input
                className="field__input field__input--sm"
                type="date"
                value={b.endDate}
                onChange={(e) => patchBess({ endDate: e.target.value })}
                min={b.startDate || undefined}
              />
            </label>
          </div>

          <div className="bess-form__row">
            <label className="field field--stacked">
              <span className="field__label">
                Battery capacity <span className="field__unit">(MW)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                inputMode="numeric"
                step={1}
                min={1}
                placeholder="e.g. 50"
                value={b.capacityMw}
                onChange={(e) =>
                  patchBess({ capacityMw: parseIntOrEmpty(e.target.value) })
                }
              />
            </label>

            <label className="field field--stacked">
              <span className="field__label">
                Duration <span className="field__unit">(h)</span>
              </span>
              <select
                className="field__input field__input--sm"
                value={b.durationHours}
                onChange={(e) =>
                  patchBess({ durationHours: Number(e.target.value) })
                }
              >
                {BESS_DURATIONS.map((h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="bess-form__row">
            <label className="field field--stacked">
              <span className="field__label">
                Charging efficiency <span className="field__unit">(%)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                max={100}
                placeholder="0–100"
                value={b.chargingEfficiencyPct}
                onChange={(e) =>
                  patchBess({
                    chargingEfficiencyPct: parseFloatOrEmpty(e.target.value),
                  })
                }
              />
            </label>
            <label className="field field--stacked">
              <span className="field__label">
                Discharging efficiency <span className="field__unit">(%)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                max={100}
                placeholder="0–100"
                value={b.dischargingEfficiencyPct}
                onChange={(e) =>
                  patchBess({
                    dischargingEfficiencyPct: parseFloatOrEmpty(e.target.value),
                  })
                }
              />
            </label>
          </div>

          <div className="bess-form__row">
            <label className="field field--stacked">
              <span className="field__label">
                SOC lower limit <span className="field__unit">(%)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                max={100}
                placeholder="0–100"
                value={b.socLowerPct}
                onChange={(e) =>
                  patchBess({ socLowerPct: parseFloatOrEmpty(e.target.value) })
                }
              />
            </label>
            <label className="field field--stacked">
              <span className="field__label">
                SOC upper limit <span className="field__unit">(%)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                max={100}
                placeholder="0–100"
                value={b.socUpperPct}
                onChange={(e) =>
                  patchBess({ socUpperPct: parseFloatOrEmpty(e.target.value) })
                }
              />
            </label>
          </div>

          <p className="panel__hint bess-form__soc-hint">
            State-of-charge limits are expressed as a percentage of usable
            energy (0–100%). The lower bound should be less than the upper
            bound.
          </p>

          <label className="field field--stacked field--full">
            <span className="field__label">Cycles per day target</span>
            <input
              className="field__input field__input--sm"
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              placeholder="e.g. 1.5"
              value={b.cyclesPerDayTarget}
              onChange={(e) =>
                patchBess({
                  cyclesPerDayTarget: parseFloatOrEmpty(e.target.value),
                })
              }
            />
          </label>
        </div>

        <div className="continue-section continue-section--bess-sim">
          <div className="page-actions">
            <button
              type="button"
              className="btn btn--primary btn--continue"
              disabled={simulateLoading}
              onClick={handleSimulateBess}
            >
              {simulateLoading
                ? 'Running optimisation…'
                : 'Simulate BESS'}
            </button>
          </div>
          <p className="continue-section__note">
            Saves inputs, writes <code>study_inputs.json</code>, runs the BESS
            optimisation, writes a CSV under <code>results/</code>, then opens
            the Results page with an interactive operations chart.
          </p>
        </div>
      </section>
    </div>
  )
}
