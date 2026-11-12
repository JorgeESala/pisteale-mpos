import { describe, expect, it } from 'vitest'
import { eventEndDate, eventEndsNextDay, formatEventSchedule } from './event-datetime'

const base = {
  event_date: '2026-11-14',
  start_time: '17:00:00',
  end_time: '22:00:00',
}

describe('event datetime', () => {
  it('formats a same-day event', () => {
    expect(formatEventSchedule(base)).toBe('14 nov 2026 · 17:00 a 22:00')
    expect(eventEndsNextDay(base)).toBe(false)
    expect(eventEndDate(base)).toBe('2026-11-14')
  })

  it('formats an event that crosses midnight', () => {
    const event = { ...base, end_time: '04:00:00' }

    expect(eventEndsNextDay(event)).toBe(true)
    expect(eventEndDate(event)).toBe('2026-11-15')
    expect(formatEventSchedule(event)).toBe('14 nov 2026 · 17:00 a 15 nov 2026 · 04:00')
  })

  it('handles a month boundary', () => {
    expect(
      eventEndDate({
        event_date: '2026-11-30',
        start_time: '17:00:00',
        end_time: '04:00:00',
      }),
    ).toBe('2026-12-01')
  })

  it('handles missing times', () => {
    expect(eventEndsNextDay({ ...base, start_time: null })).toBe(false)
    expect(eventEndsNextDay({ ...base, end_time: null })).toBe(false)
    expect(
      formatEventSchedule({ event_date: '2026-11-14', start_time: null, end_time: null }),
    ).toBe('14 nov 2026')
  })
})
