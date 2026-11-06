create table public.bottle_openings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  opening_date date not null default current_date,
  initial_ml numeric(14, 4) not null check (initial_ml > 0),
  remaining_ml numeric(14, 4) not null check (remaining_ml >= 0),
  status text not null default 'open' check (status in ('open', 'finished')),
  opened_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (remaining_ml <= initial_ml)
);

create index bottle_openings_item_idx on public.bottle_openings (item_id, status);
create index bottle_openings_date_idx on public.bottle_openings (opening_date desc);

alter table public.bottle_openings enable row level security;

create policy bottle_openings_select_active_users
on public.bottle_openings
for select
to authenticated
using (private.is_active_user());

revoke all on public.bottle_openings from anon, authenticated;
grant select on public.bottle_openings to authenticated;

create trigger bottle_openings_set_updated_at
before update on public.bottle_openings
for each row execute function private.set_updated_at();

create trigger bottle_openings_audit
after insert or update or delete on public.bottle_openings
for each row execute function private.audit_trigger();

alter table public.inventory_movements
  add column bottle_opening_id uuid
    references public.bottle_openings (id) on delete set null;

create index inventory_movements_bottle_idx
  on public.inventory_movements (bottle_opening_id);

create view public.v_bottle_openings
with (security_invoker = true)
as
select
  b.id,
  b.item_id,
  i.name as item_name,
  i.group_id,
  g.name as group_name,
  c.name as category_name,
  g.base_unit,
  i.avg_cost,
  b.opening_date,
  b.opened_at,
  b.initial_ml,
  b.remaining_ml,
  round(b.initial_ml - b.remaining_ml, 4) as consumed_ml,
  round(b.remaining_ml * i.avg_cost, 2) as remaining_value,
  b.status,
  b.finished_at,
  b.notes,
  b.created_by,
  pr.full_name as created_by_name,
  b.created_at,
  b.updated_at
from public.bottle_openings b
join public.inventory_items i on i.id = b.item_id
join public.inventory_item_groups g on g.id = i.group_id
left join public.inventory_categories c on c.id = g.category_id
left join public.profiles pr on pr.id = b.created_by;

revoke all on public.v_bottle_openings from anon, authenticated;
grant select on public.v_bottle_openings to authenticated;

create view public.v_bottle_stock
with (security_invoker = true)
as
with movement_totals as (
  select item_id, sum(qty_base) as qty_base
  from public.inventory_movements
  group by item_id
),
open_totals as (
  select item_id, sum(remaining_ml) as remaining_ml, count(*)::integer as open_count
  from public.bottle_openings
  where status = 'open'
  group by item_id
)
select
  i.id as item_id,
  i.name,
  i.group_id,
  g.name as group_name,
  c.name as category_name,
  g.base_unit,
  i.purchase_unit,
  i.purchase_factor,
  i.avg_cost,
  i.track_stock,
  i.active,
  coalesce(m.qty_base, 0) as current_stock_ml,
  coalesce(o.remaining_ml, 0) as open_ml,
  coalesce(m.qty_base, 0) - coalesce(o.remaining_ml, 0) as sealed_ml,
  coalesce(o.open_count, 0) as open_count,
  round(coalesce(o.remaining_ml, 0) * i.avg_cost, 2) as open_value
from public.inventory_items i
join public.inventory_item_groups g on g.id = i.group_id
left join public.inventory_categories c on c.id = g.category_id
left join movement_totals m on m.item_id = i.id
left join open_totals o on o.item_id = i.id;

revoke all on public.v_bottle_stock from anon, authenticated;
grant select on public.v_bottle_stock to authenticated;

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
  m.bottle_opening_id
from public.inventory_movements m
join public.inventory_items i on i.id = m.item_id
join public.inventory_item_groups g on g.id = i.group_id
left join public.purchases p on p.id = m.purchase_id
left join public.profiles pr on pr.id = m.created_by;

revoke all on public.v_inventory_movements from anon, authenticated;
grant select on public.v_inventory_movements to authenticated;

