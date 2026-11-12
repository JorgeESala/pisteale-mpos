import { describe, expect, it } from 'vitest'
import {
  eventExpenseFormSchema,
  eventFormSchema,
  eventSaleFormSchema,
  localDateTimeToIso,
  localDateTimeValue,
} from './event-schemas'

const eventForm = {
  name: 'Evento en el parque',
  venue: 'Parque central',
  eventDate: '2026-11-14',
  startTime: '17:00',
  endTime: '22:00',
  promotionEnabled: true,
  bundleQty: 2,
  bundlePrice: 180,
  openingCash: 500,
  notes: '',
}

describe('event schemas', () => {
  it('accepts a valid event', () => {
    expect(eventFormSchema.safeParse(eventForm).success).toBe(true)
  })

  it('accepts an event that crosses midnight', () => {
    const result = eventFormSchema.safeParse({ ...eventForm, endTime: '04:00' })

    expect(result.success).toBe(true)
  })

  it('requires at least one sale line', () => {
    const result = eventSaleFormSchema.safeParse({
      items: [],
      applyPromotion: true,
      paymentMethod: 'cash',
      notes: '',
    })

    expect(result.success).toBe(false)
  })

  it('rejects excessive quantities', () => {
    const line = {
      productId: null,
      productName: 'Mojito',
      quantity: 101,
      unitPrice: 100,
      promotionEligible: true,
    }

    expect(
      eventSaleFormSchema.safeParse({
        items: [line],
        applyPromotion: true,
        paymentMethod: 'cash',
        notes: '',
      }).success,
    ).toBe(false)

    expect(
      eventSaleFormSchema.safeParse({
        items: Array.from({ length: 6 }, () => ({ ...line, quantity: 100 })),
        applyPromotion: true,
        paymentMethod: 'cash',
        notes: '',
      }).success,
    ).toBe(false)
  })

  it('validates an expense', () => {
    const result = eventExpenseFormSchema.safeParse({
      category: 'supplies',
      description: 'Hielo y vasos',
      amount: 350,
      paymentMethod: 'cash',
      reference: '',
      spentAt: '2026-11-14T10:30',
      notes: '',
    })

    expect(result.success).toBe(true)
  })

  it('converts datetime-local values to ISO', () => {
    const iso = localDateTimeToIso('2026-11-14T10:30')
    expect(iso).toMatch(/^2026-11-14T/)
  })

  it('creates a datetime-local value from a date', () => {
    expect(localDateTimeValue(new Date('2026-11-14T10:30:00'))).toMatch(/^2026-11-14T\d{2}:30$/)
  })
})
