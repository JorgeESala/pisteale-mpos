create table public.inventory_waste (
  id uuid primary key default gen_random_uuid(),
  waste_date date not null default current_date,
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  qty_base numeric(14, 4) not null check (qty_base > 0),
  reason text not null
    check (reason in ('fondo_botella', 'producto_vencido', 'derrame', 'otro')),
  unit_cost numeric(14, 6) not null default 0 check (unit_cost >= 0),
  total_cost numeric(14, 2) not null default 0 check (total_cost >= 0),
  movement_id uuid not null unique references public.inventory_movements (id) on delete restrict,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index inventory_waste_date_idx on public.inventory_waste (waste_date desc);
create index inventory_waste_item_idx on public.inventory_waste (item_id, waste_date desc);

alter table public.inventory_waste enable row level security;

create policy inventory_waste_select_active_users
on public.inventory_waste
for select
to authenticated
using (private.is_active_user());

revoke all on public.inventory_waste from anon, authenticated;
grant select on public.inventory_waste to authenticated;

create trigger inventory_waste_audit
after insert or update or delete on public.inventory_waste
for each row execute function private.audit_trigger();

create view public.v_inventory_waste
with (security_invoker = true)
as
select
  w.id,
  w.waste_date,
  w.item_id,
  i.name as item_name,
  i.group_id,
  g.name as group_name,
  c.name as category_name,
  g.base_unit,
  w.qty_base,
  w.reason,
  w.unit_cost,
  w.total_cost,
  w.movement_id,
  w.notes,
  w.created_by,
  pr.full_name as created_by_name,
  w.created_at
from public.inventory_waste w
join public.inventory_items i on i.id = w.item_id
join public.inventory_item_groups g on g.id = i.group_id
left join public.inventory_categories c on c.id = g.category_id
left join public.profiles pr on pr.id = w.created_by;

revoke all on public.v_inventory_waste from anon, authenticated;
grant select on public.v_inventory_waste to authenticated;

create or replace function public.create_inventory_waste(
  p_item_id uuid,
  p_waste_date date,
  p_qty_base numeric,
  p_reason text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avg_cost numeric;
  v_track_stock boolean;
  v_group_name text;
  v_current_qty numeric;
  v_notes text;
  v_reason_label text;
  v_movement_id uuid;
  v_waste_id uuid;
  v_qty_base numeric;
begin
  perform private.require_adjust_inventory();

  if p_item_id is null then
    raise exception 'El insumo es obligatorio' using errcode = '22023';
  end if;

  if p_waste_date is null then
    raise exception 'La fecha de merma es obligatoria' using errcode = '22023';
  end if;

  if p_waste_date > current_date then
    raise exception 'La fecha de merma no puede ser futura' using errcode = '22023';
  end if;

  if p_qty_base is null or p_qty_base <= 0 then
    raise exception 'La cantidad de merma debe ser mayor a cero' using errcode = '22023';
  end if;

  if p_reason is null
    or p_reason not in ('fondo_botella', 'producto_vencido', 'derrame', 'otro') then
    raise exception 'Motivo de merma inválido' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));
  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  select i.avg_cost, i.track_stock, g.name
  into v_avg_cost, v_track_stock, v_group_name
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

  select coalesce(sum(qty_base), 0)
  into v_current_qty
  from public.inventory_movements
  where item_id = p_item_id;

  v_qty_base := round(p_qty_base, 4);

  if v_current_qty < v_qty_base then
    raise exception 'Stock insuficiente para el insumo %', v_group_name using errcode = '22023';
  end if;

  v_reason_label := case p_reason
    when 'fondo_botella' then 'Fondo de botella'
    when 'producto_vencido' then 'Producto vencido'
    when 'derrame' then 'Derrame'
    else 'Otro'
  end;

  insert into public.inventory_movements (
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
    p_item_id,
    'waste',
    -v_qty_base,
    v_avg_cost,
    round(v_qty_base * v_avg_cost, 2),
    'Merma: ' || v_reason_label
      || case when v_notes <> '' then ' · ' || v_notes else '' end,
    (p_waste_date + time '12:00') at time zone 'America/Cancun',
    auth.uid()
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
    p_waste_date,
    p_item_id,
    v_qty_base,
    p_reason,
    v_avg_cost,
    round(v_qty_base * v_avg_cost, 2),
    v_movement_id,
    v_notes,
    auth.uid()
  )
  returning id into v_waste_id;

  return v_waste_id;
end;
$$;

revoke all on function public.create_inventory_waste(uuid, date, numeric, text, text)
  from public, anon;
grant execute on function public.create_inventory_waste(uuid, date, numeric, text, text)
  to authenticated;
