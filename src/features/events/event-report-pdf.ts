import type { EventExpenseView, EventLeftoverCountView, EventView } from '@/types/database'
import { formatDateTime, formatQty } from '@/features/inventory/inventory-utils'
import { formatCurrency } from '@/lib/format'
import { formatEventSchedule } from './event-datetime'
import { eventPaymentMethodLabels, eventStatusLabels, expenseCategoryLabels } from './event-labels'
import type { EventReport } from './event-reporting'
import type { PendingEventExpense } from './offline-queue'

export type PdfExpense = {
  id: string
  date: string
  description: string
  category: string
  payment: string
  amount: number
  pending: boolean
}

export type PdfInventoryRow = {
  itemName: string
  groupName: string
  quantity: number
  unit: string
  baseUnit: string
  baseQty: number
  unitCost: number
  value: number
}

export type PdfSummaryRow = {
  label: string
  value: number
  kind: 'sale' | 'subtract' | 'add' | 'total'
}

export type EventPdfModel = {
  filename: string
  eventName: string
  eventFolio: string
  eventSchedule: string
  eventVenue: string
  eventStatus: string
  generatedByName: string
  generatedAt: string
  summary: PdfSummaryRow[]
  salesOrigin: string
  warnings: string[]
  paymentRows: Array<{ label: string; sales: number; expenses: number }>
  cashExpected: number
  resultMarginPercent: number | null
  supplyExpenses: PdfExpense[]
  otherExpenses: PdfExpense[]
  inventory: PdfInventoryRow[]
}

