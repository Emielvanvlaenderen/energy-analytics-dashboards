import { useEffect } from 'react'

export function AlertModal({ title = 'Check your inputs', message, onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [message, onClose])

  if (!message) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
        aria-describedby="alert-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="alert-modal-title" className="modal-dialog__title">
          {title}
        </h2>
        <p id="alert-modal-desc" className="modal-dialog__body">
          {message}
        </p>
        <div className="modal-dialog__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onClose}
            autoFocus
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
