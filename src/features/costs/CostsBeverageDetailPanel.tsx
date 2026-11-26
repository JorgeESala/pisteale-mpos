import { useEffect, useState } from 'react'
import { formatCurrency, formatUnitCost } from '@/lib/format'
import { formatPackagePrice, packagePresentationLabel } from '@/features/catalog/inventory-pricing'
import type { SimulatedProductCost, SimulatedTierDetail } from './simulate-costs'

type CostsBeverageDetailPanelProps = {
  result: SimulatedProductCost
  categoryName: string
  canEdit: boolean
  onClose: () => void
  onGoToPrices: (search: string) => void
  onGoToRecipe: (productId: string) => void
}

const roleLabels = {
  ice: 'Hielo',
  cup: 'Vaso',
  lid: 'Tapa',
  straw: 'Popote',
} as const

function formatQuantity(value: number, unit: string): string {
  const formatted = new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 4,
  }).format(value)

  return `${formatted} ${unit}`
}

function quantityLabel(
  inputQty: number | null,
  inputUnit: string | null,
  qtyBase: number,
  baseUnit: string,
): string {
  const base = formatQuantity(qtyBase, baseUnit)

  if (inputQty === null || inputUnit === null) return base
  if (inputUnit === baseUnit) return base

  return `${formatQuantity(inputQty, inputUnit)} (${base})`
}