create or replace function public.open_bottle(
  p_item_id uuid,
  p_opening_date date,
  p_initial_ml numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_unit text;
  v_track_stock boolean;
  v_active boolean;
  v_group_name text;
  v_current_stock numeric;
  v_open_ml numeric;
  v_sealed_ml numeric;
  v_notes text;
  v_opening_id uuid;
begin
  perform private.require_adjust_inventory();

  if p_item_id is null then
    raise exception 'El insumo es obligatorio' using errcode = '22023';
  end if;

  if p_opening_date is null then
    raise exception 'La fecha de apertura es obligatoria' using errcode = '22023';
  end if;

  if p_opening_date > current_date then
    raise exception 'La fecha de apertura no puede ser futura' using errcode = '22023';
  end if;

  if p_initial_ml is null or p_initial_ml <= 0 then
    raise exception 'La cantidad inicial debe ser mayor a cero' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));
  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  select i.track_stock, i.active, g.base_unit, g.name
  into v_track_stock, v_active, v_base_unit, v_group_name
  from public.inventory_items i
  join public.inventory_item_groups g on g.id = i.group_id
  where i.id = p_item_id
  for update of i;

  if not found then
    raise exception 'Insumo no encontrado' using errcode = '22023';
  end if;

  if not v_track_stock then
    raise exception 'Este insumo no lleva inventario' using errcode = '22023';
  end if;

  if not v_active then
    raise exception 'El insumo % está inactivo', v_group_name using errcode = '22023';
  end if;

  if v_base_unit <> 'ml' then
    raise exception 'Solo se pueden abrir botellas de insumos líquidos' using errcode = '22023';
  end if;

  select coalesce(sum(qty_base), 0)
  into v_current_stock
  from public.inventory_movements
  where item_id = p_item_id;

  select coalesce(sum(remaining_ml), 0)
  into v_open_ml
  from public.bottle_openings
  where item_id = p_item_id
    and status = 'open';

  v_sealed_ml := v_current_stock - v_open_ml;

  if v_sealed_ml < p_initial_ml then
    raise exception 'No hay suficiente stock sellado para abrir la botella'
      using errcode = '22023';
  end if;

  insert into public.bottle_openings (
    item_id,
    opening_date,
    initial_ml,
    remaining_ml,
    status,
    opened_at,
    notes,
    created_by
  )
  values (
    p_item_id,
    p_opening_date,
    round(p_initial_ml, 4),
    round(p_initial_ml, 4),
    'open',
    (p_opening_date + time '12:00') at time zone 'America/Cancun',
    v_notes,
    auth.uid()
  )
  returning id into v_opening_id;

  return v_opening_id;
end;
$$;

revoke all on function public.open_bottle(uuid, date, numeric, text)
  from public, anon;
grant execute on function public.open_bottle(uuid, date, numeric, text)
  to authenticated;

create or replace function public.consume_open_bottle(
  p_bottle_id uuid,
  p_qty_ml numeric,
  p_notes text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_remaining numeric;
  v_status text;
  v_avg_cost numeric;
  v_notes text;
  v_new_remaining numeric;
begin
  perform private.require_adjust_inventory();

  if p_bottle_id is null then
    raise exception 'La botella es obligatoria' using errcode = '22023';
  end if;

  if p_qty_ml is null or p_qty_ml <= 0 then
    raise exception 'La cantidad consumida debe ser mayor a cero' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));
  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  select b.item_id, b.remaining_ml, b.status, i.avg_cost
  into v_item_id, v_remaining, v_status, v_avg_cost
  from public.bottle_openings b
  join public.inventory_items i on i.id = b.item_id
  where b.id = p_bottle_id
  for update of b;

  if not found then
    raise exception 'Botella no encontrada' using errcode = '22023';
  end if;

  if v_status <> 'open' then
    raise exception 'La botella ya está cerrada' using errcode = '22023';
  end if;

  if p_qty_ml > v_remaining then
    raise exception 'La cantidad supera el contenido de la botella' using errcode = '22023';
  end if;

  insert into public.inventory_movements (
    item_id,
    movement_type,
    qty_base,
    unit_cost,
    total_cost,
    notes,
    occurred_at,
    created_by,
    bottle_opening_id
  )
  values (
    v_item_id,
    'consumption',
    -round(p_qty_ml, 4),
    v_avg_cost,
    round(p_qty_ml * v_avg_cost, 2),
    'Consumo de botella' || case when v_notes <> '' then ' · ' || v_notes else '' end,
    now(),
    auth.uid(),
    p_bottle_id
  );

  v_new_remaining := round(v_remaining - p_qty_ml, 4);

  update public.bottle_openings
  set
    remaining_ml = v_new_remaining,
    status = case when v_new_remaining = 0 then 'finished' else 'open' end,
    finished_at = case when v_new_remaining = 0 then now() else null end
  where id = p_bottle_id;

  return v_new_remaining;
