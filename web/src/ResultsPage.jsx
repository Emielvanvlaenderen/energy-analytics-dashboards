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
import { projectFetch } from './lib/api'
import { formatApiError, parseApiResponse } from './lib/api'
import { useProjectApi } from './useProjectApi'
import { SaveSimulationActions } from './SaveSimulationActions'

/** Same blue as site graph */
const SITE_BLUE = '#2563eb'
const POWER_CHARGED_GREY = '#3f3f46'
const POWER_DISCHARGED_GREY = '#a8a29e'
/** Stacked cumulative added-value (distinct from site blue / price colours) */
const CUM_WHOLESALE = BRAND_ACCENT
const CUM_IMPORT = '#2563eb'
const CUM_EXPORT = '#059669'

function pairTime(tMs, arr) {
  return tMs.map((t, i) => [t, arr[i]])
}

/** Legend: inactive series still show readable labels. */
const legendBase = {
  type: 'plain',
  left: 0,
  itemGap: 18,
  itemWidth: 22,
  itemHeight: 10,
  inactiveColor: '#64748b',
  inactiveBorderColor: 'transparent',
  textStyle: {
    fontSize: 12,
  },
  selectedMode: true,
}

/** Site without BESS (blue) = site_MW; site with BESS (accent) = site_MW + action. */
function buildSiteOption(seriesPayload) {
  if (!seriesPayload) return null
  const { tMs, siteMw, action } = seriesPayload
  const siteWithBess = tMs.map((_, i) => siteMw[i] + action[i])

  return {
    animation: false,
    color: [SITE_BLUE, BRAND_ACCENT],
    legend: {
      ...legendBase,
      top: 8,
      formatter: (name) => name,
    },
    toolbox: {
      right: 8,
      top: 6,
      iconStyle: { borderColor: 'var(--text-muted, #52525b)' },
      feature: {
        dataZoom: { yAxisIndex: false, title: { zoom: 'Zoom', back: 'Reset zoom' } },
        restore: { title: 'Reset' },
      },
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
    ],
    grid: {
      left: 52,
      right: 20,
      top: 52,
      bottom: 48,
      containLabel: false,
    },
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
      nameTextStyle: { color: 'var(--text-muted, #52525b)', padding: [0, 0, 0, -8] },
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: {
        lineStyle: { type: 'dashed', color: 'var(--border, #e4e4e7)' },
      },
    },
    series: [
      {
        name: 'Site without BESS',
        type: 'line',
        step: 'end',
        showSymbol: false,
        emphasis: { focus: 'series' },
        lineStyle: { width: 2, color: SITE_BLUE },
        itemStyle: { color: SITE_BLUE },
        areaStyle: { color: 'rgba(37, 99, 235, 0.22)' },
        data: pairTime(tMs, siteMw),
      },
      {
        name: 'Site with BESS',
        type: 'line',
        step: 'end',
        showSymbol: false,
        emphasis: { focus: 'series' },
        lineStyle: { width: 2, color: BRAND_ACCENT },
        itemStyle: { color: BRAND_ACCENT },
        areaStyle: { color: 'rgba(27, 67, 50, 0.18)' },
        data: pairTime(tMs, siteWithBess),
      },
    ],
  }
}

