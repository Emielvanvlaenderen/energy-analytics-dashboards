import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { projectFetch } from './lib/api'
import { useProjectApi } from './useProjectApi'
import { emptyMatrix } from './BandMatrix'
import { defaultV2gSchedule, normalizeV2gSchedule } from './v2gSchedule'
import { v2gBatteryFromCommitted } from './lib/v2gBatteryFields'

const StudyInputsContext = createContext(null)

const emptyDuos = () => ({
  green: { import: '', export: '' },
  amber: { import: '', export: '' },
  red: { import: '', export: '' },
})

function normalizeDuos(d) {
  const base = emptyDuos()
  if (!d || typeof d !== 'object') return base
  for (const c of ['green', 'amber', 'red']) {
    if (d[c] && typeof d[c] === 'object') {
      base[c] = {
        import: d[c].import ?? '',
        export: d[c].export ?? '',
      }
    }
  }
  return base
}

function normalizeBandMatrix(m) {
  if (!Array.isArray(m) || m.length !== 2) return emptyMatrix()
  for (const row of m) {
    if (!Array.isArray(row) || row.length !== 48) return emptyMatrix()
    for (const cell of row) {
      if (!['green', 'amber', 'red'].includes(cell)) return emptyMatrix()
    }
  }
  return m
}

const defaultSiteDataForm = () => ({
  consumptionChoice: null,
  pvChoice: null,
  otherChoice: null,
  powerMw: '',
  pvInstalledMw: '',
})

