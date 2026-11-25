-- Completar la presentación de las compras históricas del último evento usando
-- la presentación actual del insumo. No cambia cantidades, costos ni stock.
-- Las seis presentaciones corregidas manualmente ya tienen purchase_factor y
-- se omiten.

update public.event_inventory_movements m
set
  purchase_unit = i.purchase_unit,
  purchase_factor = i.purchase_factor,
  qty_purchase = round(m.qty_base / i.purchase_factor, 4)
from public.inventory_items i
where m.item_id = i.id
  and m.event_id = (
    select id
    from public.events
    order by event_date desc, created_at desc
    limit 1
  )
  and m.movement_type = 'purchase'
  and m.purchase_factor is null;