/** Power charged (sign flipped vs CSV), discharge (MW), SoC % (right axis, linear + area). */
function buildBatteryStateOption(seriesPayload) {
  if (!seriesPayload) return null
  const { tMs, chargeMw, dischargeMw, socPct } = seriesPayload
  const powerCharged = chargeMw.map((c) => -c)

  return {
    animation: false,
    color: [POWER_CHARGED_GREY, POWER_DISCHARGED_GREY, SITE_BLUE],
    legend: {
      ...legendBase,
      top: 8,
      formatter: (name) => name,
    },
    toolbox: {
      right: 8,
      top: 6,
      iconStyle: { borderColor: 'var(--text-muted, #52525b)' },
      feature: {
        dataZoom: { yAxisIndex: false, title: { zoom: 'Zoom', back: 'Reset zoom' } },
        restore: { title: 'Reset' },
      },
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
    ],
    grid: {
      left: 52,
      right: 56,
      top: 52,
      bottom: 48,
      containLabel: false,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter(params) {
        if (!Array.isArray(params)) return ''
        const lines = [params[0].axisValueLabel]
        for (const p of params) {
          const v = p.value?.[1]
          const n = typeof v === 'number' ? v : Number.parseFloat(v)
          if (p.seriesName === 'SoC') {
            lines.push(`${p.marker}${p.seriesName}: ${Number.isFinite(n) ? n.toFixed(2) : v} %`)
          } else {
            lines.push(
              `${p.marker}${p.seriesName}: ${Number.isFinite(n) ? n.toFixed(4) : v} MW`,
            )
          }
        }
        return lines.join('<br/>')
      },
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: 'Power (MW)',
        position: 'left',
        nameTextStyle: { color: 'var(--text-muted, #52525b)', padding: [0, 0, 0, -8] },
        axisLabel: { color: 'var(--text-muted, #52525b)' },
        splitLine: {
          lineStyle: { type: 'dashed', color: 'var(--border, #e4e4e7)' },
        },
      },
      {
        type: 'value',
        name: 'SoC',
        position: 'right',
        min: 0,
        max: 100,
        nameTextStyle: { color: 'var(--text-muted, #52525b)', padding: [0, -8, 0, 0] },
        axisLabel: {
          color: 'var(--text-muted, #52525b)',
          formatter: '{value} %',
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Power charged',
        type: 'line',
        yAxisIndex: 0,
        step: 'end',
        showSymbol: false,
        emphasis: { focus: 'series' },
        lineStyle: { width: 2, color: POWER_CHARGED_GREY },
        itemStyle: { color: POWER_CHARGED_GREY },
        areaStyle: { color: 'rgba(63, 63, 70, 0.35)' },
        data: pairTime(tMs, powerCharged),
      },
      {
        name: 'Power discharged',
        type: 'line',
        yAxisIndex: 0,
        step: 'end',
        showSymbol: false,
        emphasis: { focus: 'series' },
        lineStyle: { width: 2, color: POWER_DISCHARGED_GREY },
        itemStyle: { color: POWER_DISCHARGED_GREY },
        areaStyle: { color: 'rgba(168, 162, 158, 0.38)' },
        data: pairTime(tMs, dischargeMw),
      },
      {
        name: 'SoC',
        type: 'line',
        yAxisIndex: 1,
        smooth: false,
        showSymbol: false,
        emphasis: { focus: 'series' },
        lineStyle: {
          width: 2,
          type: 'dotted',
          color: SITE_BLUE,
        },
        itemStyle: { color: SITE_BLUE },
        areaStyle: {
          color: 'rgba(37, 99, 235, 0.2)',
        },
        data: pairTime(tMs, socPct),
      },
    ],
  }
}

/** Price: import = day-ahead + import_cost; export = day-ahead − export_cost */
function buildPriceInsightsOption(seriesPayload) {
  if (!seriesPayload) return null
  const { tMs, totalImportPrice, totalExportPrice } = seriesPayload

  return {
    animation: false,
    color: ['#c2410c', '#0369a1'],
    legend: {
      ...legendBase,
      top: 8,
      formatter: (name) => name,
    },
    toolbox: {
      right: 8,
      top: 6,
      iconStyle: { borderColor: 'var(--text-muted, #52525b)' },
      feature: {
        dataZoom: { yAxisIndex: false, title: { zoom: 'Zoom', back: 'Reset zoom' } },
        restore: { title: 'Reset' },
      },
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
    ],
    grid: {
      left: 56,
      right: 20,
      top: 52,
      bottom: 48,
      containLabel: false,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (v) =>
        typeof v === 'number' ? `${v.toFixed(4)} £/MWh` : String(v),
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: '£/MWh',
      nameTextStyle: { color: 'var(--text-muted, #52525b)', padding: [0, 0, 0, -8] },
      axisLabel: { color: 'var(--text-muted, #52525b)' },
      splitLine: {
        lineStyle: { type: 'dashed', color: 'var(--border, #e4e4e7)' },
      },
    },
    series: [
      {
        name: 'Import price (day-ahead + import cost)',
        type: 'line',
        step: 'end',
        showSymbol: false,
        emphasis: { focus: 'series' },
        lineStyle: { width: 2, color: '#c2410c' },
        itemStyle: { color: '#c2410c' },
        areaStyle: { color: 'rgba(194, 65, 12, 0.22)' },
        data: pairTime(tMs, totalImportPrice),
      },
      {
        name: 'Export price (day-ahead − export cost)',
        type: 'line',
        step: 'end',
        showSymbol: false,
        emphasis: { focus: 'series' },
        lineStyle: { width: 2, color: '#0369a1' },
        itemStyle: { color: '#0369a1' },
        areaStyle: { color: 'rgba(3, 105, 161, 0.22)' },
        data: pairTime(tMs, totalExportPrice),
      },
    ],
  }
}

