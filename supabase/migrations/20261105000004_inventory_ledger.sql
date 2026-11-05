create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  purchase_date date not null default current_date,
  supplier text not null default '',
  invoice_ref text not null default '',
  notes text not null default '',
  total_cost numeric(14, 2) not null default 0 check (total_cost >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  purchase_unit text not null,
  purchase_factor numeric(14, 4) not null check (purchase_factor > 0),
  qty_purchase numeric(14, 4) not null check (qty_purchase > 0),
  qty_base numeric(14, 4) not null check (qty_base > 0),
  total_cost numeric(14, 2) not null check (total_cost >= 0),
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  movement_type text not null
    check (movement_type in ('purchase', 'adjustment', 'opening', 'consumption', 'waste', 'transfer')),
  qty_base numeric(14, 4) not null check (qty_base <> 0),
  unit_cost numeric(14, 6) not null default 0 check (unit_cost >= 0),
  total_cost numeric(14, 2) not null default 0 check (total_cost >= 0),
  purchase_id uuid references public.purchases (id) on delete set null,
  notes text not null default '',
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_item_idx on public.purchase_items (item_id);
create index inventory_movements_item_idx on public.inventory_movements (item_id, occurred_at desc);
create index inventory_movements_occurred_idx on public.inventory_movements (occurred_at desc);
create index inventory_movements_purchase_idx on public.inventory_movements (purchase_id);

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.inventory_movements enable row level security;

create policy purchases_select_active_users
on public.purchases
for select
to authenticated
using (private.is_active_user());

create policy purchase_items_select_active_users
on public.purchase_items
for select
to authenticated
using (private.is_active_user());

create policy inventory_movements_select_active_users
on public.inventory_movements
for select
to authenticated
using (private.is_active_user());

revoke all on public.purchases from anon, authenticated;
revoke all on public.purchase_items from anon, authenticated;
revoke all on public.inventory_movements from anon, authenticated;

grant select on public.purchases to authenticated;
grant select on public.purchase_items to authenticated;
grant select on public.inventory_movements to authenticated;

create trigger purchases_set_updated_at
before update on public.purchases
for each row execute function private.set_updated_at();

create trigger purchases_audit
after insert or update or delete on public.purchases
for each row execute function private.audit_trigger();

create trigger purchase_items_audit
after insert or update or delete on public.purchase_items
for each row execute function private.audit_trigger();

create trigger inventory_movements_audit
after insert or update or delete on public.inventory_movements
for each row execute function private.audit_trigger();

create view public.v_purchases
with (security_invoker = true)
as
select
  p.id,
  p.folio,
  p.purchase_date,
  p.supplier,
  p.invoice_ref,
  p.notes,
  p.total_cost,
  count(pi.id)::integer as item_count,
  p.created_by,
  pr.full_name as created_by_name,
  p.created_at,
  p.updated_at
from public.purchases p
left join public.purchase_items pi on pi.purchase_id = p.id
left join public.profiles pr on pr.id = p.created_by
group by p.id, pr.full_name;

revoke all on public.v_purchases from anon, authenticated;
grant select on public.v_purchases to authenticated;

create view public.v_purchase_items
with (security_invoker = true)
as
select
  pi.id,
  pi.purchase_id,
  pi.item_id,
  i.name as item_name,
  i.group_id,
  g.name as group_name,
  g.base_unit,
  pi.purchase_unit,
  pi.purchase_factor,
  pi.qty_purchase,
  pi.qty_base,
  pi.total_cost,
  round(pi.total_cost / pi.qty_base, 6) as unit_cost_base,
  pi.created_at
from public.purchase_items pi
join public.inventory_items i on i.id = pi.item_id
join public.inventory_item_groups g on g.id = i.group_id;

revoke all on public.v_purchase_items from anon, authenticated;
grant select on public.v_purchase_items to authenticated;

create view public.v_inventory_stock
with (security_invoker = true)
as
with movement_totals as (
  select item_id, sum(qty_base) as qty_base
  from public.inventory_movements
  group by item_id
)
select
  i.id as item_id,
  i.name,
  i.group_id,
  g.name as group_name,
  c.name as category_name,
  g.base_unit,
  i.tier,
  i.kind,
  i.purchase_unit,
  i.purchase_factor,
  i.avg_cost,
  i.min_stock_base,
  i.track_stock,
  i.active,
  coalesce(m.qty_base, 0) as current_qty_base,
  case when i.track_stock then coalesce(m.qty_base, 0) else null end as stock_qty_base,
  round(coalesce(m.qty_base, 0) * i.avg_cost, 2) as stock_value,
  case
    when not i.track_stock then 'no_stock'
    when coalesce(m.qty_base, 0) <= 0 then 'out'
    when coalesce(m.qty_base, 0) <= i.min_stock_base then 'low'
    else 'ok'
  end as stock_status
from public.inventory_items i
join public.inventory_item_groups g on g.id = i.group_id
left join public.inventory_categories c on c.id = g.category_id
left join movement_totals m on m.item_id = i.id;

revoke all on public.v_inventory_stock from anon, authenticated;
grant select on public.v_inventory_stock to authenticated;

create view public.v_inventory_movements
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
  m.created_at
from public.inventory_movements m
join public.inventory_items i on i.id = m.item_id
join public.inventory_item_groups g on g.id = i.group_id
left join public.purchases p on p.id = m.purchase_id
left join public.profiles pr on pr.id = m.created_by;

revoke all on public.v_inventory_movements from anon, authenticated;
grant select on public.v_inventory_movements to authenticated;

create or replace function private.require_adjust_inventory()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('adjust_inventory') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_adjust_inventory() from public, anon, authenticated;

create or replace function public.adjust_inventory_item(
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
  v_current_qty numeric;
  v_diff numeric;
  v_avg_cost numeric;
  v_track_stock boolean;
  v_notes text;
begin
  perform private.require_adjust_inventory();

  if p_item_id is null then
    raise exception 'El insumo es obligatorio' using errcode = '22023';
  end if;

  if p_counted_qty_base is null or p_counted_qty_base < 0 then
    raise exception 'El conteo no puede ser negativo' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));
  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  select avg_cost, track_stock
  into v_avg_cost, v_track_stock
  from public.inventory_items
  where id = p_item_id
  for update;

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

  v_diff := round(p_counted_qty_base - v_current_qty, 4);

  if v_diff = 0 then
    return 0;
  end if;

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
    'adjustment',
    v_diff,
    v_avg_cost,
    round(abs(v_diff) * v_avg_cost, 2),
    coalesce(nullif(v_notes, ''), 'Ajuste de inventario'),
    now(),
    auth.uid()
  );

  return v_diff;
end;
$$;

revoke all on function public.adjust_inventory_item(uuid, numeric, text)
  from public, anon;
grant execute on function public.adjust_inventory_item(uuid, numeric, text)
  to authenticated;

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
      e->>'total_cost' as total_cost
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
