import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertModal } from './AlertModal'
import { SimulationNameModal } from './SimulationNameModal'
import { BRAND } from './brand'
import { useStudyInputs } from './StudyInputsContext'
import { useProjectApi } from './useProjectApi'
import { useSolutionPaths } from './useSolutionPaths'

function parseFloatOrEmpty(raw) {
  if (raw === '' || raw === '-' || raw === '.') return ''
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : ''
}

function validateV2gForCommit(v, schedule) {
  if (!v.startDate || !v.endDate) {
    return 'Enter both a start date and an end date.'
  }
  if (v.endDate < v.startDate) {
    return 'End date must be on or after the start date.'
  }
  const energy = Number.parseFloat(String(v.energyBessMwh))
  const power = Number.parseFloat(String(v.maxPowerBessMw))
  if (!Number.isFinite(energy) || energy <= 0) {
    return 'Battery energy must be a positive number (MWh).'
  }
  if (!Number.isFinite(power) || power <= 0) {
    return 'Max charge/discharge power must be a positive number (MW).'
  }
  const slo = Number.parseFloat(String(v.socLowerPct))
  const sup = Number.parseFloat(String(v.socUpperPct))
  const ret = Number.parseFloat(String(v.returnSocPct))
  const tgt = Number.parseFloat(String(v.targetSocPct))
  if (!Number.isFinite(slo) || slo < 0 || slo > 100) return 'Min SoC must be 0–100%.'
  if (!Number.isFinite(sup) || sup < 0 || sup > 100) return 'Max SoC must be 0–100%.'
  if (!Number.isFinite(ret) || ret < 0 || ret > 100) return 'Return SoC must be 0–100%.'
  if (!Number.isFinite(tgt) || tgt < 0 || tgt > 100) return 'Target SoC must be 0–100%.'
  if (slo >= sup) return 'Min SoC must be less than max SoC.'
  if (ret < slo || ret > sup) return 'Return SoC must be between min and max SoC.'
  if (tgt < slo || tgt > sup) return 'Target SoC must be between min and max SoC.'
  if (!schedule?.rows?.length) return 'Define the vehicle plug-in schedule.'
  return null
}

export function V2gSimulationPage() {
  const navigate = useNavigate()
  const apiBase = useProjectApi()
  const paths = useSolutionPaths()
  const {
    siteImportExportLimitsMw,
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
        const res = await fetch(`${apiBase}/study-inputs`)
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

    setPendingCommitted({
      startDate: v.startDate,
      endDate: v.endDate,
      energyBessMwh: Number.parseFloat(String(v.energyBessMwh)),
      maxPowerBessMw: Number.parseFloat(String(v.maxPowerBessMw)),
      socLowerPct: Number.parseFloat(String(v.socLowerPct)),
      socUpperPct: Number.parseFloat(String(v.socUpperPct)),
      returnSocPct: Number.parseFloat(String(v.returnSocPct)),
      targetSocPct: Number.parseFloat(String(v.targetSocPct)),
      chargingEfficiencyPct: Number.parseFloat(String(v.chargingEfficiencyPct)),
      dischargingEfficiencyPct: Number.parseFloat(String(v.dischargingEfficiencyPct)),
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
      const saveRes = await fetch(`${apiBase}/study-inputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteImportExportLimitsMw,
          v2gSchedule,
          v2gSimulationCommitted: committed,
          simulationName,
        }),
      })
      const saveData = await saveRes.json().catch(() => ({}))
      if (!saveRes.ok || !saveData.ok) {
        setModalTitle('Cannot save inputs')
        setModalMessage(
          typeof saveData.error === 'string'
            ? saveData.error
            : 'Failed to save study_inputs.json.',
        )
        return
      }

      const runRes = await fetch(`${apiBase}/run-bess-optimisation`, {
        method: 'POST',
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
          Set the state of charge when the vehicle returns, the target before it
          leaves, and battery limits. The plug-in schedule is on{' '}
          <strong>V2G schedule</strong>. Added value is versus{' '}
          <strong>plug-and-charge</strong> (charge only to target, no V2G export).
        </p>
      </header>

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
                Battery energy <span className="field__unit">(MWh)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                step="any"
                min={0}
                placeholder="e.g. 60"
                value={v.energyBessMwh}
                onChange={(e) =>
                  patchV2g({ energyBessMwh: parseFloatOrEmpty(e.target.value) })
                }
              />
            </label>
            <label className="field field--stacked">
              <span className="field__label">
                Max charge / discharge <span className="field__unit">(MW)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                step="any"
                min={0}
                placeholder="e.g. 7"
                value={v.maxPowerBessMw}
                onChange={(e) =>
                  patchV2g({ maxPowerBessMw: parseFloatOrEmpty(e.target.value) })
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
                step="any"
                min={0}
                max={100}
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
                step="any"
                min={0}
                max={100}
                value={v.targetSocPct}
                onChange={(e) =>
                  patchV2g({ targetSocPct: parseFloatOrEmpty(e.target.value) })
                }
              />
            </label>
          </div>

          <div className="bess-form__row">
            <label className="field field--stacked">
              <span className="field__label">
                Min SoC <span className="field__unit">(%)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                step="any"
                min={0}
                max={100}
                value={v.socLowerPct}
                onChange={(e) =>
                  patchV2g({ socLowerPct: parseFloatOrEmpty(e.target.value) })
                }
              />
            </label>
            <label className="field field--stacked">
              <span className="field__label">
                Max SoC <span className="field__unit">(%)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                step="any"
                min={0}
                max={100}
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
                Charging efficiency <span className="field__unit">(%)</span>
              </span>
              <input
                className="field__input field__input--sm"
                type="number"
                step="any"
                min={0}
                max={100}
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
                step="any"
                min={0}
                max={100}
                value={v.dischargingEfficiencyPct}
                onChange={(e) =>
                  patchV2g({
                    dischargingEfficiencyPct: parseFloatOrEmpty(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </div>

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
