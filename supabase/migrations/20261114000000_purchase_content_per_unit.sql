-- Permite capturar el contenido por unidad en cada línea de compra.
-- Si no se envía, se usa el factor del insumo.

create or replace function public.create_purchase(
  p_purchase_date date,
  p_supplier text,
  p_invoice_ref text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase_id uuid;
  v_folio text;
  v_total numeric := 0;
  v_row record;
  v_item_id uuid;
  v_purchase_unit text;
  v_purchase_factor numeric;
  v_avg_cost numeric;
  v_track_stock boolean;
  v_active boolean;
  v_group_name text;
  v_current_qty numeric;
  v_qty_base numeric;
  v_line_total numeric;
  v_line_unit_cost numeric;
  v_new_avg numeric;
  v_supplier text;
  v_invoice_ref text;
  v_notes text;
  v_item_count integer;
begin
  perform private.require_adjust_inventory();

  if p_purchase_date is null then
    raise exception 'La fecha de compra es obligatoria' using errcode = '22023';
  end if;

  if p_purchase_date > current_date then
    raise exception 'La fecha de compra no puede ser futura' using errcode = '22023';
  end if;

  v_supplier := btrim(coalesce(p_supplier, ''));
  if length(v_supplier) > 120 then
    raise exception 'El proveedor es demasiado largo' using errcode = '22023';
  end if;

  v_invoice_ref := btrim(coalesce(p_invoice_ref, ''));
  if length(v_invoice_ref) > 60 then
    raise exception 'La referencia de factura es demasiado larga' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));
  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La compra debe incluir insumos' using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(p_items);

  if v_item_count < 1 or v_item_count > 100 then
    raise exception 'La compra debe incluir entre 1 y 100 insumos' using errcode = '22023';
  end if;

  if (
    select count(distinct e->>'item_id')
    from jsonb_array_elements(p_items) as e
  ) <> v_item_count then
    raise exception 'Insumo duplicado en la compra' using errcode = '22023';
  end if;

  v_folio := public.next_folio('purchase');

  insert into public.purchases (
    folio,
    purchase_date,
    supplier,
    invoice_ref,
    notes,
    total_cost,
    created_by
  )
  values (
    v_folio,
    p_purchase_date,
    v_supplier,
    v_invoice_ref,
    v_notes,
    0,
    auth.uid()
  )
  returning id into v_purchase_id;

  for v_row in
    select
      e->>'item_id' as item_id,
      e->>'qty_purchase' as qty_purchase,
      e->>'total_cost' as total_cost,
      e->>'purchase_factor' as purchase_factor
    from jsonb_array_elements(p_items) as e
  loop
    if v_row.item_id is null or v_row.item_id = '' then
      raise exception 'Insumo de compra inválido' using errcode = '22023';
    end if;

    v_item_id := v_row.item_id::uuid;

    if v_row.qty_purchase is null or (v_row.qty_purchase)::numeric <= 0 then
      raise exception 'Cantidad de compra inválida' using errcode = '22023';
    end if;

    if v_row.total_cost is null or (v_row.total_cost)::numeric < 0 then
      raise exception 'Costo de compra inválido' using errcode = '22023';
    end if;

    select
      i.purchase_unit,
      i.purchase_factor,
      i.avg_cost,
      i.track_stock,
      i.active,
      g.name
    into
      v_purchase_unit,
      v_purchase_factor,
      v_avg_cost,
      v_track_stock,
      v_active,
      v_group_name
    from public.inventory_items i
    join public.inventory_item_groups g on g.id = i.group_id
    where i.id = v_item_id
    for update of i;

    if not found then
      raise exception 'Insumo de compra no encontrado' using errcode = '22023';
    end if;

    if not v_track_stock then
      raise exception 'El insumo % no lleva inventario', v_group_name using errcode = '22023';
    end if;

    if not v_active then
      raise exception 'El insumo % está inactivo', v_group_name using errcode = '22023';
    end if;

    if v_row.purchase_factor is not null
      and btrim(v_row.purchase_factor) <> '' then
      if (v_row.purchase_factor)::numeric <= 0 then
        raise exception 'Contenido por unidad inválido' using errcode = '22023';
      end if;

      v_purchase_factor := round((v_row.purchase_factor)::numeric, 4);
    end if;

    v_qty_base := round((v_row.qty_purchase)::numeric * v_purchase_factor, 4);
    if v_qty_base <= 0 then
      raise exception 'Cantidad de compra inválida' using errcode = '22023';
    end if;

    v_line_total := round((v_row.total_cost)::numeric, 2);
    v_line_unit_cost := round(v_line_total / v_qty_base, 6);

    select coalesce(sum(qty_base), 0)
    into v_current_qty
    from public.inventory_movements
    where item_id = v_item_id;

    if v_current_qty < 0 then
      raise exception 'Stock negativo para el insumo %; ajusta el inventario antes de comprar', v_group_name
        using errcode = '22023';
    end if;

    v_new_avg := round(
      (v_current_qty * v_avg_cost + v_line_total) / (v_current_qty + v_qty_base),
      6
    );

    update public.inventory_items
    set avg_cost = v_new_avg
    where id = v_item_id;

    insert into public.purchase_items (
      purchase_id,
      item_id,
      purchase_unit,
      purchase_factor,
      qty_purchase,
      qty_base,
      total_cost
    )
    values (
      v_purchase_id,
      v_item_id,
      v_purchase_unit,
      v_purchase_factor,
      round((v_row.qty_purchase)::numeric, 4),
      v_qty_base,
      v_line_total
    );

    insert into public.inventory_movements (
      item_id,
      movement_type,
      qty_base,
      unit_cost,
      total_cost,
      purchase_id,
      notes,
      occurred_at,
      created_by
    )
    values (
      v_item_id,
      'purchase',
      v_qty_base,
      v_line_unit_cost,
      v_line_total,
      v_purchase_id,
      'Compra ' || v_folio,
      (p_purchase_date + time '12:00') at time zone 'America/Cancun',
      auth.uid()
    );

    v_total := v_total + v_line_total;
  end loop;

  update public.purchases
  set total_cost = round(v_total, 2)
  where id = v_purchase_id;

  return v_purchase_id;
