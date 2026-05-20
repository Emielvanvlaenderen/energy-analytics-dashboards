import { useEffect, useMemo, useState } from 'react'
import ReactEcharts from 'echarts-for-react'
import { BRAND, BRAND_ACCENT } from './brand'
import {
  findSimulationMeta,
  groupSimulationsByName,
} from './simulationFilename'
import { useProjectApi } from './useProjectApi'

const PLUG_COLOR = '#94a3b8'

function pairTime(tMs, arr) {
  return tMs.map((t, i) => [t, arr[i]])
}

function buildSocOption(series) {
  if (!series) return null
  return {
    animation: false,
    color: [BRAND_ACCENT, PLUG_COLOR],
    legend: { top: 8 },
    grid: { left: 52, right: 20, top: 48, bottom: 48 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: 'SoC %', min: 0, max: 100 },
    series: [
      {
        name: 'V2G optimised',
        type: 'line',
        step: 'end',
        showSymbol: false,
        data: pairTime(series.tMs, series.socPct),
      },
      {
        name: 'Plug-and-charge',
        type: 'line',
        step: 'end',
        showSymbol: false,
        data: pairTime(series.tMs, series.plugplaySoc),
      },
    ],
  }
}

function buildAddedValueOption(series) {
  if (!series) return null
  let cum = 0
  const cumData = series.tMs.map((t, i) => {
    cum += series.totalAdded[i] ?? 0
    return [t, cum]
  })
  return {
    animation: false,
    color: [BRAND_ACCENT],
    grid: { left: 52, right: 20, top: 32, bottom: 48 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: '£' },
    series: [
      {
        name: 'Cumulative added value vs plug-and-charge',
        type: 'line',
        showSymbol: false,
        areaStyle: { opacity: 0.15 },
        data: cumData,
      },
    ],
  }
}

function buildSiteOption(series) {
  if (!series) return null
  const withV2g = series.tMs.map((_, i) => series.siteMw[i] + series.action[i])
  const withPlug = series.tMs.map(
    (_, i) => series.siteMw[i] + series.plugplayAction[i],
  )
  return {
    animation: false,
    color: ['#2563eb', BRAND_ACCENT, PLUG_COLOR],
    legend: { top: 8 },
    grid: { left: 52, right: 20, top: 48, bottom: 48 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: 'MW' },
    series: [
      {
        name: 'Site baseline',
        type: 'line',
        step: 'end',
        showSymbol: false,
        data: pairTime(series.tMs, series.siteMw),
      },
      {
        name: 'With V2G',
        type: 'line',
        step: 'end',
        showSymbol: false,
        data: pairTime(series.tMs, withV2g),
      },
      {
        name: 'Plug-and-charge',
        type: 'line',
        step: 'end',
        showSymbol: false,
        data: pairTime(series.tMs, withPlug),
      },
    ],
  }
}

