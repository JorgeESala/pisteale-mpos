-- Simulador de costos: presentación real de compras y comparación con la
-- última compra registrada.

alter table public.event_inventory_movements
  add column purchase_unit text,
  add column purchase_factor numeric(14, 4)
    check (purchase_factor is null or purchase_factor > 0),
  add column qty_purchase numeric(14, 4)
    check (qty_purchase is null or qty_purchase > 0);

comment on column public.event_inventory_movements.purchase_unit is
  'Presentación capturada en la carga del evento (botella, lata, caja, etc.).';
comment on column public.event_inventory_movements.purchase_factor is
  'Contenido por unidad de la presentación comprada.';
comment on column public.event_inventory_movements.qty_purchase is
  'Número de presentaciones compradas en la carga del evento.';

create or replace view public.v_inventory_latest_purchases
with (security_invoker = true)
as
with purchases as (
  select
    pi.item_id,
    i.name as item_name,
    i.group_id,
    g.name as group_name,
    g.base_unit,
    'purchase'::text as source,
    p.folio as source_label,
    p.purchase_date::timestamptz as purchased_at,
    pi.purchase_unit,
    pi.purchase_factor,
    pi.qty_purchase,
    pi.qty_base,
    pi.total_cost,
    round(pi.total_cost / nullif(pi.qty_base, 0), 6) as unit_cost,
    round(pi.total_cost / nullif(pi.qty_purchase, 0), 4) as package_price,
    true as presentation_known
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  join public.inventory_items i on i.id = pi.item_id
  join public.inventory_item_groups g on g.id = i.group_id
  union all
  select
    m.item_id,
    i.name as item_name,
    i.group_id,
    g.name as group_name,
    g.base_unit,
    'event'::text as source,
    e.folio as source_label,
    m.occurred_at as purchased_at,
    coalesce(m.purchase_unit, i.purchase_unit) as purchase_unit,
    coalesce(m.purchase_factor, i.purchase_factor) as purchase_factor,
    coalesce(
      m.qty_purchase,
      round(m.qty_base / nullif(coalesce(m.purchase_factor, i.purchase_factor), 0), 4)
    ) as qty_purchase,
    m.qty_base,
    m.total_cost,
    round(m.total_cost / nullif(m.qty_base, 0), 6) as unit_cost,
    round(
      m.total_cost / nullif(
        coalesce(
          m.qty_purchase,
          round(m.qty_base / nullif(coalesce(m.purchase_factor, i.purchase_factor), 0), 4)
        ),
        0
      ),
      4
    ) as package_price,
    m.purchase_factor is not null as presentation_known
  from public.event_inventory_movements m
  join public.events e on e.id = m.event_id
  join public.inventory_items i on i.id = m.item_id
  join public.inventory_item_groups g on g.id = i.group_id
  where m.movement_type = 'purchase'
)
select distinct on (item_id)
  item_id,
  item_name,
  group_id,
  group_name,
  base_unit,
  source,
  source_label,
  purchased_at,
  purchase_unit,
  purchase_factor,
  qty_purchase,
  qty_base,
  total_cost,
  unit_cost,
  package_price,
  presentation_known
from purchases
order by item_id, purchased_at desc, source;

revoke all on public.v_inventory_latest_purchases from anon, authenticated;
grant select on public.v_inventory_latest_purchases to authenticated;

