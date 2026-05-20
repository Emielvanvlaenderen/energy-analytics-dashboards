import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  V2G_DAYS,
  V2G_DAY_LABELS,
  V2G_SLOTS,
  parsePlugToken,
  timeLabel,
} from './v2gSchedule'

function normalizeSelection(r0, c0, r1, c1) {
  return {
    r0: Math.min(r0, r1),
    c0: Math.min(c0, c1),
    r1: Math.max(r0, r1),
    c1: Math.max(c0, c1),
  }
}

function selectionSize(sel) {
  return (sel.r1 - sel.r0 + 1) * (sel.c1 - sel.c0 + 1)
}

function matrixToTsv(matrix, sel) {
  const lines = []
  for (let r = sel.r0; r <= sel.r1; r++) {
    const row = []
    for (let c = sel.c0; c <= sel.c1; c++) {
      row.push(matrix[r][c])
    }
    lines.push(row.join('\t'))
  }
  return lines.join('\n')
}

function applyPaste(matrix, text, startRow, startCol) {
  const lines = text.split(/\r?\n/)
  const next = matrix.map((row) => [...row])
  let rowOffset = 0
  for (const line of lines) {
    if (line === '' && rowOffset > 0) continue
    const parts =
      line.includes('\t') || !line.includes(',')
        ? line.split('\t')
        : line.split(',')
    let colOffset = 0
    for (const part of parts) {
      const state = parsePlugToken(part)
      const r = startRow + rowOffset
      const c = startCol + colOffset
      if (r < V2G_DAYS && c < V2G_SLOTS && state) next[r][c] = state
      colOffset += 1
    }
    rowOffset += 1
  }
  return next
}

function fillSelection(matrix, sel, state) {
  const next = matrix.map((row) => [...row])
  for (let r = sel.r0; r <= sel.r1; r++) {
    for (let c = sel.c0; c <= sel.c1; c++) {
      next[r][c] = state
    }
  }
  return next
}

function cyclePlug(current) {
  return current === 'in' ? 'out' : 'in'
}

