import * as echarts from 'echarts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactEcharts from 'echarts-for-react'
import { BRAND, BRAND_ACCENT } from './brand'
import {
  buildSavedSimulationName,
  findSimulationMeta,
  formatRunOptionLabel,
  formatSimulationGroupOption,
  groupSimulationsByName,
} from './simulationFilename'
import { formatApiError, parseApiResponse, projectFetch } from './lib/api'
import { useProjectApi } from './useProjectApi'
import { SaveSimulationActions } from './SaveSimulationActions'

const PLUG_COLOR = '#94a3b8'
const SITE_BLUE = '#2563eb'
const CUM_WHOLESALE = BRAND_ACCENT
const CUM_IMPORT = '#2563eb'
const CUM_EXPORT = '#059669'

const legendBase = {
  type: 'plain',
  left: 0,
  itemGap: 18,
  itemWidth: 22,
  itemHeight: 10,
  inactiveColor: '#64748b',
  inactiveBorderColor: 'transparent',
  textStyle: { fontSize: 12 },
}

const CHART_ZOOM_TOOLBOX = {
  toolbox: {
    right: 8,
    top: 6,
    iconStyle: { borderColor: 'var(--text-muted, #52525b)' },
    feature: {
      dataZoom: {
        yAxisIndex: false,
        title: { zoom: 'Zoom', back: 'Reset zoom' },
      },
      restore: { title: 'Reset' },
    },
  },
}

function dataZoomInside(startPct = 0, endPct = 100) {
  return [
    {
      type: 'inside',
      xAxisIndex: 0,
      filterMode: 'none',
      zoomOnMouseWheel: true,
      moveOnMouseMove: true,
      moveOnMouseWheel: false,
      start: startPct,
      end: endPct,
    },
  ]
}

function pairTime(tMs, arr) {
  return tMs.map((t, i) => [t, arr[i]])
}

function percentWindowToIndexRange(n, startPct, endPct) {
  const s = Math.max(0, Math.min(100, startPct))
  const e = Math.max(0, Math.min(100, endPct))
  let i0 = Math.round((s / 100) * (n - 1))
  let i1 = Math.round((e / 100) * (n - 1))
  if (i0 > i1) [i0, i1] = [i1, i0]
  return { i0, i1 }
}

function buildCumulativeStackedSeries(
  tMs,
  wholesaleAdded,
  importAdded,
  exportAdded,
  startPct,
  endPct,
) {
  const n = tMs.length
  const { i0, i1 } = percentWindowToIndexRange(n, startPct, endPct)
  const dataW = []
  const dataI = []
  const dataE = []
  let cw = 0
  let ci = 0
  let ce = 0
  for (let i = 0; i < n; i++) {
    const t = tMs[i]
    if (i < i0 || i > i1) {
      dataW.push([t, '-'])
      dataI.push([t, '-'])
      dataE.push([t, '-'])
      continue
    }
    if (i === i0) {
      cw = 0
      ci = 0
      ce = 0
    }
    const w = Number.isFinite(wholesaleAdded[i]) ? wholesaleAdded[i] : 0
    const im = Number.isFinite(importAdded[i]) ? importAdded[i] : 0
    const ex = Number.isFinite(exportAdded[i]) ? exportAdded[i] : 0
    cw += w
    ci += im
    ce += ex
    dataW.push([t, cw])
    dataI.push([t, ci])
    dataE.push([t, ce])
  }
  return { dataW, dataI, dataE }
}

