import { describe, expect, it } from 'vitest'
import { csvMoney, toCsv } from './costs-export'

describe('toCsv', () => {
  it('escapes commas and quotes', () => {
    expect(
      toCsv([
        ['Bebida', 'Costo'],
        ['Mojito, especial', '10.50'],
        ['Daiquirí "clásico"', '8.00'],
      ]),
    ).toBe('Bebida,Costo\n"Mojito, especial",10.50\n"Daiquirí ""clásico""",8.00')
  })
})

describe('csvMoney', () => {
  it('formats numbers with two decimals and empties nulls', () => {
    expect(csvMoney(10.5)).toBe('10.50')
    expect(csvMoney(null)).toBe('')
  })
})