export type EventPdfInput = {
  event: EventView
  report: EventReport
  expenses: EventExpenseView[]
  pendingExpenses: PendingEventExpense[]
  leftoverCounts: EventLeftoverCountView[]
  generatedByName: string
  isPartial: boolean
  generatedAt?: string
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

function dateValue(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function expenseFromSaved(expense: EventExpenseView): PdfExpense {
  return {
    id: expense.id,
    date: expense.spent_at,
    description: expense.description,
    category: expenseCategoryLabels[expense.category],
    payment: eventPaymentMethodLabels[expense.payment_method],
    amount: expense.amount,
    pending: false,
  }
}

function expenseFromPending(expense: PendingEventExpense): PdfExpense {
  return {
    id: expense.clientId,
    date: expense.spentAt,
    description: expense.description,
    category: expenseCategoryLabels[expense.category],
    payment: eventPaymentMethodLabels[expense.paymentMethod],
    amount: expense.amount,
    pending: true,
  }
}

export function buildEventPdfModel(input: EventPdfInput): EventPdfModel {
  const { event, report } = input
  const saved = input.expenses.map(expenseFromSaved)
  const pending = input.pendingExpenses.map(expenseFromPending)
  const allExpenses = [...saved, ...pending]
  const supplyExpenses = allExpenses
    .filter((expense) => {
      if (expense.pending) return false
      const source = input.expenses.find((item) => item.id === expense.id)
      return Boolean(source?.inventory_load_id)
    })
    .sort((left, right) => dateValue(right.date) - dateValue(left.date))
  const otherExpenses = allExpenses
    .filter((expense) => {
      if (expense.pending) return true
      const source = input.expenses.find((item) => item.id === expense.id)
      return !source?.inventory_load_id
    })
    .sort((left, right) => dateValue(right.date) - dateValue(left.date))

  const inventory = input.leftoverCounts
    .map((count) => ({
      itemName: count.item_name,
      groupName: count.group_name,
      quantity: count.quantity,
      unit: count.unit,
      baseUnit: count.base_unit,
      baseQty: count.base_qty,
      unitCost: count.unit_cost,
      value: count.value,
    }))
    .sort((left, right) => left.itemName.localeCompare(right.itemName))
  const warnings: string[] = []

  if (report.negativeStockCount > 0) {
    warnings.push(
      `Inventario del sistema con stock negativo en ${report.negativeStockCount} ${
        report.negativeStockCount === 1 ? 'insumo' : 'insumos'
      }: ${formatCurrency(report.negativeStockValue)}. Revisa el conteo manual.`,
    )
  }

  if (!input.report.leftoverCountComplete) {
    warnings.push(
      `Conteo de sobrantes pendiente: ${input.report.leftoverCountedItems} de ${input.report.leftoverItemCount} insumos capturados.`,
    )
  }

  if (input.isPartial) {
    warnings.push('Resultado parcial: el evento sigue abierto o hay movimientos pendientes.')
  }

  const paymentRows = (
    Object.entries(report.paymentBreakdown) as Array<
      [keyof typeof eventPaymentMethodLabels, { sales: number; expenses: number }]
    >
  )
    .map(([method, values]) => ({
      label: eventPaymentMethodLabels[method],
      sales: values.sales,
      expenses: values.expenses,
    }))
    .filter((row) => row.sales !== 0 || row.expenses !== 0)

  return {
    filename: `PISTEALE-${safeFilePart(event.folio)}-${event.event_date}.pdf`,
    eventName: event.name,
    eventFolio: event.folio,
    eventSchedule: formatEventSchedule(event),
    eventVenue: event.venue,
    eventStatus: eventStatusLabels[event.status],
    generatedByName: input.generatedByName,
    generatedAt: input.generatedAt ?? formatDateTime(new Date().toISOString()),
    summary: [
      { label: 'Venta total', value: report.salesTotal, kind: 'sale' },
      { label: 'Gastos de insumos', value: report.supplyExpensesTotal, kind: 'subtract' },
      { label: 'Otros gastos', value: report.otherExpensesTotal, kind: 'subtract' },
      {
        label: 'Costo de producto/insumos sobrante',
        value: report.leftoverInventoryValue,
        kind: 'add',
      },
      { label: 'Ganancia', value: report.resultTotal, kind: 'total' },
    ],
    salesOrigin: `${report.promotionSalesCount} con promoción · ${report.regularSalesCount} sin promoción`,
    warnings,
    paymentRows,
    cashExpected: report.cashExpected,
    resultMarginPercent: report.resultMarginPercent,
    supplyExpenses,
    otherExpenses,
    inventory,
  }
}

function signedValue(value: number, kind: PdfSummaryRow['kind']) {
  if (kind === 'sale') return formatCurrency(value)
  if (kind === 'subtract') return value === 0 ? formatCurrency(0) : `-${formatCurrency(value)}`
  if (kind === 'add') {
    return value < 0 ? `-${formatCurrency(Math.abs(value))}` : `+${formatCurrency(value)}`
  }

  return formatCurrency(value)
}

export async function downloadEventReportPdf(input: EventPdfInput) {
  const model = buildEventPdfModel(input)
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  let y = margin

  function ensureSpace(height: number) {
    if (y + height <= pageHeight - 16) return
    doc.addPage()
    y = margin
  }

  function divider() {
    doc.setDrawColor(220, 220, 225)
    doc.line(margin, y, pageWidth - margin, y)
    y += 4
  }

  function sectionTitle(title: string) {
    ensureSpace(14)
    y += 3
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 25)
    doc.text(title, margin, y)
    y += 2
    divider()
  }

  function labelValue(
    label: string,
    value: string,
    options: { bold?: boolean; color?: [number, number, number] } = {},
  ) {
    ensureSpace(8)
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
    doc.setFontSize(options.bold ? 11 : 10)
    const color = options.color ?? [45, 45, 50]
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(label, margin, y)
    doc.text(value, pageWidth - margin, y, { align: 'right' })
    y += 6
  }

  function eventHeader() {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(20, 20, 25)
    doc.text('PISTEALE', margin, y + 3)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.text('Resumen del evento', pageWidth - margin, y + 2, { align: 'right' })
    y += 9
    divider()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(model.eventName, margin, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(95, 95, 105)
    doc.text(`${model.eventFolio} · ${model.eventSchedule}`, margin, y)
    y += 5
    if (model.eventVenue) {
      doc.text(model.eventVenue, margin, y)
      y += 5
    }
    doc.text(`Estado: ${model.eventStatus}`, margin, y)
    doc.text(
      `Generado por ${model.generatedByName} · ${model.generatedAt}`,
      pageWidth - margin,
      y,
      { align: 'right' },
    )
    y += 6
    doc.setTextColor(45, 45, 50)
  }

  function summarySection() {
    sectionTitle('Resultado del evento')

    for (const row of model.summary) {
      if (row.kind === 'total') {
        y += 1
        doc.setFillColor(250, 204, 21)
        doc.roundedRect(margin, y - 5, contentWidth, 10, 2, 2, 'F')
        labelValue(row.label, signedValue(row.value, row.kind), {
          bold: true,
          color: [20, 20, 25],
        })
        y += 1
        continue
      }

      labelValue(row.label, signedValue(row.value, row.kind), {
        bold: row.kind === 'sale',
        color: row.kind === 'add' && row.value < 0 ? [185, 28, 28] : undefined,
      })

      if (row.kind === 'sale') {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(105, 105, 115)
        doc.text(model.salesOrigin, margin, y - 2)
        y += 3
      }
    }

    for (const warning of model.warnings) {
      ensureSpace(8)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(185, 28, 28)
      doc.text(doc.splitTextToSize(warning, contentWidth), margin, y)
      y += doc.splitTextToSize(warning, contentWidth).length * 4 + 2
    }

    if (model.resultMarginPercent !== null) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(95, 95, 105)
      doc.text(`Margen: ${model.resultMarginPercent}%`, margin, y)
      y += 5
    }
  }

  function paymentSection() {
    sectionTitle('Desglose por método de pago')

    if (model.paymentRows.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(95, 95, 105)
      doc.text('Sin ventas ni gastos registrados.', margin, y)
      y += 7
      return
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(95, 95, 105)
    doc.text('Método', margin, y)
    doc.text('Ventas', pageWidth - margin - 44, y, { align: 'right' })
    doc.text('Gastos', pageWidth - margin, y, { align: 'right' })
    y += 5

    doc.setFont('helvetica', 'normal')
    for (const row of model.paymentRows) {
      ensureSpace(7)
      doc.setFontSize(9)
      doc.setTextColor(45, 45, 50)
      doc.text(row.label, margin, y)
      doc.text(formatCurrency(row.sales), pageWidth - margin - 44, y, { align: 'right' })
      doc.text(formatCurrency(row.expenses), pageWidth - margin, y, { align: 'right' })
      y += 5
    }

    y += 1
    divider()
    labelValue('Efectivo esperado', formatCurrency(model.cashExpected), { bold: true })
  }

  function expenseRows(title: string, rows: PdfExpense[]) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(45, 45, 50)
    ensureSpace(8)
    doc.text(title, margin, y)
    y += 5

    if (rows.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(105, 105, 115)
      doc.text('Sin gastos.', margin, y)
      y += 6
      return
    }

    for (const row of rows) {
      ensureSpace(9)
      const descriptionLines = doc.splitTextToSize(row.description, contentWidth - 48)
      const rowHeight = Math.max(9, descriptionLines.length * 4 + 3)
      ensureSpace(rowHeight)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(45, 45, 50)
      doc.text(descriptionLines, margin, y)
      doc.setFont('helvetica', 'bold')
      doc.text(formatCurrency(row.amount), pageWidth - margin, y, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(105, 105, 115)
      const detail = [formatDateTime(row.date), row.category, row.payment]
        .concat(row.pending ? ['Pendiente'] : [])
        .join(' · ')
      doc.text(detail, margin, y + descriptionLines.length * 3.5 + 1)
      y += rowHeight
    }
  }

  function expensesSection() {
    sectionTitle('Detalle de gastos')
    expenseRows('Gastos de insumos', model.supplyExpenses)
    y += 2
    expenseRows('Otros gastos', model.otherExpenses)
  }

  function inventorySection() {
    sectionTitle('Insumos sobrantes (conteo manual)')

    if (model.inventory.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(95, 95, 105)
      doc.text('Sin insumos sobrantes.', margin, y)
      y += 7
      return
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(95, 95, 105)
    doc.text('Insumo', margin, y)
    doc.text('Cantidad', pageWidth - margin - 50, y, { align: 'right' })
    doc.text('Valor', pageWidth - margin, y, { align: 'right' })
    y += 5

    doc.setFont('helvetica', 'normal')
    for (const row of model.inventory) {
      const itemLines = doc.splitTextToSize(`${row.itemName} · ${row.groupName}`, 90)
      const rowHeight = Math.max(6, itemLines.length * 3.5) + 4
      ensureSpace(rowHeight)
      doc.setFontSize(9)
      doc.setTextColor(45, 45, 50)
      doc.text(itemLines, margin, y)
      doc.text(formatQty(row.quantity, row.unit), pageWidth - margin - 50, y, {
        align: 'right',
      })
      doc.text(formatCurrency(row.value), pageWidth - margin, y, { align: 'right' })
      doc.setFontSize(7)
      doc.setTextColor(105, 105, 115)
      doc.text(
        `Costo: ${formatCurrency(row.unitCost)}/${row.baseUnit}`,
        margin,
        y + itemLines.length * 3.5 + 1,
      )
      y += rowHeight
    }
  }

  function footer() {
    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(120, 120, 130)
      doc.text(`PISTEALE · ${model.eventFolio}`, margin, pageHeight - 8)
      doc.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 8, {
        align: 'right',
      })
    }
  }

  eventHeader()
  summarySection()
  paymentSection()
  expensesSection()
  inventorySection()
  footer()
  doc.save(model.filename)
}
