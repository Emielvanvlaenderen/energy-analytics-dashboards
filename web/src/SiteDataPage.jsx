import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectApi } from './useProjectApi'
import { useSolutionPaths } from './useSolutionPaths'
import { AlertModal } from './AlertModal'
import { BRAND } from './brand'
import { useStudyInputs } from './StudyInputsContext'
import { SiteDataUploadHint } from './SiteDataUploadHint'

function parseFloatOrEmpty(raw) {
  if (raw === '' || raw === '-' || raw === '.') return ''
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : ''
}

export function SiteDataPage() {
  const navigate = useNavigate()
  const apiBase = useProjectApi()
  const paths = useSolutionPaths()
  const {
    setSiteImportExportLimitsMw,
    siteDataForm,
    setSiteDataForm,
    siteImportExportLimitsMw,
  } = useStudyInputs()

  const consumptionChoice = siteDataForm.consumptionChoice
  const pvChoice = siteDataForm.pvChoice
  const otherChoice = siteDataForm.otherChoice
  const powerMw = siteDataForm.powerMw
  const pvInstalledMw = siteDataForm.pvInstalledMw

  const setConsumptionChoice = (v) =>
    setSiteDataForm((s) => ({ ...s, consumptionChoice: v }))
  const setPvChoice = (v) => setSiteDataForm((s) => ({ ...s, pvChoice: v }))
  const setOtherChoice = (v) =>
    setSiteDataForm((s) => ({ ...s, otherChoice: v }))
  const setPowerMw = (v) => setSiteDataForm((s) => ({ ...s, powerMw: v }))
  const setPvInstalledMw = (v) =>
    setSiteDataForm((s) => ({ ...s, pvInstalledMw: v }))

  const [consumptionLoading, setConsumptionLoading] = useState(false)
  const [consumptionError, setConsumptionError] = useState(null)
  const [consumptionCsvReady, setConsumptionCsvReady] = useState(false)

  const [pvLoading, setPvLoading] = useState(false)
  const [pvError, setPvError] = useState(null)
  const [pvCsvReady, setPvCsvReady] = useState(false)

  const [maxImportMw, setMaxImportMw] = useState('')
  const [maxExportMw, setMaxExportMw] = useState('')

  const [successModalMessage, setSuccessModalMessage] = useState(null)
  const [bessBlockerMessage, setBessBlockerMessage] = useState(null)

  const consumptionFileRef = useRef(null)
  const pvFileRef = useRef(null)
  const otherFileRef = useRef(null)

  useEffect(() => {
    if (siteImportExportLimitsMw != null) {
      setMaxImportMw(siteImportExportLimitsMw.maxImportMw)
      setMaxExportMw(siteImportExportLimitsMw.maxExportMw)
    }
  }, [siteImportExportLimitsMw])

  useEffect(() => {
    if (consumptionChoice !== 'yes') setConsumptionCsvReady(false)
  }, [consumptionChoice])

  useEffect(() => {
    if (pvChoice !== 'yes') setPvCsvReady(false)
  }, [pvChoice])

  async function handleGenerateConsumptionConstant() {
    setConsumptionError(null)
    setSuccessModalMessage(null)
    const n = Number.parseFloat(String(powerMw))
    if (!Number.isFinite(n) || n <= 0) {
      setConsumptionError('Enter a positive power value in MW.')
      return
    }

    setConsumptionLoading(true)
    try {
      const res = await fetch(`${apiBase}/site-data/consumption-constant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ powerMw: n }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || res.statusText || 'Could not generate CSV')
      }
      setConsumptionCsvReady(true)
      setSuccessModalMessage('Timeseries successfully generated.')
    } catch (e) {
      setConsumptionError(
        e instanceof Error
          ? e.message
          : 'Failed to reach the server. Run `npm run dev` so the API is available.',
      )
    } finally {
      setConsumptionLoading(false)
    }
  }

  async function handleGeneratePvSynthetic() {
    setPvError(null)
    setSuccessModalMessage(null)
    const n = Number.parseFloat(String(pvInstalledMw))
    if (!Number.isFinite(n) || n <= 0) {
      setPvError('Enter a positive installed capacity in MW.')
      return
    }

    setPvLoading(true)
    try {
      const res = await fetch(`${apiBase}/site-data/pv-synthetic-from-yield`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installedMw: n }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || res.statusText || 'Could not generate CSV')
      }
      setPvCsvReady(true)
      setSuccessModalMessage('Timeseries successfully generated.')
    } catch (e) {
      setPvError(
        e instanceof Error
          ? e.message
          : 'Failed to reach the server. Run `npm run dev` so the API is available.',
      )
    } finally {
      setPvLoading(false)
    }
  }

  function validateContinueToBess() {
    if (
      consumptionChoice == null ||
      pvChoice == null ||
      otherChoice == null
    ) {
      return 'Please answer Yes or No for site consumption, PV generation, and other generation.'
    }

    const maxIn = Number.parseFloat(String(maxImportMw))
    const maxEx = Number.parseFloat(String(maxExportMw))
    if (!Number.isFinite(maxIn) || maxIn <= 0) {
      return 'Enter a positive maximum site import (MW).'
    }
    if (!Number.isFinite(maxEx) || maxEx <= 0) {
      return 'Enter a positive maximum site export (MW).'
    }

    if (consumptionChoice === 'yes') {
      const hasFile = (consumptionFileRef.current?.files?.length ?? 0) > 0
      if (!hasFile && !consumptionCsvReady) {
        return 'Site consumption is Yes: upload a CSV file or generate a timeseries CSV.'
      }
    }

    if (pvChoice === 'yes') {
      const hasFile = (pvFileRef.current?.files?.length ?? 0) > 0
      if (!hasFile && !pvCsvReady) {
        return 'PV generation is Yes: upload a CSV file or generate a timeseries CSV.'
      }
    }

    if (otherChoice === 'yes') {
      const hasFile = (otherFileRef.current?.files?.length ?? 0) > 0
      if (!hasFile) {
        return 'Other generation is Yes: upload a CSV file.'
      }
    }

    return null
  }

  async function handleContinueToBess() {
    setBessBlockerMessage(null)
    const err = validateContinueToBess()
    if (err) {
      setBessBlockerMessage(err)
      return
    }

    const maxIn = Number.parseFloat(String(maxImportMw))
    const maxEx = Number.parseFloat(String(maxExportMw))
    try {
      const saveRes = await fetch(`${apiBase}/study-inputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteImportExportLimitsMw: { maxImportMw: maxIn, maxExportMw: maxEx },
          siteDataForm: {
            consumptionChoice,
            pvChoice,
            otherChoice,
            powerMw,
            pvInstalledMw,
          },
        }),
      })
      const saveData = await saveRes.json().catch(() => ({}))
      if (!saveRes.ok || !saveData.ok) {
        setBessBlockerMessage(
          typeof saveData.error === 'string'
            ? saveData.error
            : 'Could not save site data to study_inputs.json.',
        )
        return
      }
    } catch (e) {
      setBessBlockerMessage(
        e instanceof Error
          ? e.message
          : 'Could not reach the server. Run `npm run dev` so the API is available.',
      )
      return
    }

    setSiteImportExportLimitsMw({
      maxImportMw: maxIn,
      maxExportMw: maxEx,
    })
    navigate(paths.afterSiteData)
  }

  return (
    <div className="inputs-page" id="site-data">
      <AlertModal
        title="Success"
        message={successModalMessage}
        onClose={() => setSuccessModalMessage(null)}
      />
      <AlertModal
        title="Cannot continue"
        message={bessBlockerMessage}
        onClose={() => setBessBlockerMessage(null)}
      />

      <header className="page-head">
        <p className="page-head__eyebrow">{BRAND.tagline}</p>
        <h1 id="site-data-title" className="page-head__title">
          Site data
        </h1>
        <p className="page-head__lead">
          Half-hourly profiles (MW) from 2024 through the last completed
          half-hour: upload CSVs where you have data, or generate synthetic
          series where supported.
        </p>
      </header>

      <div className="site-data-grid site-data-grid--three">
        <section
          className="panel panel--compact panel--consumption-highlight"
          aria-labelledby="consumption-heading"
        >
          <h2 id="consumption-heading" className="panel__title">
            Site consumption
          </h2>
          <p className="panel__hint">
            Do you have site power consumption data?
          </p>
          <div
            className="consumption-choice"
            role="radiogroup"
            aria-label="Site consumption data available"
          >
            <label className="consumption-choice__opt">
              <input
                type="radio"
                name="consumption"
                checked={consumptionChoice === 'yes'}
                onChange={() => setConsumptionChoice('yes')}
              />
              <span>Yes</span>
            </label>
            <label className="consumption-choice__opt">
              <input
                type="radio"
                name="consumption"
                checked={consumptionChoice === 'no'}
                onChange={() => setConsumptionChoice('no')}
              />
              <span>No</span>
            </label>
          </div>

          {consumptionChoice === 'yes' ? (
            <div className="consumption-yes">
              <SiteDataUploadHint kind="consumption" />
              <label className="field field--stacked">
                <span className="field__label">
                  Half-hourly data profile{' '}
                  <span className="field__unit">(MW)</span>
                </span>
                <input
                  ref={consumptionFileRef}
                  className="field__input field__input--sm"
                  type="file"
                  accept=".csv,text/csv"
                />
              </label>

              <div className="consumption-synthetic">
                <p className="panel__hint">
                  Or generate a flat half-hourly series (same power every
                  interval). Writes <kbd>site_consumption_constant_mw.csv</kbd>{' '}
                  in the data folder.
                </p>
                <label className="field field--stacked">
                  <span className="field__label">
                    Synthetic constant{' '}
                    <span className="field__unit">(MW)</span>
                  </span>
                  <input
                    className="field__input field__input--sm"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    placeholder="e.g. 1"
                    value={powerMw}
                    onChange={(e) =>
                      setPowerMw(parseFloatOrEmpty(e.target.value))
                    }
                  />
                </label>
                {consumptionError ? (
                  <p className="continue-section__error" role="alert">
                    {consumptionError}
                  </p>
                ) : null}
                <div className="page-actions page-actions--solo">
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={consumptionLoading}
                    onClick={handleGenerateConsumptionConstant}
                  >
                    {consumptionLoading ? 'Generating…' : 'Generate timeseries CSV'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {consumptionChoice === 'no' ? (
            <p className="panel__hint">No consumption file will be attached.</p>
          ) : null}
        </section>

        <section className="panel panel--compact" aria-labelledby="pv-heading">
          <h2 id="pv-heading" className="panel__title">
            PV generation
          </h2>
          <p className="panel__hint">Do you have PV generation data?</p>
          <div
            className="consumption-choice"
            role="radiogroup"
            aria-label="PV generation data available"
          >
            <label className="consumption-choice__opt">
              <input
                type="radio"
                name="pv"
                checked={pvChoice === 'yes'}
                onChange={() => setPvChoice('yes')}
              />
              <span>Yes</span>
            </label>
            <label className="consumption-choice__opt">
              <input
                type="radio"
                name="pv"
                checked={pvChoice === 'no'}
                onChange={() => setPvChoice('no')}
              />
              <span>No</span>
            </label>
          </div>

          {pvChoice === 'yes' ? (
            <div className="consumption-yes">
              <SiteDataUploadHint kind="pv" />
              <label className="field field--stacked">
                <span className="field__label">
                  Half-hourly data profile{' '}
                  <span className="field__unit">(MW)</span>
                </span>
                <input
                  ref={pvFileRef}
                  className="field__input field__input--sm"
                  type="file"
                  accept=".csv,text/csv"
                />
              </label>

              <p className="site-data-or">or</p>

              <div className="consumption-synthetic">
                <p className="panel__hint">
                  Or generate a synthetic half-hourly series based on UK PV yield.
                  Writes <kbd>site_pv_generation_synthetic_mw.csv</kbd> in the
                  data folder.
                </p>
                <label className="field field--stacked">
                  <span className="field__label">
                    Installed capacity{' '}
                    <span className="field__unit">(MW)</span>
                  </span>
                  <input
                    className="field__input field__input--sm"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    placeholder="e.g. 5"
                    value={pvInstalledMw}
                    onChange={(e) =>
                      setPvInstalledMw(parseFloatOrEmpty(e.target.value))
                    }
                  />
                </label>
                {pvError ? (
                  <p className="continue-section__error" role="alert">
                    {pvError}
                  </p>
                ) : null}
                <div className="page-actions page-actions--solo">
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={pvLoading}
                    onClick={handleGeneratePvSynthetic}
                  >
                    {pvLoading ? 'Generating…' : 'Generate timeseries CSV'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {pvChoice === 'no' ? (
            <p className="panel__hint">No PV generation file will be attached.</p>
          ) : null}
        </section>

        <section
          className="panel panel--compact"
          aria-labelledby="other-heading"
        >
          <h2 id="other-heading" className="panel__title">
            Other generation
          </h2>
          <p className="panel__hint">
            Do you have other generation (e.g. wind, CHP) to include?
          </p>
          <div
            className="consumption-choice"
            role="radiogroup"
            aria-label="Other generation data available"
          >
            <label className="consumption-choice__opt">
              <input
                type="radio"
                name="other"
                checked={otherChoice === 'yes'}
                onChange={() => setOtherChoice('yes')}
              />
              <span>Yes</span>
            </label>
            <label className="consumption-choice__opt">
              <input
                type="radio"
                name="other"
                checked={otherChoice === 'no'}
                onChange={() => setOtherChoice('no')}
              />
              <span>No</span>
            </label>
          </div>

          {otherChoice === 'yes' ? (
            <>
              <SiteDataUploadHint kind="other" />
              <label className="field field--stacked">
              <span className="field__label">
                Half-hourly data profile{' '}
                <span className="field__unit">(MW)</span>
              </span>
              <input
                ref={otherFileRef}
                className="field__input field__input--sm"
                type="file"
                accept=".csv,text/csv"
              />
            </label>
            </>
          ) : null}

          {otherChoice === 'no' ? (
            <p className="panel__hint">
              No other generation file will be attached.
            </p>
          ) : null}
        </section>
      </div>

      <section
        className="panel inputs-panel site-data-limits"
        aria-labelledby="site-limits-heading"
      >
        <h2 id="site-limits-heading" className="inputs-subsection__subtitle">
          Site import / export limits
        </h2>
        <p className="panel__hint">
          Maximum power at the site connection for import from and export to the
          network. These values are stored for the optimisation step.
        </p>
        <div className="site-data-limits__row">
          <label className="field field--stacked site-data-limits__field">
            <span className="field__label">
              Maximum site import <span className="field__unit">(MW)</span>
            </span>
            <input
              className="field__input field__input--sm"
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="e.g. 10"
              value={maxImportMw}
              onChange={(e) => setMaxImportMw(parseFloatOrEmpty(e.target.value))}
            />
          </label>
          <label className="field field--stacked site-data-limits__field">
            <span className="field__label">
              Maximum site export <span className="field__unit">(MW)</span>
            </span>
            <input
              className="field__input field__input--sm"
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="e.g. 10"
              value={maxExportMw}
              onChange={(e) => setMaxExportMw(parseFloatOrEmpty(e.target.value))}
            />
          </label>
        </div>
        <div className="continue-section continue-section--site-footer">
          <div className="page-actions">
            <button
              type="button"
              className="btn btn--primary btn--continue"
              onClick={handleContinueToBess}
            >
              Continue
            </button>
          </div>
          <p className="continue-section__note">
            Continues to BESS simulation and saves the import/export limits above
            for optimisation. If consumption or generation is set to Yes, you
            must upload a CSV or use Generate timeseries CSV where available.
          </p>
        </div>
      </section>
    </div>
  )
}