function buildSocOption(series, startPct = 0, endPct = 100) {
  if (!series) return null
  return {
    animation: false,
    color: [BRAND_ACCENT, PLUG_COLOR],
    legend: { ...legendBase, top: 8 },
    ...CHART_ZOOM_TOOLBOX,
    dataZoom: dataZoomInside(startPct, endPct),
    grid: { left: 52, right: 20, top: 52, bottom: 48 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (v) =>
        typeof v === 'number' ? `${v.toFixed(1)} %` : String(v),
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'SoC %',
      min: 0,
      max: 100,
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: {
        lineStyle: { type: 'dashed', color: 'var(--border, #e4e4e7)' },
      },
    },
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

function buildCumulativeAddedOption(series, startPct = 0, endPct = 100) {
  if (!series?.tMs?.length || !series?.wholesaleAdded) return null
  const { tMs, wholesaleAdded, importAdded, exportAdded } = series
  const { dataW, dataI, dataE } = buildCumulativeStackedSeries(
    tMs,
    wholesaleAdded,
    importAdded,
    exportAdded,
    startPct,
    endPct,
  )

  return {
    animation: false,
    color: [CUM_WHOLESALE, CUM_IMPORT, CUM_EXPORT],
    legend: { ...legendBase, top: 8 },
    ...CHART_ZOOM_TOOLBOX,
    dataZoom: dataZoomInside(startPct, endPct),
    grid: { left: 56, right: 20, top: 52, bottom: 48 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (v) =>
        typeof v === 'number' ? `£${v.toFixed(2)}` : String(v),
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: '£',
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: {
        lineStyle: { type: 'dashed', color: 'var(--border, #e4e4e7)' },
      },
    },
    series: [
      {
        name: 'Wholesale added',
        type: 'line',
        stack: 'added',
        step: 'end',
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.5, color: CUM_WHOLESALE },
        itemStyle: { color: CUM_WHOLESALE },
        areaStyle: { color: 'rgba(27, 67, 50, 0.35)' },
        data: dataW,
      },
      {
        name: 'Import added',
        type: 'line',
        stack: 'added',
        step: 'end',
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.5, color: CUM_IMPORT },
        itemStyle: { color: CUM_IMPORT },
        areaStyle: { color: 'rgba(37, 99, 235, 0.32)' },
        data: dataI,
      },
      {
        name: 'Export added',
        type: 'line',
        stack: 'added',
        step: 'end',
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.5, color: CUM_EXPORT },
        itemStyle: { color: CUM_EXPORT },
        areaStyle: { color: 'rgba(5, 150, 105, 0.32)' },
        data: dataE,
      },
    ],
  }
}

function buildSiteOption(series, startPct = 0, endPct = 100) {
  if (!series) return null
  const withV2g = series.tMs.map((_, i) => series.siteMw[i] + series.action[i])
  const withPlug = series.tMs.map(
    (_, i) => series.siteMw[i] + series.plugplayAction[i],
  )
  return {
    animation: false,
    color: [SITE_BLUE, BRAND_ACCENT, PLUG_COLOR],
    legend: { ...legendBase, top: 8 },
    ...CHART_ZOOM_TOOLBOX,
    dataZoom: dataZoomInside(startPct, endPct),
    grid: { left: 52, right: 20, top: 52, bottom: 48 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (v) =>
        typeof v === 'number' ? `${v.toFixed(4)} MW` : String(v),
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'MW',
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: {
        lineStyle: { type: 'dashed', color: 'var(--border, #e4e4e7)' },
      },
    },
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

function buildMonthlyAddedBarOption(monthlyPayload) {
  if (!monthlyPayload?.months?.length) return null
  const { months, wholesale, import: imp, export: exp } = monthlyPayload

  return {
    animation: false,
    color: [CUM_WHOLESALE, CUM_IMPORT, CUM_EXPORT],
    legend: { ...legendBase, top: 8 },
    grid: { left: 56, right: 20, top: 48, bottom: 40 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) =>
        typeof v === 'number' ? `£${v.toFixed(2)}` : String(v),
    },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: '£',
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: {
        lineStyle: { type: 'dashed', color: 'var(--border, #e4e4e7)' },
      },
    },
    series: [
      {
        name: 'Wholesale added',
        type: 'bar',
        stack: 'month',
        itemStyle: { color: CUM_WHOLESALE },
        data: wholesale,
      },
      {
        name: 'Import added',
        type: 'bar',
        stack: 'month',
        itemStyle: { color: CUM_IMPORT },
        data: imp,
      },
      {
        name: 'Export added',
        type: 'bar',
        stack: 'month',
        itemStyle: { color: CUM_EXPORT },
        data: exp,
      },
    ],
  }
}

