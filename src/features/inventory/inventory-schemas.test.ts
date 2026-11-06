import { describe, expect, it } from 'vitest'
import {
  closeBottleFormSchema,
  consumeBottleFormSchema,
  inventoryAdjustmentFormSchema,
  inventoryWasteFormSchema,
  openBottleFormSchema,
  purchaseFormSchema,
} from './inventory-schemas'

const itemId = '11111111-1111-4111-8111-111111111111'

describe('purchaseFormSchema', () => {
  it('accepts a valid purchase', () => {
    const result = purchaseFormSchema.safeParse({
      purchaseDate: '2026-11-05',
      supplier: 'Proveedor',
      invoiceRef: 'F-001',
      notes: '',
      items: [{ itemId, qtyPurchase: 2, totalCost: 100 }],
    })

    expect(result.success).toBe(true)
  })

  it('rejects duplicate items', () => {
    const result = purchaseFormSchema.safeParse({
      purchaseDate: '2026-11-05',
      supplier: '',
      invoiceRef: '',
      notes: '',
      items: [
        { itemId, qtyPurchase: 1, totalCost: 50 },
        { itemId, qtyPurchase: 2, totalCost: 100 },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('rejects an empty purchase', () => {
    const result = purchaseFormSchema.safeParse({
      purchaseDate: '2026-11-05',
      supplier: '',
      invoiceRef: '',
      notes: '',
      items: [],
    })

    expect(result.success).toBe(false)
  })
})

describe('inventoryAdjustmentFormSchema', () => {
  it('accepts a valid adjustment', () => {
    const result = inventoryAdjustmentFormSchema.safeParse({
      countedQty: 750,
      notes: 'Conteo físico',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a negative count', () => {
    const result = inventoryAdjustmentFormSchema.safeParse({
      countedQty: -1,
      notes: '',
    })

    expect(result.success).toBe(false)
  })
})

describe('inventoryWasteFormSchema', () => {
  it('accepts a valid waste record', () => {
    const result = inventoryWasteFormSchema.safeParse({
      wasteDate: '2026-11-05',
      itemId,
      qty: 100,
      reason: 'fondo_botella',
      notes: '',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a zero quantity', () => {
    const result = inventoryWasteFormSchema.safeParse({
      wasteDate: '2026-11-05',
      itemId,
      qty: 0,
      reason: 'fondo_botella',
      notes: '',
    })

    expect(result.success).toBe(false)
  })

  it('rejects an invalid reason', () => {
    const result = inventoryWasteFormSchema.safeParse({
      wasteDate: '2026-11-05',
      itemId,
      qty: 10,
      reason: 'otro_motivo',
      notes: '',
    })

    expect(result.success).toBe(false)
  })
})

describe('openBottleFormSchema', () => {
  it('accepts a valid bottle opening', () => {
    const result = openBottleFormSchema.safeParse({
      openingDate: '2026-11-05',
      itemId,
      initialMl: 750,
      notes: '',
    })

    expect(result.success).toBe(true)
  })

  it('rejects zero initial content', () => {
    const result = openBottleFormSchema.safeParse({
      openingDate: '2026-11-05',
      itemId,
      initialMl: 0,
      notes: '',
    })

    expect(result.success).toBe(false)
  })
})

describe('consumeBottleFormSchema', () => {
  it('rejects zero consumption', () => {
    const result = consumeBottleFormSchema.safeParse({
      qtyMl: 0,
      notes: '',
    })

    expect(result.success).toBe(false)
  })
})

describe('closeBottleFormSchema', () => {
  it('rejects a negative leftover', () => {
    const result = closeBottleFormSchema.safeParse({
      leftoverMl: -1,
      notes: '',
    })

    expect(result.success).toBe(false)
  })
})
