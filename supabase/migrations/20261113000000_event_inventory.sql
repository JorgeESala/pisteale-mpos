alter table public.inventory_movements
  add column event_id uuid references public.events (id) on delete set null;

create index inventory_movements_event_idx on public.inventory_movements (event_id);

create table public.event_inventory_loads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  total_cost numeric(14, 2) not null check (total_cost > 0),
  category text not null
    check (category in ('supplies', 'ice', 'transport', 'staff', 'permits', 'rent', 'other')),
  payment_method text not null check (payment_method in ('cash', 'card', 'transfer', 'other')),
  reference text not null default '',
  notes text not null default '',
  event_expense_id uuid references public.event_expenses (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.event_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  load_id uuid references public.event_inventory_loads (id) on delete cascade,
  event_sale_id uuid references public.event_sales (id) on delete set null,
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  movement_type text not null
    check (movement_type in ('purchase', 'consumption', 'transfer_out', 'adjustment', 'waste')),
  qty_base numeric(14, 4) not null check (qty_base <> 0),
  unit_cost numeric(14, 6) not null default 0 check (unit_cost >= 0),
  total_cost numeric(14, 2) not null default 0 check (total_cost >= 0),
  notes text not null default '',
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index event_inventory_loads_event_idx on public.event_inventory_loads (event_id, created_at desc);
create index event_inventory_loads_client_idx on public.event_inventory_loads (client_id);
create index event_inventory_movements_event_idx
  on public.event_inventory_movements (event_id, occurred_at desc);
create index event_inventory_movements_item_idx
  on public.event_inventory_movements (event_id, item_id, occurred_at);
create index event_inventory_movements_sale_idx
  on public.event_inventory_movements (event_sale_id);
create index event_inventory_movements_load_idx
  on public.event_inventory_movements (load_id);

alter table public.event_inventory_loads enable row level security;
alter table public.event_inventory_movements enable row level security;

create policy event_inventory_loads_select_active_users
on public.event_inventory_loads
for select
to authenticated
using (private.is_active_user());

create policy event_inventory_movements_select_active_users
on public.event_inventory_movements
for select
to authenticated
using (private.is_active_user());

revoke all on public.event_inventory_loads from anon, authenticated;
revoke all on public.event_inventory_movements from anon, authenticated;
grant select on public.event_inventory_loads to authenticated;
grant select on public.event_inventory_movements to authenticated;

create trigger event_inventory_loads_audit
after insert or update or delete on public.event_inventory_loads
for each row execute function private.audit_trigger();

create trigger event_inventory_movements_audit
after insert or update or delete on public.event_inventory_movements
for each row execute function private.audit_trigger();

create or replace function private.consume_event_group(
  p_event_id uuid,
  p_group_id uuid,
  p_tier text,
  p_tier_rule text,
  p_qty_base numeric,
  p_event_sale_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining numeric := round(p_qty_base, 4);
  v_item record;
  v_take numeric;
  v_unit_cost numeric;
  v_first record;
begin
  if v_remaining <= 0 then
    return;
  end if;

  for v_item in
    select
      i.id,
      i.avg_cost,
      coalesce(sum(em.qty_base), 0) as current_qty,
      coalesce(sum(case when em.movement_type = 'purchase' then em.total_cost else 0 end), 0)
        as purchase_cost,
      coalesce(sum(case when em.movement_type = 'purchase' then em.qty_base else 0 end), 0)
        as purchase_qty
    from public.inventory_items i
    join public.inventory_item_groups g on g.id = i.group_id
    left join public.event_inventory_movements em
      on em.item_id = i.id
      and em.event_id = p_event_id
    where i.group_id = p_group_id
      and i.active
      and (
        not g.is_tiered
        or p_tier_rule = 'any'
        or (
          p_tier_rule = 'match'
          and i.tier = case when p_tier = 'premium' then 'premium' else 'estandar' end
        )
        or (p_tier_rule = 'estandar' and i.tier = 'estandar')
        or (p_tier_rule = 'premium' and i.tier = 'premium')
      )
    group by i.id, i.avg_cost
    order by i.name
  loop
    if v_remaining <= 0 then
      exit;
    end if;

    v_take := least(v_remaining, greatest(v_item.current_qty, 0));

    if v_take > 0 then
      v_unit_cost := case
        when v_item.purchase_qty > 0 then round(v_item.purchase_cost / v_item.purchase_qty, 6)
        else v_item.avg_cost
      end;

      insert into public.event_inventory_movements (
        event_id,
        event_sale_id,
        item_id,
        movement_type,
        qty_base,
        unit_cost,
        total_cost,
        notes,
        occurred_at,
        created_by
      )
      values (
        p_event_id,
        p_event_sale_id,
        v_item.id,
        'consumption',
        -v_take,
        v_unit_cost,
        round(v_take * v_unit_cost, 2),
        p_notes,
        now(),
        auth.uid()
      );

      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  if v_remaining > 0 then
    select
      i.id,
      i.avg_cost,
      coalesce(
        (
          select sum(em.total_cost) / nullif(sum(em.qty_base), 0)
          from public.event_inventory_movements em
          where em.event_id = p_event_id
            and em.item_id = i.id
            and em.movement_type = 'purchase'
        ),
        i.avg_cost
      ) as unit_cost
    into v_first
    from public.inventory_items i
    join public.inventory_item_groups g on g.id = i.group_id
    where i.group_id = p_group_id
      and i.active
      and (
        not g.is_tiered
        or p_tier_rule = 'any'
        or (
          p_tier_rule = 'match'
          and i.tier = case when p_tier = 'premium' then 'premium' else 'estandar' end
        )
        or (p_tier_rule = 'estandar' and i.tier = 'estandar')
        or (p_tier_rule = 'premium' and i.tier = 'premium')
      )
    order by i.name
    limit 1;

    if v_first.id is not null then
      insert into public.event_inventory_movements (
        event_id,
        event_sale_id,
        item_id,
        movement_type,
        qty_base,
        unit_cost,
        total_cost,
        notes,
        occurred_at,
        created_by
      )
      values (
        p_event_id,
        p_event_sale_id,
        v_first.id,
        'consumption',
        -v_remaining,
        v_first.unit_cost,
        round(v_remaining * v_first.unit_cost, 2),
        p_notes,
        now(),
        auth.uid()
      );
    end if;
  end if;
end;
$$;

revoke all on function private.consume_event_group(
  uuid,
  uuid,
  text,
  text,
  numeric,
  uuid,
  text
) from public, anon, authenticated;

create or replace function private.event_product_ice_grams(p_product_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serving numeric;
  v_kind text;
  v_liquid numeric := 0;
  v_density numeric;
begin
  select serving_size_ml, kind
  into v_serving, v_kind
  from public.products
  where id = p_product_id;

  if v_serving is null or v_kind <> 'preparado' then
    return 0;
  end if;

  select coalesce(
    sum(case when g.base_unit = 'ml' then ri.qty_base::numeric / r.yield_qty else 0 end),
    0
  )
  into v_liquid
  from public.recipes r
  left join public.recipe_items ri on ri.recipe_id = r.id
  left join public.inventory_item_groups g on g.id = ri.inventory_group_id
  where r.product_id = p_product_id
    and r.active;

  select coalesce(
    (select (value::text)::numeric from public.app_settings where key = 'ice_density_g_per_ml'),
    0.9
  )
  into v_density;

  return round(greatest(0, v_serving - v_liquid) * v_density, 4);
end;
$$;

revoke all on function private.event_product_ice_grams(uuid)
  from public, anon, authenticated;

create or replace function private.consume_event_sale_inventory(
  p_event_id uuid,
  p_event_sale_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_product record;
  v_recipe record;
  v_ri record;
  v_default record;
  v_required numeric;
  v_ice_group_id uuid;
  v_ice_grams numeric;
begin
  for v_line in
    select
      nullif(item->>'product_id', '')::uuid as product_id,
      (item->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as item
    where nullif(item->>'product_id', '') is not null
  loop
    select id, name, kind
    into v_product
    from public.products
    where id = v_line.product_id;

    if not found or v_product.kind <> 'preparado' then
      continue;
    end if;

    select id, yield_qty
    into v_recipe
    from public.recipes
    where product_id = v_product.id
      and active;

    if v_recipe.id is not null then
      for v_ri in
        select inventory_group_id, tier_rule, qty_base
        from public.recipe_items
        where recipe_id = v_recipe.id
      loop
        v_required := round(
          (v_ri.qty_base::numeric / v_recipe.yield_qty) * v_line.quantity,
          4
        );

        perform private.consume_event_group(
          p_event_id,
          v_ri.inventory_group_id,
          'normal',
          v_ri.tier_rule,
          v_required,
          p_event_sale_id,
          'Receta · ' || v_product.name
        );
      end loop;
    end if;

    for v_default in
      select inventory_group_id, qty_base
      from public.recipe_default_consumables
      where active
        and applies_to_kind = 'preparado'
        and role in ('cup', 'lid', 'straw')
    loop
      v_required := round(coalesce(v_default.qty_base, 1) * v_line.quantity, 4);

      perform private.consume_event_group(
        p_event_id,
        v_default.inventory_group_id,
        'normal',
        'any',
        v_required,
        p_event_sale_id,
        'Consumible · ' || v_product.name
      );
    end loop;

    select inventory_group_id
    into v_ice_group_id
    from public.recipe_default_consumables
    where active
      and applies_to_kind = 'preparado'
      and role = 'ice'
    limit 1;

    if v_ice_group_id is not null then
      v_ice_grams := round(
        private.event_product_ice_grams(v_product.id) * v_line.quantity,
        4
      );

      perform private.consume_event_group(
        p_event_id,
        v_ice_group_id,
        'normal',
        'any',
        v_ice_grams,
        p_event_sale_id,
        'Hielo · ' || v_product.name
      );
    end if;
  end loop;
end;
$$;

revoke all on function private.consume_event_sale_inventory(uuid, uuid, jsonb)
  from public, anon, authenticated;

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
    round((item->>'qty_purchase')::numeric * i.purchase_factor, 4),
    round(
      (item->>'total_cost')::numeric
      / nullif(round((item->>'qty_purchase')::numeric * i.purchase_factor, 4), 0),
      6
    ),
    round((item->>'total_cost')::numeric, 2),
    v_notes,
    now(),
    auth.uid()
  from jsonb_array_elements(p_items) as item
  join public.inventory_items i on i.id = (item->>'item_id')::uuid;

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

create or replace function public.adjust_event_inventory_item(
  p_event_id uuid,
  p_item_id uuid,
  p_counted_qty_base numeric,
  p_notes text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current numeric;
  v_diff numeric;
  v_unit_cost numeric;
  v_notes text;
  v_item record;
begin
  perform private.require_operator();

  if p_event_id is null or p_item_id is null then
    raise exception 'El evento y el insumo son obligatorios' using errcode = '22023';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  select id, avg_cost
  into v_item
  from public.inventory_items
  where id = p_item_id;

  if not found then
    raise exception 'Insumo no encontrado' using errcode = '22023';
  end if;

  if p_counted_qty_base is null or p_counted_qty_base < 0 then
    raise exception 'El conteo no puede ser negativo' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  select coalesce(sum(qty_base), 0)
  into v_current
  from public.event_inventory_movements
  where event_id = p_event_id
    and item_id = p_item_id;

  v_diff := round(p_counted_qty_base - v_current, 4);

  if v_diff = 0 then
    return 0;
  end if;

  select coalesce(
    (
      select sum(em.total_cost) / nullif(sum(em.qty_base), 0)
      from public.event_inventory_movements em
      where em.event_id = p_event_id
        and em.item_id = p_item_id
        and em.movement_type = 'purchase'
    ),
    v_item.avg_cost
  )
  into v_unit_cost;

  insert into public.event_inventory_movements (
    event_id,
    item_id,
    movement_type,
    qty_base,
    unit_cost,
    total_cost,
    notes,
    occurred_at,
    created_by
  )
  values (
    p_event_id,
    p_item_id,
    'adjustment',
    v_diff,
    v_unit_cost,
    round(abs(v_diff) * v_unit_cost, 2),
    coalesce(nullif(v_notes, ''), 'Ajuste de inventario del evento'),
    now(),
    auth.uid()
  );

  return v_diff;
end;
$$;

revoke all on function public.adjust_event_inventory_item(uuid, uuid, numeric, text)
  from public, anon;
grant execute on function public.adjust_event_inventory_item(uuid, uuid, numeric, text)
  to authenticated;

create or replace function public.transfer_event_inventory_to_general(
  p_event_id uuid,
  p_item_id uuid,
  p_qty_base numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_item record;
  v_current numeric;
  v_event_cost numeric;
  v_notes text;
  v_movement_id uuid;
begin
  perform private.require_operator();
  perform private.require_adjust_inventory();

  select id, folio, status into v_event from public.events where id = p_event_id;

  if not found then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  if v_event.status <> 'closed' then
    raise exception 'Cierra el evento antes de transferir sobrantes' using errcode = '22023';
  end if;

  select id, avg_cost, track_stock
  into v_item
  from public.inventory_items
  where id = p_item_id;

  if not found or not v_item.track_stock then
    raise exception 'Insumo inválido para transferencia' using errcode = '22023';
  end if;

  if p_qty_base is null or p_qty_base <= 0 then
    raise exception 'La cantidad a transferir es inválida' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  select coalesce(sum(qty_base), 0)
  into v_current
  from public.event_inventory_movements
  where event_id = p_event_id
    and item_id = p_item_id;

  if p_qty_base > v_current then
    raise exception 'No hay suficiente stock del insumo en el evento' using errcode = '22023';
  end if;

  select coalesce(
    (
      select sum(em.total_cost) / nullif(sum(em.qty_base), 0)
      from public.event_inventory_movements em
      where em.event_id = p_event_id
        and em.item_id = p_item_id
        and em.movement_type = 'purchase'
    ),
    v_item.avg_cost
  )
  into v_event_cost;

  insert into public.event_inventory_movements (
    event_id,
    item_id,
    movement_type,
    qty_base,
    unit_cost,
    total_cost,
    notes,
    occurred_at,
    created_by
  )
  values (
    p_event_id,
    p_item_id,
    'transfer_out',
    -p_qty_base,
    v_event_cost,
    round(p_qty_base * v_event_cost, 2),
    coalesce(nullif(v_notes, ''), 'Traspaso de sobrantes a inventario general'),
    now(),
    auth.uid()
  );

  insert into public.inventory_movements (
    item_id,
    movement_type,
    qty_base,
    unit_cost,
    total_cost,
    event_id,
    notes,
    occurred_at,
    created_by
  )
  values (
    p_item_id,
    'transfer',
    p_qty_base,
    v_item.avg_cost,
    round(p_qty_base * v_item.avg_cost, 2),
    p_event_id,
    coalesce(nullif(v_notes, ''), 'Sobrante del evento ' || v_event.folio),
    now(),
    auth.uid()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

revoke all on function public.transfer_event_inventory_to_general(uuid, uuid, numeric, text)
  from public, anon;
grant execute on function public.transfer_event_inventory_to_general(uuid, uuid, numeric, text)
  to authenticated;

create or replace function public.create_event_sale(
  p_client_id uuid,
  p_event_id uuid,
  p_items jsonb,
  p_apply_promotion boolean,
  p_bundle_qty integer,
  p_bundle_price numeric,
  p_payment_method text,
  p_notes text,
  p_sold_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_sale_id uuid;
  v_event record;
  v_totals jsonb;
  v_notes text;
  v_client_id uuid := coalesce(p_client_id, gen_random_uuid());
  v_sold_at timestamptz := coalesce(p_sold_at, now());
  v_promotion_applied boolean := coalesce(p_apply_promotion, false);
  v_bundle_qty integer;
  v_bundle_price numeric;
begin
  perform private.require_operator();

  select id into v_existing_id from public.event_sales where client_id = v_client_id;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select status into v_event from public.events where id = p_event_id;

  if not found then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  if v_event.status <> 'open' then
    raise exception 'El evento está cerrado' using errcode = '22023';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'other') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  if v_promotion_applied then
    if p_bundle_qty is null or p_bundle_qty < 2 then
      raise exception 'La cantidad de la promoción es inválida' using errcode = '22023';
    end if;

    if p_bundle_price is null or p_bundle_price < 0 then
      raise exception 'El precio de la promoción es inválido' using errcode = '22023';
    end if;

    v_bundle_qty := p_bundle_qty;
    v_bundle_price := round(p_bundle_price, 2);
  else
    v_bundle_qty := null;
    v_bundle_price := null;
  end if;

  v_totals := private.event_sale_totals(
    p_items,
    coalesce(v_bundle_qty, 2),
    coalesce(v_bundle_price, 0),
    v_promotion_applied
  );

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    where btrim(coalesce(item->>'product_name', '')) = ''
      or length(btrim(coalesce(item->>'product_name', ''))) > 200
  ) then
    raise exception 'El nombre de una bebida es inválido' using errcode = '22023';
  end if;

  insert into public.event_sales (
    client_id,
    event_id,
    sold_at,
    payment_method,
    gross_total,
    discount_total,
    total,
    promotion_applied,
    bundle_qty,
    bundle_price,
    notes,
    created_by
  )
  values (
    v_client_id,
    p_event_id,
    v_sold_at,
    p_payment_method,
    (v_totals->>'gross_total')::numeric,
    (v_totals->>'discount_total')::numeric,
    (v_totals->>'total')::numeric,
    v_promotion_applied,
    v_bundle_qty,
    v_bundle_price,
    v_notes,
    auth.uid()
  )
  on conflict (client_id) do nothing
  returning id into v_sale_id;

  if v_sale_id is null then
    select id into v_sale_id from public.event_sales where client_id = v_client_id;
    return v_sale_id;
  end if;

  insert into public.event_sale_items (
    event_sale_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    line_total,
    promotion_eligible,
    notes
  )
  select
    v_sale_id,
    nullif(item->>'product_id', '')::uuid,
    btrim(item->>'product_name'),
    (item->>'quantity')::integer,
    round((item->>'unit_price')::numeric, 2),
    round(
      round((item->>'unit_price')::numeric, 2) * (item->>'quantity')::integer,
      2
    ),
    coalesce((item->>'promotion_eligible')::boolean, true),
    btrim(coalesce(item->>'notes', ''))
  from jsonb_array_elements(p_items) as item;

  perform private.consume_event_sale_inventory(p_event_id, v_sale_id, p_items);

  return v_sale_id;
end;
$$;

revoke all on function public.create_event_sale(
  uuid,
  uuid,
  jsonb,
  boolean,
  integer,
  numeric,
  text,
  text,
  timestamptz
) from public, anon;
grant execute on function public.create_event_sale(
  uuid,
  uuid,
  jsonb,
  boolean,
  integer,
  numeric,
  text,
  text,
  timestamptz
) to authenticated;

create or replace function public.delete_event_sale(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement record;
begin
  perform private.require_admin();

  for v_movement in
    select event_id, item_id, qty_base, unit_cost, total_cost
    from public.event_inventory_movements
    where event_sale_id = p_id
      and movement_type = 'consumption'
  loop
    insert into public.event_inventory_movements (
      event_id,
      item_id,
      movement_type,
      qty_base,
      unit_cost,
      total_cost,
      notes,
      occurred_at,
      created_by
    )
    values (
      v_movement.event_id,
      v_movement.item_id,
      'adjustment',
      -v_movement.qty_base,
      v_movement.unit_cost,
      v_movement.total_cost,
      'Reversa de venta eliminada',
      now(),
      auth.uid()
    );
  end loop;

  delete from public.event_sales where id = p_id;

  if not found then
    raise exception 'Venta no encontrada' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.delete_event_sale(uuid) from public, anon;
grant execute on function public.delete_event_sale(uuid) to authenticated;

create or replace function public.delete_event_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  if exists (
    select 1
    from public.event_inventory_loads
    where event_expense_id = p_id
  ) then
    raise exception 'Este gasto está ligado a una carga de inventario del evento'
      using errcode = '22023';
  end if;

  delete from public.event_expenses where id = p_id;

  if not found then
    raise exception 'Gasto no encontrado' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.delete_event_expense(uuid) from public, anon;
grant execute on function public.delete_event_expense(uuid) to authenticated;

create view public.v_event_inventory_stock
with (security_invoker = true)
as
with totals as (
  select
    event_id,
    item_id,
    sum(case when movement_type = 'purchase' then qty_base else 0 end) as purchased_base,
    sum(case when movement_type = 'consumption' then -qty_base else 0 end) as consumed_base,
    sum(case when movement_type = 'transfer_out' then -qty_base else 0 end) as transferred_base,
    sum(case when movement_type = 'adjustment' then qty_base else 0 end) as adjusted_base,
    sum(case when movement_type = 'waste' then -qty_base else 0 end) as waste_base,
    sum(qty_base) as current_qty_base,
    sum(case when movement_type = 'purchase' then total_cost else 0 end) as purchase_cost,
    sum(case when movement_type = 'purchase' then qty_base else 0 end) as purchase_qty
  from public.event_inventory_movements
  group by event_id, item_id
)
select
  t.event_id,
  t.item_id,
  i.name as item_name,
  i.group_id,
  g.name as group_name,
  g.base_unit,
  i.track_stock,
  t.purchased_base,
  t.consumed_base,
  t.transferred_base,
  t.adjusted_base,
  t.waste_base,
  t.current_qty_base,
  coalesce(t.purchase_cost / nullif(t.purchase_qty, 0), i.avg_cost) as avg_unit_cost,
  round(t.current_qty_base * coalesce(t.purchase_cost / nullif(t.purchase_qty, 0), i.avg_cost), 2)
    as stock_value
from totals t
join public.inventory_items i on i.id = t.item_id
join public.inventory_item_groups g on g.id = i.group_id;

revoke all on public.v_event_inventory_stock from anon, authenticated;
grant select on public.v_event_inventory_stock to authenticated;

create view public.v_event_inventory_loads
with (security_invoker = true)
as
select
  l.id,
  l.client_id,
  l.event_id,
  e.folio as event_folio,
  e.name as event_name,
  l.total_cost,
  l.category,
  l.payment_method,
  l.reference,
  l.notes,
  l.event_expense_id,
  l.created_by,
  pr.full_name as created_by_name,
  l.created_at
from public.event_inventory_loads l
join public.events e on e.id = l.event_id
left join public.profiles pr on pr.id = l.created_by;

revoke all on public.v_event_inventory_loads from anon, authenticated;
grant select on public.v_event_inventory_loads to authenticated;

create view public.v_event_inventory_movements
with (security_invoker = true)
as
select
  m.id,
  m.event_id,
  e.folio as event_folio,
  e.name as event_name,
  m.load_id,
  m.event_sale_id,
  m.item_id,
  i.name as item_name,
  g.name as group_name,
  g.base_unit,
  m.movement_type,
  m.qty_base,
  m.unit_cost,
  m.total_cost,
  m.notes,
  m.occurred_at,
  m.created_by,
  pr.full_name as created_by_name,
  m.created_at
from public.event_inventory_movements m
join public.events e on e.id = m.event_id
join public.inventory_items i on i.id = m.item_id
join public.inventory_item_groups g on g.id = i.group_id
left join public.profiles pr on pr.id = m.created_by;

revoke all on public.v_event_inventory_movements from anon, authenticated;
grant select on public.v_event_inventory_movements to authenticated;

create or replace view public.v_inventory_movements
with (security_invoker = true)
as
select
  m.id,
  m.item_id,
  i.name as item_name,
  i.group_id,
  g.name as group_name,
  g.base_unit,
  m.movement_type,
  m.qty_base,
  m.unit_cost,
  m.total_cost,
  m.purchase_id,
  p.folio as purchase_folio,
  m.notes,
  m.occurred_at,
  m.created_by,
  pr.full_name as created_by_name,
  m.created_at,
  m.bottle_opening_id,
  m.order_id,
  m.order_item_id,
  o.folio as order_folio,
  m.event_id,
  e.folio as event_folio,
  e.name as event_name
from public.inventory_movements m
join public.inventory_items i on i.id = m.item_id
join public.inventory_item_groups g on g.id = i.group_id
left join public.purchases p on p.id = m.purchase_id
left join public.orders o on o.id = m.order_id
left join public.events e on e.id = m.event_id
left join public.profiles pr on pr.id = m.created_by;

revoke all on public.v_inventory_movements from anon, authenticated;
grant select on public.v_inventory_movements to authenticated;