function DetailSection({
  result,
  tier,
  canEdit,
  onGoToPrices,
}: {
  result: SimulatedProductCost
  tier: 'normal' | 'premium'
  canEdit: boolean
  onGoToPrices: (search: string) => void
}) {
  const detail: SimulatedTierDetail | null =
    tier === 'premium' ? result.details.premium : result.details.normal

  if (!detail) return null

  const visibleGaps = result.gaps.filter((gap) => gap.tier === undefined || gap.tier === tier)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-[11px] text-neutral-500">Costo total</p>
          <p className="mt-1 text-lg font-semibold">
            {detail.totalCost === null ? 'Pendiente' : formatCurrency(detail.totalCost)}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-[11px] text-neutral-500">Margen</p>
          <p className="mt-1 text-lg font-semibold">
            {detail.margin === null ? '—' : formatCurrency(detail.margin)}
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h3 className="font-semibold">Insumos de la receta</h3>
            <p className="text-[11px] text-neutral-500">
              Precio del paquete, cantidad usada y costo de esa cantidad en la bebida.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {detail.ingredientLines.length === 0 ? (
            <p className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
              Sin receta.
            </p>
          ) : (
            detail.ingredientLines.map((line, index) => (
              <div
                key={`${line.groupId}-${index}`}
                className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-200">
                      {line.itemName ??
                        (line.itemCount === 0
                          ? `${line.groupName} (sin insumos)`
                          : `${line.groupName} (${line.itemCount} marcas)`)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {line.packagePrice !== null &&
                      line.purchaseUnit !== null &&
                      line.purchaseFactor !== null
                        ? `${formatPackagePrice(line.packagePrice)} · ${packagePresentationLabel(
                            line.purchaseUnit,
                            line.purchaseFactor,
                            line.baseUnit,
                          )}`
                        : line.itemCount > 1
                          ? 'Costo de referencia del grupo'
                          : 'Presentación no registrada'}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-semibold">
                    {line.lineCost === null ? '—' : formatCurrency(line.lineCost)}
                  </p>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-neutral-500">
                  <p>
                    Cantidad:{' '}
                    {quantityLabel(line.inputQty, line.inputUnit, line.qtyBase, line.baseUnit)}
                  </p>
                  <p className="text-right">
                    Unitario:{' '}
                    {line.unitCost === null
                      ? '—'
                      : `${formatUnitCost(line.unitCost)} /${line.baseUnit}`}
                  </p>
                </div>

                {line.missing ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-amber-300">Falta precio</span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => onGoToPrices(line.itemName ?? line.groupName)}
                        className="rounded-lg border border-amber-500/30 px-2 py-1 text-[11px] text-amber-200 no-print"
                      >
                        Capturar precio
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-2">
        <div>
          <h3 className="font-semibold">Consumibles</h3>
          <p className="text-[11px] text-neutral-500">
            Vaso, tapa, popote e hielo con el supuesto fijo de $30.00 / 5 kg.
          </p>
        </div>

        <div className="space-y-2">
          {detail.consumableLines.length === 0 ? (
            <p className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
              Sin consumibles automáticos.
            </p>
          ) : (
            detail.consumableLines.map((line) => (
              <div
                key={`${line.role}-${line.groupId}`}
                className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-200">{roleLabels[line.role]}</p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {line.role === 'ice'
                        ? `${formatQuantity(line.grams ?? 0, 'g')} × ${formatUnitCost(
                            line.unitCost ?? 0,
                          )}/g`
                        : `${formatQuantity(line.qty ?? 0, 'pza')} × ${
                            line.unitCost === null ? '—' : formatCurrency(line.unitCost)
                          }`}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-semibold">
                    {line.lineCost === null ? '—' : formatCurrency(line.lineCost)}
                  </p>
                </div>

                {line.missing ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-amber-300">Falta precio</span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => onGoToPrices(line.groupName)}
                        className="rounded-lg border border-amber-500/30 px-2 py-1 text-[11px] text-amber-200 no-print"
                      >
                        Capturar precio
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <div className="space-y-1 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
        <div className="flex justify-between gap-3 text-neutral-400">
          <span>Subtotal receta</span>
          <span>{detail.recipeCost === null ? '—' : formatCurrency(detail.recipeCost)}</span>
        </div>
        <div className="flex justify-between gap-3 text-neutral-400">
          <span>Subtotal consumibles</span>
          <span>
            {detail.consumablesCost === null ? '—' : formatCurrency(detail.consumablesCost)}
          </span>
        </div>
        <div className="flex justify-between gap-3 border-t border-neutral-800 pt-1 font-semibold">
          <span>Total de la bebida</span>
          <span>{detail.totalCost === null ? 'Pendiente' : formatCurrency(detail.totalCost)}</span>
        </div>
        <p className="pt-1 text-[10px] text-neutral-500">
          El total se calcula con precisión completa; las líneas se muestran redondeadas.
        </p>
      </div>

      {visibleGaps.length > 0 ? (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-200">
          <p className="font-medium">Pendientes para completar el costo</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {visibleGaps.map((gap) => (
              <li key={`${gap.type}:${gap.groupId ?? ''}:${gap.tier ?? ''}`}>{gap.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function CostsBeverageDetailPanel({
  result,
  categoryName,
  canEdit,
  onClose,
  onGoToPrices,
  onGoToRecipe,
}: CostsBeverageDetailPanelProps) {
  const premiumDetail = result.details.premium
  const [tier, setTier] = useState<'normal' | 'premium'>('normal')
  const selectedTier = premiumDetail ? tier : 'normal'

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-neutral-950/95 p-4 backdrop-blur print:static print:overflow-visible print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-3 no-print">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Volver a costos
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500"
          >
            Imprimir / PDF
          </button>
        </div>

        <div className="hidden print:block">
          <h1 className="text-xl font-semibold">Desglose de costo · {result.product.name}</h1>
          <p className="text-sm text-neutral-600">
            Simulación con hielo a $30.00 / 5 kg · {new Date().toLocaleDateString('es-MX')}
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 print:border-0 print:bg-transparent">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{result.product.name}</h2>
              <p className="mt-0.5 text-xs text-neutral-500">{categoryName}</p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[11px] ${
                result.status === 'complete'
                  ? 'bg-green-500/15 text-green-300'
                  : result.status === 'no_recipe'
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-yellow-500/15 text-yellow-300'
              }`}
            >
              {result.status === 'complete'
                ? 'Completa'
                : result.status === 'no_recipe'
                  ? 'Sin receta'
                  : 'Pendiente'}
            </span>
          </div>

          {premiumDetail ? (
            <div className="mt-4 flex rounded-xl border border-neutral-800 bg-neutral-950 p-1 no-print">
              {(['normal', 'premium'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setTier(candidate)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    selectedTier === candidate
                      ? 'bg-brand-400/10 text-brand-300'
                      : 'text-neutral-500'
                  }`}
                >
                  {candidate === 'normal' ? 'Normal' : 'Premium'}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4">
            <DetailSection
              result={result}
              tier={selectedTier}
              canEdit={canEdit}
              onGoToPrices={onGoToPrices}
            />
          </div>
        </section>

        <div className="flex flex-wrap gap-2 no-print">
          {canEdit ? (
            <button
              type="button"
              onClick={() => onGoToPrices('')}
              className="rounded-xl border border-brand-400/40 px-3 py-2 text-xs text-brand-300"
            >
              Ir a precios de insumos
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={() => onGoToRecipe(result.product.id)}
              className="rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-300"
            >
              Ver / editar receta
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
