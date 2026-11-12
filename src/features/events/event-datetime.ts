import { formatDate } from '@/features/inventory/inventory-utils'
import type { Event } from '@/types/database'

type EventDateTime = Pick<Event, 'event_date' | 'start_time' | 'end_time'>

export function eventEndsNextDay(event: EventDateTime) {
  if (!event.start_time || !event.end_time) return false

  return event.end_time <= event.start_time
}

export function eventEndDate(event: EventDateTime) {
  if (!eventEndsNextDay(event)) return event.event_date

  const date = new Date(`${event.event_date}T12:00:00`)
  date.setDate(date.getDate() + 1)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function formatEventSchedule(event: EventDateTime) {
  const dateLabel = formatDate(event.event_date)
  const start = event.start_time?.slice(0, 5)
  const end = event.end_time?.slice(0, 5)

  if (!start && !end) return dateLabel
  if (!start) return `${dateLabel} · hasta ${end}`
  if (!end) return `${dateLabel} · ${start}`

  if (!eventEndsNextDay(event)) {
    return `${dateLabel} · ${start} a ${end}`
  }

  return `${dateLabel} · ${start} a ${formatDate(eventEndDate(event))} · ${end}`
}