export function V2gResultsPage() {
  const apiBase = useProjectApi()
  const [simulations, setSimulations] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedSimulationName, setSelectedSimulationName] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const simRes = await fetch(`${apiBase}/bess-simulations`)
        const simData = await simRes.json().catch(() => ({}))
        if (cancelled) return
        if (!simRes.ok || !simData.ok) {
          setError(simData.error || 'Could not list simulations.')
          setLoading(false)
          return
        }
        const list = simData.simulations ?? []
        const grouped =
          simData.groups?.length > 0
            ? simData.groups
            : groupSimulationsByName(list)
        setSimulations(list)
        setGroups(grouped)
        if (!grouped.length) {
          setError('No V2G result CSV files in results/.')
          setLoading(false)
          return
        }
        const file = simData.activeFile || list[0]?.filename || null
        const activeMeta = file ? findSimulationMeta(list, file) : null
        const initialName =
          activeMeta?.simulationName ?? grouped[0]?.simulationName ?? null
        const initialGroup = grouped.find((g) => g.simulationName === initialName)
        const initialFile =
          file && initialGroup?.runs.some((r) => r.filename === file)
            ? file
            : initialGroup?.runs[0]?.filename ?? list[0]?.filename ?? null
        setSelectedSimulationName(initialName)
        setSelectedFile(initialFile)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not reach the API.')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiBase])

  useEffect(() => {
    if (!selectedFile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `${apiBase}/bess-results?file=${encodeURIComponent(selectedFile)}`,
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || !data.ok) {
          setError(data.error || 'Could not load results.')
          setPayload(null)
        } else {
          setPayload(data)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not reach the API.')
          setPayload(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedFile, apiBase])

  const runsForSelectedName = useMemo(() => {
    const g = groups.find((x) => x.simulationName === selectedSimulationName)
    return g?.runs ?? []
  }, [groups, selectedSimulationName])

  const socOption = useMemo(
    () => buildSocOption(payload?.series),
    [payload],
  )
  const addedOption = useMemo(
    () => buildAddedValueOption(payload?.series),
    [payload],
  )
  const siteOption = useMemo(
    () => buildSiteOption(payload?.series),
    [payload],
  )

  const chartsReady =
    socOption && addedOption && siteOption && !loading && !error

  return (
    <div className="inputs-page results-page" id="v2g-results">
      <header className="page-head">
        <p className="page-head__eyebrow">{BRAND.tagline}</p>
        <h1 className="page-head__title">V2G results</h1>
        <p className="page-head__lead">
          Added value is the difference between optimised V2G dispatch and a{' '}
          <strong>plug-and-charge</strong> baseline (charge to target only).
        </p>
      </header>

      <section className="panel inputs-panel results-panel">
        <h2 className="panel__title">Simulation</h2>
        <div className="results-page__sim-pickers">
          <label className="field field--stacked results-page__sim-field">
            <span className="field__label">Simulation name</span>
            <select
              className="results-page__select"
              value={selectedSimulationName ?? ''}
              disabled={loading || groups.length === 0}
              onChange={(e) => {
                const name = e.target.value
                setSelectedSimulationName(name)
                const g = groups.find((x) => x.simulationName === name)
                setSelectedFile(g?.runs[0]?.filename ?? null)
              }}
            >
              {groups.map((g) => (
                <option key={g.simulationName} value={g.simulationName}>
                  {g.simulationName === '(unnamed)'
                    ? 'Previous runs (no name)'
                    : g.simulationName.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--stacked results-page__sim-field">
            <span className="field__label">Run (parameters)</span>
            <select
              className="results-page__select"
              value={selectedFile ?? ''}
              disabled={loading || runsForSelectedName.length === 0}
              onChange={(e) => setSelectedFile(e.target.value || null)}
            >
              {runsForSelectedName.map((s) => (
                <option key={s.filename} value={s.filename}>
                  {s.parametersDisplay ?? s.parametersLabel ?? s.filename}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <p className="continue-section__error" role="alert">
          {error}
        </p>
      ) : null}

      {chartsReady ? (
        <section className="panel inputs-panel results-panel">
          <h2 className="panel__title">Charts</h2>
          <div className="results-grid">
            <div className="results-grid__cell">
              <h3 className="results-page__subhead">State of charge</h3>
              <div className="results-chart-wrap">
                <ReactEcharts option={socOption} style={{ height: 280 }} />
              </div>
            </div>
            <div className="results-grid__cell">
              <h3 className="results-page__subhead">Added value (cumulative)</h3>
              <div className="results-chart-wrap">
                <ReactEcharts option={addedOption} style={{ height: 280 }} />
              </div>
            </div>
            <div className="results-grid__cell results-grid__cell--full">
              <h3 className="results-page__subhead">Site import / export</h3>
              <div className="results-chart-wrap">
                <ReactEcharts option={siteOption} style={{ height: 280 }} />
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