function percentWindowToIndexRange(n, startPct, endPct) {
  if (n <= 0) return { i0: 0, i1: -1 }
  const s = Math.max(0, Math.min(100, startPct))
  const e = Math.max(0, Math.min(100, endPct))
  let i0 = Math.round((s / 100) * (n - 1))
  let i1 = Math.round((e / 100) * (n - 1))
  if (i0 > i1) [i0, i1] = [i1, i0]
  return { i0, i1 }
}

/**
 * Stacked cumulative £ by channel; values reset from index i0 (visible window start).
 * Points outside [i0, i1] are '-' so the line stays aligned with linked time zoom.
 */
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

/** Cumulative added revenue (£): stacked areas; y min 0; cumulatives recomputed from zoom window start. */
function buildCumulativeAddedOption(seriesPayload, startPct = 0, endPct = 100) {
  if (!seriesPayload?.tMs?.length || !seriesPayload?.wholesaleAdded) return null
  const { tMs, wholesaleAdded, importAdded, exportAdded } = seriesPayload
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
    legend: {
      ...legendBase,
      top: 8,
      formatter: (name) => name,
    },
    toolbox: {
      right: 8,
      top: 6,
      iconStyle: { borderColor: 'var(--text-muted, #52525b)' },
      feature: {
        dataZoom: { yAxisIndex: false, title: { zoom: 'Zoom', back: 'Reset zoom' } },
        restore: { title: 'Reset' },
      },
    },
    dataZoom: [
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
    ],
    grid: {
      left: 56,
      right: 20,
      top: 52,
      bottom: 48,
      containLabel: false,
    },
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
      nameTextStyle: { color: 'var(--text-muted, #52525b)', padding: [0, 0, 0, -8] },
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
        emphasis: { focus: 'series' },
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
        emphasis: { focus: 'series' },
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
        emphasis: { focus: 'series' },
        lineStyle: { width: 1.5, color: CUM_EXPORT },
        itemStyle: { color: CUM_EXPORT },
        areaStyle: { color: 'rgba(5, 150, 105, 0.32)' },
        data: dataE,
      },
    ],
  }
}