create or replace function public.set_inventory_package_prices(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_row record;
  v_item record;
  v_purchase_unit text;
  v_purchase_factor numeric;
  v_group_item_count integer;
  v_old_cost numeric;
  v_new_cost numeric;
  v_note text;
  v_presentation text;
begin
  perform private.require_admin();

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La lista de precios es inválida' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_items);

  if v_count < 1 or v_count > 500 then
    raise exception 'La lista de precios debe incluir entre 1 y 500 insumos'
      using errcode = '22023';
  end if;

  if (
    select count(distinct e->>'item_id')
    from jsonb_array_elements(p_items) as e
  ) <> v_count then
    raise exception 'Insumo duplicado en la lista de precios' using errcode = '22023';
  end if;

  for v_row in
    select
      nullif(btrim(e->>'item_id'), '')::uuid as item_id,
      nullif(btrim(e->>'package_price'), '')::numeric as package_price,
      nullif(btrim(e->>'purchase_unit'), '') as purchase_unit,
      nullif(btrim(e->>'purchase_factor'), '')::numeric as purchase_factor
    from jsonb_array_elements(p_items) as e
  loop
    if v_row.item_id is null then
      raise exception 'Insumo inválido en la lista de precios' using errcode = '22023';
    end if;

    if v_row.package_price is null or v_row.package_price < 0 then
      raise exception 'Precio inválido en la lista de precios' using errcode = '22023';
    end if;

    select
      i.id,
      i.group_id,
      i.purchase_factor,
      i.purchase_unit,
      i.active as item_active,
      g.base_unit
    into v_item
    from public.inventory_items i
    join public.inventory_item_groups g on g.id = i.group_id
    where i.id = v_row.item_id;

    if v_item.id is null then
      raise exception 'Insumo no encontrado en la lista de precios' using errcode = 'P0001';
    end if;

    v_purchase_unit := coalesce(v_row.purchase_unit, v_item.purchase_unit);
    v_purchase_factor := coalesce(v_row.purchase_factor, v_item.purchase_factor);

    if v_purchase_unit is null
      or length(v_purchase_unit) < 1
      or length(v_purchase_unit) > 30 then
      raise exception 'Presentación de compra inválida' using errcode = '22023';
    end if;

    if v_purchase_factor is null or v_purchase_factor <= 0 then
      raise exception 'Contenido por unidad inválido' using errcode = '22023';
    end if;

    update public.inventory_items
    set
      package_price = round(v_row.package_price, 4),
      purchase_unit = v_purchase_unit,
      purchase_factor = v_purchase_factor,
      package_price_updated_at = now()
    where id = v_item.id;

    select count(*)
    into v_group_item_count
    from public.inventory_items
    where group_id = v_item.group_id
      and active;

    if v_group_item_count = 1 and v_item.item_active then
      v_new_cost := case
        when v_row.package_price > 0 then round(v_row.package_price / v_purchase_factor, 6)
        else null
      end;

      v_presentation := case
        when v_item.base_unit = 'pza' and v_purchase_factor = 1 then 'la pieza'
        when v_item.base_unit = 'g' and v_purchase_factor = 1000
          and v_purchase_unit = 'kg' then 'por 1 kg'
        when v_item.base_unit = 'ml' and v_purchase_factor >= 1000 then
          'la ' || v_purchase_unit || ' de ' ||
          rtrim(to_char(v_purchase_factor / 1000, 'FM999999990.999'), '.') || ' L'
        when v_item.base_unit = 'g' and v_purchase_factor >= 1000 then
          'la ' || v_purchase_unit || ' de ' ||
          rtrim(to_char(v_purchase_factor / 1000, 'FM999999990.999'), '.') || ' kg'
        else
          'la ' || v_purchase_unit || ' de ' ||
          rtrim(to_char(v_purchase_factor, 'FM999999990.999'), '.') || ' ' ||
          v_item.base_unit
      end;

      v_note := case
        when v_new_cost is null then 'Precio del paquete eliminado'
        else
          'Precio del paquete · $' ||
          to_char(round(v_row.package_price, 2), 'FM999999990.00') || ' ' || v_presentation
      end;

      select reference_cost
      into v_old_cost
      from public.inventory_item_groups
      where id = v_item.group_id
      for update;

      update public.inventory_item_groups
      set
        reference_cost = v_new_cost,
        reference_cost_updated_at = now(),
        reference_cost_note = v_note,
        reference_cost_source = 'package_price'
      where id = v_item.group_id;

      insert into public.inventory_group_cost_history (
        group_id,
        old_cost,
        new_cost,
        note,
        source,
        created_by
      )
      values (
        v_item.group_id,
        v_old_cost,
        v_new_cost,
        v_note,
        'package_price',
        auth.uid()
      );
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.set_inventory_package_prices(jsonb) is
  'Actualiza precio, presentación y costo de referencia desde el simulador.';

revoke all on function public.set_inventory_package_prices(jsonb) from public, anon;
grant execute on function public.set_inventory_package_prices(jsonb) to authenticated;

-- Corrección de presentaciones históricas del evento EVT-2026-00001.
-- La función antigua ignoraba el contenido por unidad capturado.

update public.inventory_items i
set
  purchase_unit = v.purchase_unit,
  purchase_factor = v.purchase_factor,
  package_price = v.package_price,
  package_price_updated_at = now()
from (
  values
    ('6b114a74-0d51-4682-b37c-fd1db2258a50'::uuid, 'botella', 2000::numeric, 28.8000::numeric),
    ('c73624a5-2aa0-4b86-b538-bd8d0759cb76'::uuid, 'botella', 700::numeric, 200.0000::numeric),
    ('ba91bfff-dd92-4c35-9bbf-039dd0d46be3'::uuid, 'botella', 1000::numeric, 192.5000::numeric),
    ('4f87d966-1c79-4ec8-bc0b-85c90f169b68'::uuid, 'botella', 1000::numeric, 138.0000::numeric),
    ('79b81651-a6da-460b-b678-6f0e0810ab35'::uuid, 'lata', 237::numeric, 9.1667::numeric),
    ('6c4baf8d-fed1-4291-8ada-68d9d5b0690f'::uuid, 'botella', 960::numeric, 25.0592::numeric)
) as v(group_id, purchase_unit, purchase_factor, package_price)
where i.group_id = v.group_id;

update public.event_inventory_movements m
set
  purchase_unit = v.purchase_unit,
  purchase_factor = v.purchase_factor,
  qty_purchase = v.qty_purchase
from (
  values
    ('af63bd91-2056-49f5-af68-b59c0fc06b0b'::uuid, 'botella', 2000::numeric, 5::numeric),
    ('645bf3a9-4f27-4242-8e7a-306301359de1'::uuid, 'botella', 700::numeric, 4::numeric),
    ('9559df12-d61f-4bf7-a349-d3873e9cb96f'::uuid, 'botella', 1000::numeric, 4::numeric),
    ('24a5b767-39ce-4c62-aebe-4d4e0d8d4994'::uuid, 'botella', 1000::numeric, 5::numeric),
    ('65511e1c-56f2-4b97-8269-a6ad05be2d42'::uuid, 'lata', 237::numeric, 24::numeric),
    ('2adea662-42c9-47d6-9968-ed6d9227767f'::uuid, 'botella', 960::numeric, 12::numeric)
) as v(item_id, purchase_unit, purchase_factor, qty_purchase)
where m.event_id = (
    select id
    from public.events
    order by event_date desc, created_at desc
    limit 1
  )
  and m.item_id = v.item_id
  and m.movement_type = 'purchase';

update public.inventory_item_groups g
set
  reference_cost_note = v.note,
  reference_cost_updated_at = now()
from (
  values
    ('6b114a74-0d51-4682-b37c-fd1db2258a50'::uuid, 'EVT-2026-00001 · $28.80 la botella de 2 L'),
    ('c73624a5-2aa0-4b86-b538-bd8d0759cb76'::uuid, 'EVT-2026-00001 · $200.00 la botella de 700 ml'),
    ('ba91bfff-dd92-4c35-9bbf-039dd0d46be3'::uuid, 'EVT-2026-00001 · $192.50 la botella de 1 L'),
    ('4f87d966-1c79-4ec8-bc0b-85c90f169b68'::uuid, 'EVT-2026-00001 · $138.00 la botella de 1 L'),
    ('79b81651-a6da-460b-b678-6f0e0810ab35'::uuid, 'EVT-2026-00001 · $9.17 la lata de 237 ml'),
    ('6c4baf8d-fed1-4291-8ada-68d9d5b0690f'::uuid, 'EVT-2026-00001 · $25.06 la botella de 960 ml')
) as v(group_id, note)
where g.id = v.group_id;

update public.inventory_item_groups
set reference_cost = round(200.0 / 700.0, 6)
where id = 'c73624a5-2aa0-4b86-b538-bd8d0759cb76'::uuid;

-- Guardar la presentación real en las cargas del evento.



-- Guardar la presentación real al editar una carga del evento.


-- Guardar la presentación real en las cargas del evento.

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
    created_by,
    purchase_unit,
    purchase_factor,
    qty_purchase
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
    auth.uid(),
    i.purchase_unit,
    q.purchase_factor,
    (item->>'qty_purchase')::numeric
  from jsonb_array_elements(p_items) as item
  join public.inventory_items i on i.id = (item->>'item_id')::uuid
  cross join lateral (
    select
      coalesce(
        nullif(btrim(coalesce(item->>'purchase_factor', '')), '')::numeric,
        i.purchase_factor
      ) as purchase_factor,
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

-- Guardar la presentación real al editar una carga del evento.

create or replace function public.update_event_inventory_load(
  p_load_id uuid,
  p_event_id uuid,
  p_items jsonb,
  p_category text,
  p_payment_method text,
  p_reference text,
  p_notes text,
  p_spent_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_folio text;
  v_load public.event_inventory_loads;
  v_expense_id uuid;
  v_expense_event_id uuid;
  v_old_spent_at timestamptz;
  v_spent_at timestamptz;
  v_reference text;
  v_notes text;
  v_total numeric;
  v_old_items jsonb;
  v_new_items jsonb;
  v_before jsonb;
  v_after jsonb;
  v_negative_item text;
begin
  if not private.is_active_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_load_id is null or p_event_id is null then
    raise exception 'La carga y el evento son obligatorios' using errcode = '22023';
  end if;

  select folio into v_event_folio
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  select * into v_load
  from public.event_inventory_loads
  where id = p_load_id
    and event_id = p_event_id
  for update;

  if not found then
    raise exception 'Carga no encontrada' using errcode = '22023';
  end if;

  v_expense_id := v_load.event_expense_id;

  if v_expense_id is not null then
    select event_id, spent_at
    into v_expense_event_id, v_old_spent_at
    from public.event_expenses
    where id = v_expense_id
    for update;

    if not found then
      raise exception 'Gasto de la carga no encontrado' using errcode = '22023';
    end if;

    if v_expense_event_id <> p_event_id then
      raise exception 'El gasto de la carga no pertenece al evento' using errcode = '22023';
    end if;
  end if;

  if p_category not in ('supplies', 'ice', 'transport', 'staff', 'permits', 'rent', 'other') then
    raise exception 'Categoría de gasto inválida' using errcode = '22023';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'other') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;

  v_reference := btrim(coalesce(p_reference, ''));
  v_notes := btrim(coalesce(p_notes, ''));
  v_spent_at := coalesce(p_spent_at, v_old_spent_at, now());

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
    left join public.inventory_items i
      on i.id = nullif(item->>'item_id', '')::uuid
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

  drop table if exists pg_temp.edit_load_items;

  create temp table pg_temp.edit_load_items on commit drop as
  select
    i.id as item_id,
    i.name as item_name,
    i.purchase_unit,
    coalesce(
      nullif(btrim(coalesce(e->>'purchase_factor', '')), '')::numeric,
      i.purchase_factor
    ) as purchase_factor,
    (e->>'qty_purchase')::numeric as qty_purchase,
    round(
      (e->>'qty_purchase')::numeric
      * coalesce(
        nullif(btrim(coalesce(e->>'purchase_factor', '')), '')::numeric,
        i.purchase_factor
      ),
      4
    ) as qty_base,
    round((e->>'total_cost')::numeric, 2) as total_cost
  from jsonb_array_elements(p_items) as e
  join public.inventory_items i on i.id = (e->>'item_id')::uuid;

  if exists (select 1 from pg_temp.edit_load_items where qty_base <= 0) then
    raise exception 'La cantidad convertida debe ser mayor a cero' using errcode = '22023';
  end if;

  select coalesce(sum(total_cost), 0) into v_total from pg_temp.edit_load_items;

  if v_total <= 0 then
    raise exception 'El costo de la carga debe ser mayor a cero' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', m.item_id,
      'item_name', i.name,
      'qty_base', m.qty_base,
      'total_cost', m.total_cost,
      'purchase_unit', m.purchase_unit,
      'purchase_factor', m.purchase_factor,
      'qty_purchase', m.qty_purchase
    )
    order by i.name
  ), '[]'::jsonb)
  into v_old_items
  from public.event_inventory_movements m
  join public.inventory_items i on i.id = m.item_id
  where m.load_id = p_load_id
    and m.movement_type = 'purchase';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', item_id,
      'item_name', item_name,
      'qty_base', qty_base,
      'total_cost', total_cost,
      'purchase_unit', purchase_unit,
      'purchase_factor', purchase_factor,
      'qty_purchase', qty_purchase
    )
    order by item_name
  ), '[]'::jsonb)
  into v_new_items
  from pg_temp.edit_load_items;

  v_before := jsonb_build_object(
    'load_id', v_load.id,
    'total_cost', v_load.total_cost,
    'category', v_load.category,
    'payment_method', v_load.payment_method,
    'reference', v_load.reference,
    'notes', v_load.notes,
    'spent_at', v_old_spent_at,
    'items', v_old_items
  );

  delete from public.event_inventory_movements
  where load_id = p_load_id
    and movement_type = 'purchase';

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
    created_by,
    purchase_unit,
    purchase_factor,
    qty_purchase
  )
  select
    p_event_id,
    p_load_id,
    t.item_id,
    'purchase',
    t.qty_base,
    round(t.total_cost / nullif(t.qty_base, 0), 6),
    t.total_cost,
    v_notes,
    v_spent_at,
    auth.uid(),
    t.purchase_unit,
    t.purchase_factor,
    t.qty_purchase
  from pg_temp.edit_load_items t;

  select i.name into v_negative_item
  from (
    select item_id, sum(qty_base) as qty
    from public.event_inventory_movements
    where event_id = p_event_id
    group by item_id
  ) s
  join public.inventory_items i on i.id = s.item_id
  where s.qty < 0
  limit 1;

  if v_negative_item is not null then
    raise exception 'La edición dejaría stock negativo de %', v_negative_item
      using errcode = '22023';
  end if;

  update public.event_inventory_loads
  set
    total_cost = round(v_total, 2),
    category = p_category,
    payment_method = p_payment_method,
    reference = v_reference,
    notes = v_notes,
    updated_by = auth.uid(),
    updated_by_name = coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    updated_at = now()
  where id = p_load_id;

  if v_expense_id is null then
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
      created_by,
      updated_by,
      updated_by_name
    )
    values (
      gen_random_uuid(),
      p_event_id,
      p_category,
      'Carga de inventario · ' || v_event_folio,
      round(v_total, 2),
      p_payment_method,
      v_reference,
      v_spent_at,
      v_notes,
      coalesce(v_load.created_by, auth.uid()),
      auth.uid(),
      coalesce((select full_name from public.profiles where id = auth.uid()), '')
    )
    returning id into v_expense_id;

    update public.event_inventory_loads
    set event_expense_id = v_expense_id
    where id = p_load_id;
  else
    update public.event_expenses
    set
      category = p_category,
      amount = round(v_total, 2),
      payment_method = p_payment_method,
      reference = v_reference,
      spent_at = v_spent_at,
      notes = v_notes,
      updated_by = auth.uid(),
      updated_by_name = coalesce((select full_name from public.profiles where id = auth.uid()), ''),
      updated_at = now()
    where id = v_expense_id;
  end if;

  v_after := jsonb_build_object(
    'load_id', p_load_id,
    'total_cost', round(v_total, 2),
    'category', p_category,
    'payment_method', p_payment_method,
    'reference', v_reference,
    'notes', v_notes,
    'spent_at', v_spent_at,
    'items', v_new_items
  );

  insert into public.event_finance_edits (
    event_id,
    entity_type,
    entity_id,
    edited_by,
    edited_by_name,
    summary,
    before_data,
    after_data
  )
  values (
    p_event_id,
    'inventory_load',
    p_load_id,
    auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    format('Carga de inventario · total %s → %s', v_load.total_cost, round(v_total, 2)),
    v_before,
    v_after
  );

  drop table if exists pg_temp.edit_load_items;

  return p_load_id;
end;
$$;