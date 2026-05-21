import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertModal } from './AlertModal'
import { SimulationNameModal } from './SimulationNameModal'
import { BRAND } from './brand'
import { useStudyInputs } from './StudyInputsContext'
import { BESS_DURATIONS } from './lib/bessDurations'
import { jsonBodyWithGuest, projectFetch } from './lib/api'
import { buildStudySnapshot } from './lib/studySnapshot'
import { v2gCommittedBatteryFields } from './lib/v2gBatteryFields'
import { useProjectApi } from './useProjectApi'
import { useSolutionPaths } from './useSolutionPaths'

function parseIntOrEmpty(raw) {
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
function validateV2gForCommit(v, schedule) {
  if (!v.startDate || !v.endDate) {
    return 'Enter both a start date and an end date.'
  }
  if (v.endDate < v.startDate) {
    return 'End date must be on or after the start date.'
  }

  const cap =
    typeof v.capacityMw === 'number'
      ? v.capacityMw
      : Number.parseInt(String(v.capacityMw), 10)
  if (!Number.isFinite(cap) || cap < 1) {
    return 'Battery capacity must be a positive integer (MW).'
  }

  const dh = Number(v.durationHours)
  if (!BESS_DURATIONS.includes(dh)) {
    return 'Duration must be 2, 3, 4, 6, or 8 hours.'
  }

  const ce = readPct(v.chargingEfficiencyPct)
  const de = readPct(v.dischargingEfficiencyPct)
  if (!Number.isFinite(ce) || ce < 0 || ce > 100) {
    return 'Charging efficiency must be between 0 and 100 (%).'
  }
  if (!Number.isFinite(de) || de < 0 || de > 100) {
    return 'Discharging efficiency must be between 0 and 100 (%).'
  }

  const slo = readPct(v.socLowerPct)
  const sup = readPct(v.socUpperPct)
  const ret = readPct(v.returnSocPct)
  const tgt = readPct(v.targetSocPct)
  if (!Number.isFinite(slo) || slo < 0 || slo > 100) {
    return 'SOC lower limit must be between 0 and 100 (%).'
  }
  if (!Number.isFinite(sup) || sup < 0 || sup > 100) {
    return 'SOC upper limit must be between 0 and 100 (%).'
  }
  if (!Number.isFinite(ret) || ret < 0 || ret > 100) {
    return 'Return SoC must be between 0 and 100 (%).'
  }
  if (!Number.isFinite(tgt) || tgt < 0 || tgt > 100) {
    return 'Target SoC at departure must be between 0 and 100 (%).'
  }
  if (slo >= sup) {
    return 'SOC lower limit must be less than the upper limit.'
  }
  if (ret < slo || ret > sup) {
    return 'Return SoC must be between the SOC lower and upper limits.'
  }
  if (tgt < slo || tgt > sup) {
    return 'Target SoC at departure must be between the SOC lower and upper limits.'
  }
  if (!schedule?.rows?.length) return 'Define the vehicle plug-in schedule.'
  return null
}

export function V2gSimulationPage() {
  const navigate = useNavigate()
  const apiBase = useProjectApi()
  const paths = useSolutionPaths()
  const {
    importNonEnergy,
    duos,
    bandMatrix,
    siteImportExportLimitsMw,
    siteDataForm,
    v2gSchedule,
    v2gSimulationInputs,
    setV2gSimulationInputs,
    setV2gSimulationCommitted,
  } = useStudyInputs()

  const [modalTitle, setModalTitle] = useState('Check your inputs')
  const [modalMessage, setModalMessage] = useState(null)
  const [simulateLoading, setSimulateLoading] = useState(false)
  const [nameModalOpen, setNameModalOpen] = useState(false)
  const [pendingCommitted, setPendingCommitted] = useState(null)
  const [lastSimulationName, setLastSimulationName] = useState('')

  const v = v2gSimulationInputs

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
  }, [apiBase])

  function patchV2g(patch) {
    setV2gSimulationInputs((prev) => ({ ...prev, ...patch }))
  }

  function handleSimulate() {
    setModalMessage(null)
    const err = validateV2gForCommit(v, v2gSchedule)
    if (err) {
      setModalTitle('Cannot simulate')
      setModalMessage(err)
      return
    }

    const cap = Number.parseInt(String(v.capacityMw), 10)
    const dh = BESS_DURATIONS.includes(Number(v.durationHours))
      ? Number(v.durationHours)
      : 2
    const battery = v2gCommittedBatteryFields(cap, dh)

    setPendingCommitted({
      startDate: v.startDate,
      endDate: v.endDate,
      ...battery,
      socLowerPct: readPct(v.socLowerPct),
      socUpperPct: readPct(v.socUpperPct),
      returnSocPct: readPct(v.returnSocPct),
      targetSocPct: readPct(v.targetSocPct),
      chargingEfficiencyPct: readPct(v.chargingEfficiencyPct),
      dischargingEfficiencyPct: readPct(v.dischargingEfficiencyPct),
      simulationType: v.simulationType === 'Smart charging' ? 'Smart charging' : 'V2G',
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
    setV2gSimulationCommitted(committed)
    setLastSimulationName(simulationName)
    setSimulateLoading(true)
    try {
      const studySnapshot = buildStudySnapshot({
        importNonEnergy,
        duos,
        bandMatrix,
        siteImportExportLimitsMw,
        siteDataForm,
        v2gSchedule,
        v2gSimulationCommitted: committed,
        simulationName,
      })

      const runRes = await projectFetch(`${apiBase}/run-bess-optimisation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonBodyWithGuest({ studySnapshot }),
      })
      const runData = await runRes.json().catch(() => ({}))
      if (!runRes.ok || !runData.ok) {
        setModalTitle('Optimisation failed')
        setModalMessage(
          typeof runData.error === 'string'
            ? runData.error
            : 'The V2G optimisation did not complete successfully.',
        )
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
    <div className="inputs-page" id="v2g-simulation">
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
        <h1 className="page-head__title">V2G simulation</h1>
        <p className="page-head__lead">
          Set battery capacity, duration, efficiencies, and state-of-charge bounds.
          Return and target SoC apply at the start and end of each plugged-in session.
          The plug-in schedule is on <strong>V2G schedule</strong>.
        </p>
      </header>

      <section className="panel inputs-panel" aria-labelledby="v2g-limits">
        <h2 id="v2g-limits" className="panel__title">
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
            Complete Site data first to set site import and export limits.
          </p>
        )}
      </section>

      <section className="panel inputs-panel" aria-labelledby="v2g-params">
        <h2 id="v2g-params" className="panel__title">
          Vehicle and battery
        </h2>

        <div className="bess-form">
          <div className="bess-form__row bess-form__row--dates">
            <label className="field field--stacked">
              <span className="field__label">Start date</span>
              <input
                className="field__input field__input--sm"
                type="date"
                value={v.startDate}
                onChange={(e) => patchV2g({ startDate: e.target.value })}
              />
            </label>
            <label className="field field--stacked">
              <span className="field__label">End date</span>
              <input
                className="field__input field__input--sm"
                type="date"
                value={v.endDate}
                onChange={(e) => patchV2g({ endDate: e.target.value })}
                min={v.startDate || undefined}
              />
            </label>
          </div>

          <label className="field field--stacked field--full">
            <span className="field__label">Simulation type</span>
            <select
              className="field__input field__input--sm"
              value={v.simulationType}
              onChange={(e) => patchV2g({ simulationType: e.target.value })}
            >
              <option value="V2G">V2G (bidirectional)</option>
              <option value="Smart charging">Smart charging (no discharge)</option>
            </select>
          </label>

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
                placeholder="e.g. 7"
                value={v.capacityMw}
                onChange={(e) =>
                  patchV2g({ capacityMw: parseIntOrEmpty(e.target.value) })
                }
              />
            </label>
            <label className="field field--stacked">
              <span className="field__label">
                Duration <span className="field__unit">(h)</span>
              </span>
              <select
                className="field__input field__input--sm"
                value={v.durationHours}
                onChange={(e) =>
                  patchV2g({ durationHours: Number(e.target.value) })
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
                value={v.chargingEfficiencyPct}
                onChange={(e) =>
                  patchV2g({
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
                value={v.dischargingEfficiencyPct}
                onChange={(e) =>
                  patchV2g({
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
                value={v.socLowerPct}
                onChange={(e) =>
                  patchV2g({ socLowerPct: parseFloatOrEmpty(e.target.value) })
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
                value={v.socUpperPct}
                onChange={(e) =>
                  patchV2g({ socUpperPct: parseFloatOrEmpty(e.target.value) })
                }
              />
            </label>
          </div>

          <div className="bess-form__row">
            <label className="field field--stacked">
              <span className="field__label">
                Return SoC <span className="field__unit">(%)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                max={100}
                placeholder="0–100"
                value={v.returnSocPct}
                onChange={(e) =>
                  patchV2g({ returnSocPct: parseFloatOrEmpty(e.target.value) })
                }
              />
            </label>
            <label className="field field--stacked">
              <span className="field__label">
                Target SoC at departure <span className="field__unit">(%)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                max={100}
                placeholder="0–100"
                value={v.targetSocPct}
                onChange={(e) =>
                  patchV2g({ targetSocPct: parseFloatOrEmpty(e.target.value) })
                }
              />
            </label>
          </div>

          <p className="panel__hint bess-form__soc-hint">
            Return SoC applies when the vehicle plugs in; target SoC must be reached
            before it leaves. SOC limits are usable energy bounds (0–100%).
          </p>
        </div>

        <div className="continue-section continue-section--bess-sim">
          <div className="page-actions">
            <button
              type="button"
              className="btn btn--primary btn--continue"
              disabled={simulateLoading}
              onClick={handleSimulate}
            >
              {simulateLoading ? 'Running optimisation…' : 'Simulate V2G'}
            </button>
          </div>
          <p className="continue-section__note">
            Optimises each plugged-in session versus plug-and-charge, then writes a
            CSV under <code>projects/v2g-uk/results/</code>.
          </p>
        </div>
      </section>
    </div>
  )
}