export function StudyInputsProvider({ children }) {
  const apiBase = useProjectApi()
  const [importNonEnergy, setImportNonEnergy] = useState('')
  const [duos, setDuos] = useState(emptyDuos)
  const [bandMatrix, setBandMatrix] = useState(emptyMatrix)

  /**
   * Maximum site import / export power (MW) for optimisation — set when leaving
   * Site data via Continue to BESS simulation (or loaded from study_inputs.json).
   */
  const [siteImportExportLimitsMw, setSiteImportExportLimitsMw] = useState(null)

  /** Site data page: consumption / PV / other choices and synthetic generation inputs. */
  const [siteDataForm, setSiteDataForm] = useState(defaultSiteDataForm)

  /** BESS simulation / optimisation parameters (edited on BESS simulation page). */
  const [bessSimulationInputs, setBessSimulationInputs] = useState({
    startDate: '',
    endDate: '',
    capacityMw: '',
    durationHours: 2,
    chargingEfficiencyPct: '',
    dischargingEfficiencyPct: '',
    socLowerPct: '',
    socUpperPct: '',
    cyclesPerDayTarget: '',
  })

  /**
   * Normalised BESS parameters committed when the user clicks “Simulate BESS” —
   * use this for optimisation / backend runs.
   */
  const [bessSimulationCommitted, setBessSimulationCommitted] = useState(null)

  const [v2gSchedule, setV2gSchedule] = useState(defaultV2gSchedule)
  const [v2gSimulationInputs, setV2gSimulationInputs] = useState({
    startDate: '',
    endDate: '',
    capacityMw: '',
    durationHours: 2,
    socLowerPct: 20,
    socUpperPct: 90,
    returnSocPct: 30,
    targetSocPct: 90,
    chargingEfficiencyPct: 90,
    dischargingEfficiencyPct: 90,
    simulationType: 'V2G',
  })
  const [v2gSimulationCommitted, setV2gSimulationCommitted] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await projectFetch(`${apiBase}/study-inputs`)
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || !data.ok || !data.study) return
        const s = data.study

        if (s.gridTariffs && typeof s.gridTariffs === 'object') {
          const g = s.gridTariffs
          setImportNonEnergy(
            typeof g.importNonEnergy === 'string'
              ? g.importNonEnergy
              : String(g.importNonEnergy ?? ''),
          )
          setDuos(normalizeDuos(g.duos))
          setBandMatrix(normalizeBandMatrix(g.bandMatrix))
        }

        if (s.siteImportExportLimitsMw && typeof s.siteImportExportLimitsMw === 'object') {
          setSiteImportExportLimitsMw(s.siteImportExportLimitsMw)
        }

        if (s.siteDataForm && typeof s.siteDataForm === 'object') {
          setSiteDataForm((prev) => ({
            ...prev,
            ...s.siteDataForm,
          }))
        }

        if (s.bessSimulationCommitted && typeof s.bessSimulationCommitted === 'object') {
          const b = s.bessSimulationCommitted
          const legacySide =
            b.roundtripEfficiencyPct != null &&
            Number.isFinite(Number(b.roundtripEfficiencyPct))
              ? Math.sqrt(Number(b.roundtripEfficiencyPct) / 100) * 100
              : ''
          const durationHours = [2, 3, 4, 6, 8].includes(Number(b.durationHours))
            ? Number(b.durationHours)
            : 2
          setBessSimulationCommitted(b)
          setBessSimulationInputs({
            startDate: b.startDate ?? '',
            endDate: b.endDate ?? '',
            capacityMw: b.capacityMw ?? '',
            durationHours,
            chargingEfficiencyPct:
              b.chargingEfficiencyPct ?? legacySide ?? '',
            dischargingEfficiencyPct:
              b.dischargingEfficiencyPct ?? legacySide ?? '',
            socLowerPct: b.socLowerPct ?? '',
            socUpperPct: b.socUpperPct ?? '',
            cyclesPerDayTarget: b.cyclesPerDayTarget ?? '',
          })
        }

        if (s.v2gSchedule) {
          setV2gSchedule(normalizeV2gSchedule(s.v2gSchedule))
        }

        if (s.v2gSimulationCommitted && typeof s.v2gSimulationCommitted === 'object') {
          const v = s.v2gSimulationCommitted
          const battery = v2gBatteryFromCommitted(v)
          setV2gSimulationCommitted(v)
          setV2gSimulationInputs({
            startDate: v.startDate ?? '',
            endDate: v.endDate ?? '',
            capacityMw: battery.capacityMw ?? '',
            durationHours: battery.durationHours ?? 2,
            socLowerPct: v.socLowerPct ?? 20,
            socUpperPct: v.socUpperPct ?? 90,
            returnSocPct: v.returnSocPct ?? 30,
            targetSocPct: v.targetSocPct ?? 90,
            chargingEfficiencyPct: v.chargingEfficiencyPct ?? 90,
            dischargingEfficiencyPct: v.dischargingEfficiencyPct ?? 90,
            simulationType: v.simulationType ?? 'V2G',
          })
        }
      } catch {
        /* dev server offline or API unavailable */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiBase])

  const value = useMemo(
    () => ({
      importNonEnergy,
      setImportNonEnergy,
      duos,
      setDuos,
      bandMatrix,
      setBandMatrix,
      siteImportExportLimitsMw,
      setSiteImportExportLimitsMw,
      siteDataForm,
      setSiteDataForm,
      bessSimulationInputs,
      setBessSimulationInputs,
      bessSimulationCommitted,
      setBessSimulationCommitted,
      v2gSchedule,
      setV2gSchedule,
      v2gSimulationInputs,
      setV2gSimulationInputs,
      v2gSimulationCommitted,
      setV2gSimulationCommitted,
    }),
    [
      importNonEnergy,
      duos,
      bandMatrix,
      siteImportExportLimitsMw,
      siteDataForm,
      bessSimulationInputs,
      bessSimulationCommitted,
      v2gSchedule,
      v2gSimulationInputs,
      v2gSimulationCommitted,
    ],
  )

  return (
    <StudyInputsContext.Provider value={value}>
      {children}
    </StudyInputsContext.Provider>
  )
}

export function useStudyInputs() {
  const ctx = useContext(StudyInputsContext)
  if (!ctx) {
    throw new Error('useStudyInputs must be used within StudyInputsProvider')
  }
  return ctx
}
