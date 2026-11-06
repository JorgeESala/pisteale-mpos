import type {
  InventoryMovementType,
  InventoryStockStatus,
  InventoryWasteReason,
} from '@/types/database'

export const movementLabels: Record<InventoryMovementType, string> = {
  purchase: 'Compra',
  adjustment: 'Ajuste',
  opening: 'Inicial',
  consumption: 'Consumo',
  waste: 'Merma',
  transfer: 'Traslado',
}

export const stockStatusLabels: Record<InventoryStockStatus, string> = {
  ok: 'Disponible',
  low: 'Bajo',
  out: 'Agotado',
  no_stock: 'No inventariable',
}

export const wasteReasonLabels: Record<InventoryWasteReason, string> = {
  fondo_botella: 'Fondo de botella',
  producto_vencido: 'Producto vencido',
  derrame: 'Derrame',
  otro: 'Otro',
}

export function formatQty(value: number, unit: string) {
  const formatted = new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 4,
  }).format(value)

  return `${formatted} ${unit}`
}

export function formatDate(value: string | null) {
  if (!value) return ''

  return new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(value: string | null) {
  if (!value) return ''

  return new Date(value).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