export function V2gScheduleMatrix({ matrix, onMatrixChange }) {
  const timeColumns = useMemo(
    () => Array.from({ length: V2G_SLOTS }, (_, i) => timeLabel(i)),
    [],
  )

  const [sel, setSel] = useState({ r0: 0, c0: 0, r1: 0, c1: 0 })
  const anchorRef = useRef({ r: 0, c: 0 })
  const activeRef = useRef({ r: 0, c: 0 })
  const dragRef = useRef(null)
  const gridRef = useRef(null)

  const onCellMouseDown = (e, r, c) => {
    e.preventDefault()
    if (e.shiftKey) {
      const s = normalizeSelection(anchorRef.current.r, anchorRef.current.c, r, c)
      setSel(s)
      activeRef.current = { r, c }
      queueMicrotask(() => gridRef.current?.focus())
      return
    }
    anchorRef.current = { r, c }
    activeRef.current = { r, c }
    dragRef.current = { r, c }
    setSel({ r0: r, c0: c, r1: r, c1: c })
    queueMicrotask(() => gridRef.current?.focus())
  }

  const onCellMouseEnter = (r, c) => {
    if (!dragRef.current) return
    const { r: dr, c: dc } = dragRef.current
    setSel(normalizeSelection(dr, dc, r, c))
    activeRef.current = { r, c }
  }

  useEffect(() => {
    const endDrag = () => {
      dragRef.current = null
    }
    window.addEventListener('mouseup', endDrag)
    return () => window.removeEventListener('mouseup', endDrag)
  }, [])

  const onCellDoubleClick = (r, c) => {
    onMatrixChange((prev) => {
      const next = prev.map((row) => [...row])
      next[r][c] = cyclePlug(next[r][c])
      return next
    })
  }

  const handlePasteNative = useCallback(
    (e) => {
      const t = e.clipboardData?.getData('text/plain')
      if (!t) return
      e.preventDefault()
      const { r0, c0 } = sel
      onMatrixChange((prev) => applyPaste(prev, t, r0, c0))
    },
    [sel, onMatrixChange],
  )

  useEffect(() => {
    const paste = (e) => {
      const g = gridRef.current
      if (!g) return
      const el = document.activeElement
      if (el && !g.contains(el)) return
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return
      handlePasteNative(e)
    }
    document.addEventListener('paste', paste)
    return () => document.removeEventListener('paste', paste)
  }, [handlePasteNative])

  const handleKeyDown = (e) => {
    const g = gridRef.current
    if (!g?.contains(e.target) && e.target !== g) return
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') {
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      navigator.clipboard.writeText(matrixToTsv(matrix, sel)).catch(() => {})
      return
    }

    const key = e.key
    if (['i', 'I', 'o', 'O', '1', '0'].includes(key)) {
      e.preventDefault()
      const map = {
        i: 'in',
        I: 'in',
        '1': 'in',
        o: 'out',
        O: 'out',
        '0': 'out',
      }
      const state = map[key]
      if (state) onMatrixChange((prev) => fillSelection(prev, sel, state))
      return
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      return
    }
    e.preventDefault()

    let r = activeRef.current.r
    let c = activeRef.current.c
    if (selectionSize(sel) > 1 && !e.shiftKey) {
      r = sel.r0
      c = sel.c0
    }

    const dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
    const dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
    r = Math.max(0, Math.min(V2G_DAYS - 1, r + dr))
    c = Math.max(0, Math.min(V2G_SLOTS - 1, c + dc))

    if (e.shiftKey) {
      const s = normalizeSelection(anchorRef.current.r, anchorRef.current.c, r, c)
      setSel(s)
      activeRef.current = { r, c }
    } else {
      anchorRef.current = { r, c }
      activeRef.current = { r, c }
      setSel({ r0: r, c0: c, r1: r, c1: c })
    }
  }

  const isSelected = (r, c) =>
    r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1

  const letter = (state) => (state === 'in' ? 'I' : 'O')

  return (
    <div className="band-matrix-wrap v2g-schedule-wrap">
      <div className="band-matrix-toolbar">
        <span className="band-matrix-toolbar__hint">
          Rows = days, columns = half-hours · <strong>In</strong> = plugged in
          (optimise V2G) · <strong>Out</strong> = away · Select: click, drag,
          Shift+click · Fill: <kbd>I</kbd> / <kbd>O</kbd> or <kbd>1</kbd> /{' '}
          <kbd>0</kbd> · Double-click toggles · Copy / paste:{' '}
          <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>C</kbd>{' '}
          <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>
        </span>
      </div>
      <div
        ref={gridRef}
        className="matrix-scroll band-matrix-scroll"
        role="grid"
        aria-label="Vehicle plug-in schedule"
        aria-multiselectable="true"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <table className="band-matrix v2g-schedule-matrix">
          <thead>
            <tr>
              <th className="band-matrix__corner" scope="col" />
              {timeColumns.map((t) => (
                <th key={t} className="band-matrix__time" scope="col">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {V2G_DAY_LABELS.map((label, row) => (
              <tr key={label} role="row">
                <th className="band-matrix__rowhead" scope="row">
                  {label}
                </th>
                {timeColumns.map((_, col) => {
                  const v = matrix[row][col]
                  const selected = isSelected(row, col)
                  return (
                    <td key={col} className="band-matrix__cell" role="presentation">
                      <button
                        type="button"
                        tabIndex={-1}
                        role="gridcell"
                        aria-selected={selected}
                        aria-label={`${label} ${timeColumns[col]}, ${v === 'in' ? 'plugged in' : 'away'}`}
                        className={[
                          'band-cell',
                          'v2g-cell',
                          `v2g-cell--${v}`,
                          selected ? 'band-cell--selected' : '',
                        ].join(' ')}
                        onMouseDown={(e) => onCellMouseDown(e, row, col)}
                        onMouseEnter={() => onCellMouseEnter(row, col)}
                        onDoubleClick={() => onCellDoubleClick(row, col)}
                      >
                        <span className="band-cell__letter">{letter(v)}</span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
