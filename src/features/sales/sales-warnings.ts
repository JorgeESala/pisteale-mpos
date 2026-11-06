import { formatQty } from '@/features/inventory/inventory-utils'
import type { SaleWarning } from '@/types/database'

export function warningText(warning: SaleWarning) {
  if (warning.type === 'no_recipe') {
    return `${warning.product_name} no tiene receta; no se descontará inventario.`
  }

  if (warning.type === 'cost_pending') {
    return `${warning.product_name} tiene costo pendiente.`
  }

  return `Falta ${formatQty(warning.missing_base, warning.base_unit)} de ${warning.group_name}.`
}
