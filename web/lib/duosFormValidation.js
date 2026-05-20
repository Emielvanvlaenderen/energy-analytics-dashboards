/**
 * Shared checks (browser + API):
 * - All charge fields must be filled with valid numbers.
 * - Import non-energy and each Import DUoS must be > 0.
 * - Each Export DUoS must be < 0.
 */
export function validateDuosChargesForm({ importNonEnergy, duos }) {
  const missing = (label) => ({
    ok: false,
    message: `Please complete all required fields. Missing or invalid: ${label}.`,
  })

  if (
    importNonEnergy === '' ||
    importNonEnergy === null ||
    importNonEnergy === undefined
  ) {
    return missing('Import non-energy')
  }
  const ne = Number.parseFloat(String(importNonEnergy).trim())
  if (!Number.isFinite(ne)) {
    return {
      ok: false,
      message: 'Import non-energy must be a valid number.',
    }
  }
  if (ne <= 0) {
    return {
      ok: false,
      message:
        'Import non-energy must be a positive number (greater than zero).',
    }
  }

  for (const c of ['green', 'amber', 'red']) {
    const rawI = duos[c]?.import
    const rawE = duos[c]?.export
    const labelI = `Import DUoS (${c})`
    const labelE = `Export DUoS (${c})`

    if (rawI === '' || rawI === null || rawI === undefined) {
      return missing(labelI)
    }
    if (rawE === '' || rawE === null || rawE === undefined) {
      return missing(labelE)
    }

    const im = Number.parseFloat(String(rawI).trim())
    const ex = Number.parseFloat(String(rawE).trim())
    if (!Number.isFinite(im)) {
      return { ok: false, message: `${labelI} must be a valid number.` }
    }
    if (!Number.isFinite(ex)) {
      return { ok: false, message: `${labelE} must be a valid number.` }
    }
    if (im <= 0) {
      return {
        ok: false,
        message: `${labelI} must be a positive number (greater than zero).`,
      }
    }
    if (ex >= 0) {
      return {
        ok: false,
        message: `${labelE} must be a negative number (less than zero).`,
      }
    }
  }

  return { ok: true }
}
