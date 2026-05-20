import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertModal } from './AlertModal'
import { V2gScheduleMatrix } from './V2gScheduleMatrix'
import { BRAND } from './brand'
import { useStudyInputs } from './StudyInputsContext'
import { projectFetch } from './lib/api'
import { useProjectApi } from './useProjectApi'
import { useSolutionPaths } from './useSolutionPaths'
import {
  matrixToSchedule,
  scheduleToMatrix,
} from './v2gSchedule'

export function V2gSchedulePage() {
  const navigate = useNavigate()
  const apiBase = useProjectApi()
  const paths = useSolutionPaths()
  const { v2gSchedule, setV2gSchedule } = useStudyInputs()

  const matrix = useMemo(() => scheduleToMatrix(v2gSchedule), [v2gSchedule])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function updateMatrix(updater) {
    setV2gSchedule((prev) => {
      const m = scheduleToMatrix(prev)
      const next = typeof updater === 'function' ? updater(m) : updater
      return matrixToSchedule(next)
    })
  }

  async function handleContinue() {
    setError(null)
    setSaving(true)
    try {
      const saveRes = await projectFetch(`${apiBase}/study-inputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v2gSchedule }),
      })
      const saveData = await saveRes.json().catch(() => ({}))
      if (!saveRes.ok || !saveData.ok) {
        setError(
          typeof saveData.error === 'string'
            ? saveData.error
            : 'Could not save the plug-in schedule.',
        )
        return
      }
      navigate(paths.v2gSimulation)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not reach the server.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inputs-page" id="v2g-schedule">
      <AlertModal
        title="Cannot continue"
        message={error}
        onClose={() => setError(null)}
      />

      <header className="page-head">
        <p className="page-head__eyebrow">{BRAND.tagline}</p>
        <h1 className="page-head__title">V2G schedule</h1>
        <p className="page-head__lead">
          Define when the vehicle is plugged in. Each continuous plugged-in period
          is optimised separately: state of charge resets to the return level on
          arrival and should reach the target before unplugging.
        </p>
      </header>

      <section className="panel inputs-panel">
        <V2gScheduleMatrix matrix={matrix} onMatrixChange={updateMatrix} />
        <div className="continue-section">
          <div className="page-actions">
            <button
              type="button"
              className="btn btn--primary btn--continue"
              disabled={saving}
              onClick={handleContinue}
            >
              {saving ? 'Saving…' : 'Continue'}
            </button>
          </div>
          <p className="continue-section__note">
            Saves the schedule to <code>study_inputs.json</code> and continues to
            V2G simulation.
          </p>
        </div>
      </section>
    </div>
  )
}
