import { useCallback, useEffect, useRef, useState } from 'react'

const ROWS = 2
const COLS = 48

export function timeLabel(index) {
  const h = Math.floor(index / 2)
  const m = (index % 2) * 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function emptyMatrix() {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => 'green'),
  )
}

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

/** @returns {'green'|'amber'|'red'|null} */
export function parseBandToken(raw) {
  if (raw == null) return null
  const s = String(raw).trim().toLowerCase()
  if (!s) return null
  if (s === '1' || s === 'g' || s === 'green') return 'green'
  if (s === '2' || s === 'a' || s === 'amber' || s === 'yellow') return 'amber'
  if (s === '3' || s === 'r' || s === 'red') return 'red'
  return null
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
      const band = parseBandToken(part)
      const r = startRow + rowOffset
      const c = startCol + colOffset
      if (r < ROWS && c < COLS && band) next[r][c] = band
      colOffset += 1
    }
    rowOffset += 1
  }
  return next
}

function fillSelection(matrix, sel, band) {
  const next = matrix.map((row) => [...row])
  for (let r = sel.r0; r <= sel.r1; r++) {
    for (let c = sel.c0; c <= sel.c1; c++) {
      next[r][c] = band
    }
  }
  return next
}

function cycleBand(current) {
  if (current === 'green') return 'amber'
  if (current === 'amber') return 'red'
  return 'green'
}

const rowLabels = ['Weekday', 'Weekend']

export function BandMatrix({ matrix, onMatrixChange, timeColumns }) {
  const [sel, setSel] = useState({ r0: 0, c0: 0, r1: 0, c1: 0 })
  /** Keyboard / shift-select anchor (one corner of the selection). */
  const anchorRef = useRef({ r: 0, c: 0 })
  /** Moving corner while dragging or shift+arrows. */
  const activeRef = useRef({ r: 0, c: 0 })
  const dragRef = useRef(null)
  const gridRef = useRef(null)

  const applySelection = useCallback((r0, c0, r1, c1, updateAnchor) => {
    const s = normalizeSelection(r0, c0, r1, c1)
    setSel(s)
    activeRef.current = { r: r1, c: c1 }
    if (updateAnchor) anchorRef.current = { r: r0, c: c0 }
  }, [])

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
    const s = normalizeSelection(dr, dc, r, c)
    setSel(s)
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
    const v = matrix[r][c]
    onMatrixChange((prev) => {
      const next = prev.map((row) => [...row])
      next[r][c] = cycleBand(v)
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
    if (
      e.target?.tagName === 'INPUT' ||
      e.target?.tagName === 'TEXTAREA'
    ) {
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      const text = matrixToTsv(matrix, sel)
      navigator.clipboard.writeText(text).catch(() => {})
      return
    }

    const key = e.key
    if (
      ['g', 'a', 'r', 'G', 'A', 'R'].includes(key) ||
      ['1', '2', '3'].includes(key)
    ) {
      e.preventDefault()
      const map = {
        g: 'green',
        G: 'green',
        a: 'amber',
        A: 'amber',
        r: 'red',
        R: 'red',
        '1': 'green',
        '2': 'amber',
        '3': 'red',
      }
      const band = map[key]
      if (band) onMatrixChange((prev) => fillSelection(prev, sel, band))
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

    const dr =
      key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
    const dc =
      key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
    r = Math.max(0, Math.min(ROWS - 1, r + dr))
    c = Math.max(0, Math.min(COLS - 1, c + dc))

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

  const letter = (band) =>
    band === 'green' ? 'G' : band === 'amber' ? 'A' : 'R'

  return (
    <div className="band-matrix-wrap">
      <div className="band-matrix-toolbar">
        <span className="band-matrix-toolbar__hint">
          Select: click, drag, Shift+click · Fill: <kbd>G</kbd> <kbd>A</kbd>{' '}
          <kbd>R</kbd> or <kbd>1</kbd>–<kbd>3</kbd> · Double-click cycles ·
          Copy / paste: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>C</kbd>{' '}
          <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd> (click the grid area first)
        </span>
      </div>
      <div
        ref={gridRef}
        className="matrix-scroll band-matrix-scroll"
        role="grid"
        aria-label="DUoS bands"
        aria-multiselectable="true"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <table className="band-matrix">
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
            {rowLabels.map((label, row) => (
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
                        aria-label={`${label} ${timeColumns[col]}, ${v}`}
                        className={[
                          'band-cell',
                          `band-cell--${v}`,
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