end;
$$;

revoke all on function public.consume_open_bottle(uuid, numeric, text)
  from public, anon;
grant execute on function public.consume_open_bottle(uuid, numeric, text)
  to authenticated;

create or replace function public.close_open_bottle(
  p_bottle_id uuid,
  p_leftover_ml numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_remaining numeric;
  v_status text;
  v_avg_cost numeric;
  v_notes text;
  v_current_stock numeric;
  v_consumed numeric;
  v_leftover numeric;
  v_movement_id uuid;
begin
  perform private.require_adjust_inventory();

  if p_bottle_id is null then
    raise exception 'La botella es obligatoria' using errcode = '22023';
  end if;

  if p_leftover_ml is null or p_leftover_ml < 0 then
    raise exception 'El sobrante no puede ser negativo' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));
  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  select b.item_id, b.remaining_ml, b.status, i.avg_cost
  into v_item_id, v_remaining, v_status, v_avg_cost
  from public.bottle_openings b
  join public.inventory_items i on i.id = b.item_id
  where b.id = p_bottle_id
  for update of b;

  if not found then
    raise exception 'Botella no encontrada' using errcode = '22023';
  end if;

  if v_status <> 'open' then
    raise exception 'La botella ya está cerrada' using errcode = '22023';
  end if;

  if p_leftover_ml > v_remaining then
    raise exception 'El sobrante supera el contenido de la botella' using errcode = '22023';
  end if;

  select coalesce(sum(qty_base), 0)
  into v_current_stock
  from public.inventory_movements
  where item_id = v_item_id;

  if v_current_stock < v_remaining then
    raise exception 'Stock insuficiente para cerrar la botella' using errcode = '22023';
  end if;

  v_leftover := round(p_leftover_ml, 4);
  v_consumed := round(v_remaining - v_leftover, 4);

  if v_consumed > 0 then
    insert into public.inventory_movements (
      item_id,
      movement_type,
      qty_base,
      unit_cost,
      total_cost,
      notes,
      occurred_at,
      created_by,
      bottle_opening_id
    )
    values (
      v_item_id,
      'consumption',
      -v_consumed,
      v_avg_cost,
      round(v_consumed * v_avg_cost, 2),
      'Consumo de botella (cierre)'
        || case when v_notes <> '' then ' · ' || v_notes else '' end,
      now(),
      auth.uid(),
      p_bottle_id
    );
  end if;

  if v_leftover > 0 then
    insert into public.inventory_movements (
      item_id,
      movement_type,
      qty_base,
      unit_cost,
      total_cost,
      notes,
      occurred_at,
      created_by,
      bottle_opening_id
    )
    values (
      v_item_id,
      'waste',
      -v_leftover,
      v_avg_cost,
      round(v_leftover * v_avg_cost, 2),
      'Merma: Fondo de botella'
        || case when v_notes <> '' then ' · ' || v_notes else '' end,
      now(),
      auth.uid(),
      p_bottle_id
    )
    returning id into v_movement_id;

    insert into public.inventory_waste (
      waste_date,
      item_id,
      qty_base,
      reason,
      unit_cost,
      total_cost,
      movement_id,
      notes,
      created_by
    )
    values (
      current_date,
      v_item_id,
      v_leftover,
      'fondo_botella',
      v_avg_cost,
      round(v_leftover * v_avg_cost, 2),
      v_movement_id,
      v_notes,
      auth.uid()
    );
  end if;

  update public.bottle_openings
  set
    remaining_ml = 0,
    status = 'finished',
    finished_at = now()
  where id = p_bottle_id;
end;
$$;

revoke all on function public.close_open_bottle(uuid, numeric, text)
  from public, anon;
grant execute on function public.close_open_bottle(uuid, numeric, text)
  to authenticated;