/** Monthly sums (£) of wholesale / import / export added — stacked bars. */
function buildMonthlyAddedBarOption(monthlyPayload) {
  if (!monthlyPayload?.months?.length) return null
  const { months, wholesale, import: imp, export: exp } = monthlyPayload

  return {
    animation: false,
    color: [CUM_WHOLESALE, CUM_IMPORT, CUM_EXPORT],
    legend: {
      ...legendBase,
      top: 8,
      formatter: (name) => name,
    },
    grid: {
      left: 56,
      right: 20,
      top: 48,
      bottom: 40,
      containLabel: false,
    },
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
      nameTextStyle: { color: 'var(--text-muted, #52525b)', padding: [0, 0, 0, -8] },
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
        emphasis: { focus: 'series' },
        itemStyle: { color: CUM_WHOLESALE },
        data: wholesale,
      },
      {
        name: 'Import added',
        type: 'bar',
        stack: 'month',
        emphasis: { focus: 'series' },
        itemStyle: { color: CUM_IMPORT },
        data: imp,
      },
      {
        name: 'Export added',
        type: 'bar',
        stack: 'month',
        emphasis: { focus: 'series' },
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

export function ResultsPage() {
  const apiBase = useProjectApi()
  const siteEcRef = useRef(null)
  const batteryEcRef = useRef(null)
  const priceEcRef = useRef(null)
  const cumulativeEcRef = useRef(null)

  const [simulations, setSimulations] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedSimulationName, setSelectedSimulationName] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(null)
  /** Window (0–100 %) for recomputing stacked cumulatives; synced via dataZoom events from any chart. */
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
          setSimulations([])
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
          setError('No simulation CSV files in results/.')
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
          setError(
            e instanceof Error ? e.message : 'Could not reach the results API.',
          )
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
          setError(
            formatApiError(res, data, 'Could not load optimisation results.'),
          )
          setPayload(null)
          return
        }
        setPayload(data)
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Could not reach the results API.',
          )
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

  const siteOption = useMemo(
    () => buildSiteOption(payload?.series),
    [payload],
  )

  const batteryOption = useMemo(
    () => buildBatteryStateOption(payload?.series),
    [payload],
  )

  const priceOption = useMemo(
    () => buildPriceInsightsOption(payload?.series),
    [payload],
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

  const monthlyOption = useMemo(
    () => buildMonthlyAddedBarOption(payload?.monthlyAdded),
    [payload],
  )

  const handleCumulativeDataZoom = useCallback((params) => {
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
    () => ({ dataZoom: handleCumulativeDataZoom }),
    [handleCumulativeDataZoom],
  )

  const tryConnectAllCharts = useCallback(() => {
    const a = batteryEcRef.current
    const b = siteEcRef.current
    const c = priceEcRef.current
    const d = cumulativeEcRef.current
    if (!a || !b || !c || !d) return
    try {
      echarts.disconnect(a)
    } catch {
      /* already disconnected */
    }
    echarts.connect([a, b, c, d])
  }, [])

  useEffect(() => {
    return () => {
      const inst = batteryEcRef.current
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
    siteOption &&
    batteryOption &&
    priceOption &&
    cumulativeOption &&
    !loading &&
    !error

  const runsForSelectedName = useMemo(() => {
    if (!selectedSimulationName) return []
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

  function handleSimulationNameChange(name) {
    setSelectedSimulationName(name)
    const g = groups.find((x) => x.simulationName === name)
    const next = g?.runs[0]?.filename ?? null
    setSelectedFile(next)
  }

  return (
    <div className="inputs-page results-page" id="results">
      <header className="page-head">
        <p className="page-head__eyebrow">{BRAND.tagline}</p>
        <h1 className="page-head__title">Results</h1>
      </header>

      <section
        className="panel inputs-panel results-panel"
        aria-labelledby="results-simulation-heading"
      >
        <h2 id="results-simulation-heading" className="panel__title">
          Simulation
        </h2>
        <div className="results-page__sim-pickers">
          <label className="field field--stacked results-page__sim-field">
            <span className="field__label">Simulation name</span>
            <select
              id="results-simulation-name-select"
              className="results-page__select"
              aria-label="Simulation name"
              value={selectedSimulationName ?? ''}
              disabled={loading || groups.length === 0}
              onChange={(e) =>
                handleSimulationNameChange(e.target.value || null)
              }
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
              id="results-simulation-run-select"
              className="results-page__select"
              aria-label="Simulation run parameters"
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
            aria-labelledby="results-timeseries-heading"
          >
            <h2 id="results-timeseries-heading" className="panel__title">
              Timeseries overview
            </h2>
            <div className="results-grid">
              <article
                className="results-grid__cell results-grid__cell--battery"
                aria-labelledby="results-battery-heading"
              >
                <h3 className="results-page__subhead" id="results-battery-heading">
                  Battery operations
                </h3>
                <div className="results-chart-wrap">
                  <ReactEcharts
                    option={batteryOption}
                    style={{ height: 'min(36vh, 380px)', width: '100%' }}
                    notMerge
                    lazyUpdate
                    opts={{ renderer: 'canvas' }}
                    onEvents={chartDataZoomEvents}
                    onChartReady={(inst) => {
                      batteryEcRef.current = inst
                      tryConnectAllCharts()
                    }}
                  />
                </div>
              </article>

              <article
                className="results-grid__cell results-grid__cell--price"
                aria-labelledby="results-price-heading"
              >
                <h3 className="results-page__subhead" id="results-price-heading">
                  Prices (£/MWh)
                </h3>
                <div className="results-chart-wrap">
                  <ReactEcharts
                    option={priceOption}
                    style={{ height: 'min(36vh, 380px)', width: '100%' }}
                    notMerge
                    lazyUpdate
                    opts={{ renderer: 'canvas' }}
                    onEvents={chartDataZoomEvents}
                    onChartReady={(inst) => {
                      priceEcRef.current = inst
                      tryConnectAllCharts()
                    }}
                  />
                </div>
              </article>

              <article
                className="results-grid__cell results-grid__cell--site"
                aria-labelledby="results-site-heading"
              >
                <h3 className="results-page__subhead" id="results-site-heading">
                  Impact site (MW)
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

              <article
                className="results-grid__cell results-grid__cell--cumulative"
                aria-labelledby="results-cumulative-heading"
              >
                <h3 className="results-page__subhead" id="results-cumulative-heading">
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
            </div>
          </section>

          {monthlyOption ? (
            <section
              className="panel inputs-panel results-panel results-page__subsection"
              aria-labelledby="results-monthly-heading"
            >
              <h2 id="results-monthly-heading" className="panel__title">
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