function extractDataZoomRange(params) {
  if (params?.batch?.length) {
    const b =
      params.batch.find(
        (x) => typeof x?.start === 'number' || typeof x?.end === 'number',
      ) ?? params.batch[0]
    return {
      start: typeof b.start === 'number' ? b.start : 0,
      end: typeof b.end === 'number' ? b.end : 100,
    }
  }
  if (typeof params?.start === 'number' && typeof params?.end === 'number') {
    return { start: params.start, end: params.end }
  }
  return { start: 0, end: 100 }
}

export function V2gResultsPage() {
  const apiBase = useProjectApi()
  const socEcRef = useRef(null)
  const cumulativeEcRef = useRef(null)
  const siteEcRef = useRef(null)

  const [simulations, setSimulations] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedSimulationName, setSelectedSimulationName] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(null)
  const [cumulativeZoom, setCumulativeZoom] = useState({ start: 0, end: 100 })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const simRes = await projectFetch(`${apiBase}/bess-simulations`)
        const { data: simData } = await parseApiResponse(simRes)
        if (cancelled) return
        if (!simRes.ok || !simData.ok) {
          setError(formatApiError(simRes, simData, 'Could not list simulations.'))
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
        setLoading(false)
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
        const res = await projectFetch(
          `${apiBase}/bess-results?file=${encodeURIComponent(selectedFile)}`,
        )
        const { data } = await parseApiResponse(res)
        if (cancelled) return
        if (!res.ok || !data.ok) {
          setError(formatApiError(res, data, 'Could not load results.'))
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

  useEffect(() => {
    setCumulativeZoom({ start: 0, end: 100 })
  }, [payload?.resultsPath])

  const runsForSelectedName = useMemo(() => {
    const g = groups.find((x) => x.simulationName === selectedSimulationName)
    return g?.runs ?? []
  }, [groups, selectedSimulationName])

  const saveLabel = useMemo(() => {
    const meta = selectedFile ? findSimulationMeta(simulations, selectedFile) : null
    if (!meta) return ''
    return buildSavedSimulationName(
      meta.simulationName,
      meta.parametersDisplay,
      meta.parametersLabel,
    )
  }, [simulations, selectedFile])

  const socOption = useMemo(
    () =>
      buildSocOption(
        payload?.series,
        cumulativeZoom.start,
        cumulativeZoom.end,
      ),
    [payload, cumulativeZoom],
  )

  const cumulativeOption = useMemo(
    () =>
      buildCumulativeAddedOption(
        payload?.series,
        cumulativeZoom.start,
        cumulativeZoom.end,
      ),
    [payload, cumulativeZoom],
  )

  const siteOption = useMemo(
    () =>
      buildSiteOption(
        payload?.series,
        cumulativeZoom.start,
        cumulativeZoom.end,
      ),
    [payload, cumulativeZoom],
  )

  const monthlyOption = useMemo(
    () => buildMonthlyAddedBarOption(payload?.monthlyAdded),
    [payload],
  )

  const handleDataZoom = useCallback((params) => {
    const { start, end } = extractDataZoomRange(params)
    setCumulativeZoom((prev) => {
      if (
        Math.abs(start - prev.start) < 1e-4 &&
        Math.abs(end - prev.end) < 1e-4
      ) {
        return prev
      }
      return { start, end }
    })
  }, [])

  const chartDataZoomEvents = useMemo(
    () => ({ dataZoom: handleDataZoom }),
    [handleDataZoom],
  )

  const tryConnectAllCharts = useCallback(() => {
    const a = socEcRef.current
    const b = cumulativeEcRef.current
    const c = siteEcRef.current
    if (!a || !b || !c) return
    try {
      echarts.disconnect(a)
    } catch {
      /* already disconnected */
    }
    echarts.connect([a, b, c])
  }, [])

  useEffect(() => {
    return () => {
      const inst = socEcRef.current
      if (inst) {
        try {
          echarts.disconnect(inst)
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  const chartsReady =
    socOption && cumulativeOption && siteOption && !loading && !error

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
                  {formatSimulationGroupOption(g)}
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
                  {formatRunOptionLabel(s)}
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
        <>
          <section
            className="panel inputs-panel results-panel results-page__subsection"
            aria-labelledby="v2g-results-timeseries-heading"
          >
            <h2 id="v2g-results-timeseries-heading" className="panel__title">
              Timeseries overview
            </h2>
            <div className="results-grid">
              <article
                className="results-grid__cell"
                aria-labelledby="v2g-results-soc-heading"
              >
                <h3 className="results-page__subhead" id="v2g-results-soc-heading">
                  State of charge
                </h3>
                <div className="results-chart-wrap">
                  <ReactEcharts
                    option={socOption}
                    style={{ height: 'min(36vh, 380px)', width: '100%' }}
                    notMerge
                    lazyUpdate
                    opts={{ renderer: 'canvas' }}
                    onEvents={chartDataZoomEvents}
                    onChartReady={(inst) => {
                      socEcRef.current = inst
                      tryConnectAllCharts()
                    }}
                  />
                </div>
              </article>

              <article
                className="results-grid__cell results-grid__cell--cumulative"
                aria-labelledby="v2g-results-cumulative-heading"
              >
                <h3
                  className="results-page__subhead"
                  id="v2g-results-cumulative-heading"
                >
                  Cumulative added value (£)
                </h3>
                <div className="results-chart-wrap">
                  <ReactEcharts
                    option={cumulativeOption}
                    style={{ height: 'min(36vh, 380px)', width: '100%' }}
                    notMerge
                    lazyUpdate
                    opts={{ renderer: 'canvas' }}
                    onEvents={chartDataZoomEvents}
                    onChartReady={(inst) => {
                      cumulativeEcRef.current = inst
                      tryConnectAllCharts()
                    }}
                  />
                </div>
              </article>

              <article
                className="results-grid__cell results-grid__cell--full"
                aria-labelledby="v2g-results-site-heading"
              >
                <h3 className="results-page__subhead" id="v2g-results-site-heading">
                  Site import / export
                </h3>
                <div className="results-chart-wrap">
                  <ReactEcharts
                    option={siteOption}
                    style={{ height: 'min(36vh, 380px)', width: '100%' }}
                    notMerge
                    lazyUpdate
                    opts={{ renderer: 'canvas' }}
                    onEvents={chartDataZoomEvents}
                    onChartReady={(inst) => {
                      siteEcRef.current = inst
                      tryConnectAllCharts()
                    }}
                  />
                </div>
              </article>
            </div>
          </section>

          {monthlyOption ? (
            <section
              className="panel inputs-panel results-panel results-page__subsection"
              aria-labelledby="v2g-results-monthly-heading"
            >
              <h2 id="v2g-results-monthly-heading" className="panel__title">
                Added value by month
              </h2>
              <div className="results-chart-wrap results-chart-wrap--monthly">
                <ReactEcharts
                  option={monthlyOption}
                  style={{ height: 'min(32vh, 360px)', width: '100%' }}
                  notMerge
                  lazyUpdate
                  opts={{ renderer: 'canvas' }}
                />
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <SaveSimulationActions
        apiBase={apiBase}
        selectedFile={selectedFile}
        saveLabel={saveLabel}
      />
    </div>
  )
}
