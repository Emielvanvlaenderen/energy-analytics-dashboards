import { DateTime } from 'luxon'

const ZONE = 'Europe/London'

/** First half-hour row: 2024-01-01 00:00 local. */
export function seriesStartLondon() {
  return DateTime.fromObject({ year: 2024, month: 1, day: 1 }, { zone: ZONE }).startOf(
    'day',
  )
}

/**
 * Start timestamp of the last fully completed 30-minute interval (label = interval start).
 */
export function lastCompletedHalfHourStartLondon() {
  const now = DateTime.now().setZone(ZONE).set({ second: 0, millisecond: 0 })
  const minute = now.minute
  const slotStartMinute = minute < 30 ? 0 : 30
  const currentSlotStart = now.set({ minute: slotStartMinute })
  return currentSlotStart.minus({ minutes: 30 })
}

/** Inclusive end for generated rows; `null` if there is no completed interval on/after series start. */
export function defaultSeriesEndLondon() {
  const end = lastCompletedHalfHourStartLondon()
  const start = seriesStartLondon()
  if (end < start) return null
  return end
}
