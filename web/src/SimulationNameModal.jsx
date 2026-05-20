import { useEffect, useId, useState } from 'react'

export function SimulationNameModal({
  open,
  defaultName = '',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const inputId = useId()
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setName(defaultName)
      setError(null)
    }
  }, [open, defaultName])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, loading, onCancel])

  if (!open) return null

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name for this simulation.')
      return
    }
    if (trimmed.length > 64) {
      setError('Name must be 64 characters or fewer.')
      return
    }
    setError(null)
    onConfirm(trimmed)
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={loading ? undefined : onCancel}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sim-name-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sim-name-modal-title" className="modal-dialog__title">
          Name this simulation
        </h2>
        <p className="modal-dialog__body">
          Results are saved under this name, followed by the BESS parameters
          (dates, capacity, efficiency, and so on). Use the same name when you
          want to compare runs with different settings.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="field field--stacked modal-dialog__field" htmlFor={inputId}>
            <span className="field__label">Simulation name</span>
            <input
              id={inputId}
              className="field__input"
              type="text"
              autoComplete="off"
              autoFocus
              disabled={loading}
              placeholder="e.g. Base case"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
            />
          </label>
          {error ? (
            <p className="modal-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="modal-dialog__actions modal-dialog__actions--split">
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={loading}
            >
              {loading ? 'Running optimisation…' : 'Run simulation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