end;
$$;

revoke all on function public.create_purchase(date, text, text, text, jsonb)
  from public, anon;
grant execute on function public.create_purchase(date, text, text, text, jsonb)
  to authenticated;

create or replace function public.create_event_inventory_load(
  p_client_id uuid,
  p_event_id uuid,
  p_items jsonb,
  p_category text,
  p_payment_method text,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid := coalesce(p_client_id, gen_random_uuid());
  v_load_id uuid;
  v_expense_id uuid;
  v_event record;
  v_total numeric;
  v_reference text;
  v_notes text;
begin
  perform private.require_operator();

  select id into v_load_id from public.event_inventory_loads where client_id = v_client_id;

  if v_load_id is not null then
    return v_load_id;
  end if;

  select id, folio into v_event from public.events where id = p_event_id;

  if not found then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  if p_category not in ('supplies', 'ice', 'transport', 'staff', 'permits', 'rent', 'other') then
    raise exception 'Categoría de gasto inválida' using errcode = '22023';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'other') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;

  v_reference := btrim(coalesce(p_reference, ''));
  v_notes := btrim(coalesce(p_notes, ''));

  if length(v_reference) > 100 then
    raise exception 'La referencia es demasiado larga' using errcode = '22023';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'La carga debe incluir al menos un insumo' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'La carga tiene demasiados insumos' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    left join public.inventory_items i on i.id = nullif(item->>'item_id', '')::uuid
    where i.id is null
      or (item->>'qty_purchase') is null
      or (item->>'qty_purchase')::numeric <= 0
      or (item->>'total_cost') is null
      or (item->>'total_cost')::numeric < 0
      or (
        item ? 'purchase_factor'
        and btrim(coalesce(item->>'purchase_factor', '')) <> ''
        and (item->>'purchase_factor')::numeric <= 0
      )
  ) then
    raise exception 'Insumo o cantidad inválida en la carga' using errcode = '22023';
  end if;

  select coalesce(sum((item->>'total_cost')::numeric), 0)
  into v_total
  from jsonb_array_elements(p_items) as item;

  if v_total <= 0 then
    raise exception 'El costo de la carga debe ser mayor a cero' using errcode = '22023';
  end if;

  insert into public.event_inventory_loads (
    client_id,
    event_id,
    total_cost,
    category,
    payment_method,
    reference,
    notes,
    created_by
  )
  values (
    v_client_id,
    p_event_id,
    round(v_total, 2),
    p_category,
    p_payment_method,
    v_reference,
    v_notes,
    auth.uid()
  )
  returning id into v_load_id;

  insert into public.event_inventory_movements (
    event_id,
    load_id,
    item_id,
    movement_type,
    qty_base,
    unit_cost,
    total_cost,
    notes,
    occurred_at,
    created_by
  )
  select
    p_event_id,
    v_load_id,
    i.id,
    'purchase',
    round(q.qty_base, 4),
    round(
      (item->>'total_cost')::numeric
      / nullif(round(q.qty_base, 4), 0),
      6
    ),
    round((item->>'total_cost')::numeric, 2),
    v_notes,
    now(),
    auth.uid()
  from jsonb_array_elements(p_items) as item
  join public.inventory_items i on i.id = (item->>'item_id')::uuid
  cross join lateral (
    select
      (item->>'qty_purchase')::numeric
      * coalesce(
        nullif(btrim(coalesce(item->>'purchase_factor', '')), '')::numeric,
        i.purchase_factor
      ) as qty_base
  ) q;

  insert into public.event_expenses (
    client_id,
    event_id,
    category,
    description,
    amount,
    payment_method,
    reference,
    spent_at,
    notes,
    created_by
  )
  values (
    gen_random_uuid(),
    p_event_id,
    p_category,
    'Carga de inventario · ' || v_event.folio,
    round(v_total, 2),
    p_payment_method,
    v_reference,
    now(),
    v_notes,
    auth.uid()
  )
  returning id into v_expense_id;

  update public.event_inventory_loads
  set event_expense_id = v_expense_id
  where id = v_load_id;

  return v_load_id;
end;
$$;

revoke all on function public.create_event_inventory_load(
  uuid,
  uuid,
  jsonb,
  text,
  text,
  text,
  text
) from public, anon;
grant execute on function public.create_event_inventory_load(
  uuid,
  uuid,
  jsonb,
  text,
  text,
  text,
  text
) to authenticated;
