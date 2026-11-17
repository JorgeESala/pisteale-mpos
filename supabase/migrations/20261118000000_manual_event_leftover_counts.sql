create table public.event_leftover_counts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity numeric(14, 4) not null check (quantity >= 0),
  unit text not null,
  unit_factor numeric(14, 4) not null check (unit_factor > 0),
  base_qty numeric(14, 4) not null check (base_qty >= 0),
  unit_cost numeric(14, 6) not null check (unit_cost >= 0),
  value numeric(14, 2) not null check (value >= 0),
  notes text not null default '',
  counted_by uuid references public.profiles (id) on delete set null,
  counted_by_name text not null default '',
  counted_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_by_name text not null default '',
  updated_at timestamptz not null default now(),
  unique (event_id, item_id)
);

create index event_leftover_counts_event_idx
  on public.event_leftover_counts (event_id, item_id);

alter table public.event_leftover_counts enable row level security;

create policy event_leftover_counts_select_active_users
on public.event_leftover_counts
for select
to authenticated
using (private.is_active_user());

revoke all on public.event_leftover_counts from anon, authenticated;
grant select on public.event_leftover_counts to authenticated;

create trigger event_leftover_counts_audit
after insert or update or delete on public.event_leftover_counts
for each row execute function private.audit_trigger();

create or replace view public.v_event_leftover_counts
with (security_invoker = true)
as
select
  c.id,
  c.event_id,
  c.item_id,
  i.name as item_name,
  g.name as group_name,
  g.base_unit,
  i.purchase_unit,
  i.purchase_factor,
  c.quantity,
  c.unit,
  c.unit_factor,
  c.base_qty,
  c.unit_cost,
  c.value,
  c.notes,
  c.counted_by,
  c.counted_by_name,
  c.counted_at,
  c.updated_by,
  c.updated_by_name,
  c.updated_at
from public.event_leftover_counts c
join public.inventory_items i on i.id = c.item_id
join public.inventory_item_groups g on g.id = i.group_id;

revoke all on public.v_event_leftover_counts from anon, authenticated;
grant select on public.v_event_leftover_counts to authenticated;

create or replace view public.v_event_inventory_stock
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
    as stock_value,
  i.purchase_unit,
  i.purchase_factor
from totals t
join public.inventory_items i on i.id = t.item_id
join public.inventory_item_groups g on g.id = i.group_id;

revoke all on public.v_event_inventory_stock from anon, authenticated;
grant select on public.v_event_inventory_stock to authenticated;

alter table public.event_finance_edits
  drop constraint if exists event_finance_edits_entity_type_check;

alter table public.event_finance_edits
  add constraint event_finance_edits_entity_type_check
  check (entity_type in ('inventory_load', 'expense', 'leftover_count'));

create or replace function public.save_event_leftover_counts(
  p_event_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_name text;
  v_old_total numeric;
  v_new_total numeric;
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_active_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_event_id is null or not exists (
    select 1 from public.events where id = p_event_id
  ) then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'El conteo debe ser una lista' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 500 then
    raise exception 'El conteo tiene demasiados insumos' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as e
    left join public.inventory_items i
      on i.id = nullif(e->>'item_id', '')::uuid
    left join public.inventory_item_groups g on g.id = i.group_id
    where i.id is null
      or (e->>'quantity') is null
      or (e->>'quantity')::numeric < 0
      or (e->>'unit_factor') is null
      or (e->>'unit_factor')::numeric <= 0
      or btrim(coalesce(e->>'unit', '')) = ''
      or (e->>'unit') not in (g.base_unit, i.purchase_unit)
      or (
        (e->>'unit') = g.base_unit
        and (e->>'unit_factor')::numeric <> 1
      )
      or not exists (
        select 1
        from public.v_event_inventory_stock s
        where s.event_id = p_event_id
          and s.item_id = i.id
      )
  ) then
    raise exception 'Insumo, cantidad o unidad inválida en el conteo' using errcode = '22023';
  end if;

  select coalesce(sum(value), 0)
  into v_old_total
  from public.event_leftover_counts
  where event_id = p_event_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', item_id,
      'quantity', quantity,
      'unit', unit,
      'unit_factor', unit_factor,
      'base_qty', base_qty,
      'unit_cost', unit_cost,
      'value', value
    )
    order by item_id
  ), '[]'::jsonb)
  into v_before
  from public.event_leftover_counts
  where event_id = p_event_id;

  drop table if exists pg_temp.leftover_input;

  create temp table pg_temp.leftover_input on commit drop as
  select
    i.id as item_id,
    (e->>'quantity')::numeric as quantity,
    btrim(e->>'unit') as unit,
    (e->>'unit_factor')::numeric as unit_factor,
    round((e->>'quantity')::numeric * (e->>'unit_factor')::numeric, 4) as base_qty,
    coalesce(s.avg_unit_cost, i.avg_cost) as unit_cost,
    round(
      round((e->>'quantity')::numeric * (e->>'unit_factor')::numeric, 4)
      * coalesce(s.avg_unit_cost, i.avg_cost),
      2
    ) as value,
    btrim(coalesce(e->>'notes', '')) as notes
  from jsonb_array_elements(p_items) as e
  join public.inventory_items i on i.id = (e->>'item_id')::uuid
  join public.v_event_inventory_stock s
    on s.event_id = p_event_id
   and s.item_id = i.id;

  select full_name into v_user_name
  from public.profiles
  where id = auth.uid();

  insert into public.event_leftover_counts (
    event_id,
    item_id,
    quantity,
    unit,
    unit_factor,
    base_qty,
    unit_cost,
    value,
    notes,
    counted_by,
    counted_by_name,
    counted_at,
    updated_by,
    updated_by_name,
    updated_at
  )
  select
    p_event_id,
    t.item_id,
    t.quantity,
    t.unit,
    t.unit_factor,
    t.base_qty,
    t.unit_cost,
    t.value,
    t.notes,
    auth.uid(),
    coalesce(v_user_name, ''),
    now(),
    auth.uid(),
    coalesce(v_user_name, ''),
    now()
  from pg_temp.leftover_input t
  on conflict (event_id, item_id) do update
  set
    quantity = excluded.quantity,
    unit = excluded.unit,
    unit_factor = excluded.unit_factor,
    base_qty = excluded.base_qty,
    unit_cost = excluded.unit_cost,
    value = excluded.value,
    notes = excluded.notes,
    counted_by = excluded.counted_by,
    counted_by_name = excluded.counted_by_name,
    counted_at = excluded.counted_at,
    updated_by = excluded.updated_by,
    updated_by_name = excluded.updated_by_name,
    updated_at = now();

  select coalesce(sum(value), 0)
  into v_new_total
  from public.event_leftover_counts
  where event_id = p_event_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', item_id,
      'quantity', quantity,
      'unit', unit,
      'unit_factor', unit_factor,
      'base_qty', base_qty,
      'unit_cost', unit_cost,
      'value', value
    )
    order by item_id
  ), '[]'::jsonb)
  into v_after
  from public.event_leftover_counts
  where event_id = p_event_id;

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
    'leftover_count',
    p_event_id,
    auth.uid(),
    coalesce(v_user_name, ''),
    format('Conteo de sobrantes · total %s → %s', round(v_old_total, 2), round(v_new_total, 2)),
    v_before,
    v_after
  );

  drop table if exists pg_temp.leftover_input;
end;
$$;

revoke all on function public.save_event_leftover_counts(uuid, jsonb)
  from public, anon;
grant execute on function public.save_event_leftover_counts(uuid, jsonb)
  to authenticated;

create or replace view public.v_events
with (security_invoker = true)
as
select
  e.id,
  e.folio,
  e.name,
  e.venue,
  e.event_date,
  e.start_time,
  e.end_time,
  e.status,
  e.promotion_enabled,
  e.bundle_qty,
  e.bundle_price,
  e.opening_cash,
  e.notes,
  e.created_by,
  pr.full_name as created_by_name,
  e.created_at,
  e.updated_at,
  s.sales_count,
  d.drinks_count,
  s.gross_sales,
  s.discount_total,
  s.sales_total,
  x.expenses_total,
  x.expenses_count,
  round(s.sales_total - x.expenses_total, 2) as profit,
  case
    when s.sales_total > 0 then
      round((s.sales_total - x.expenses_total) / s.sales_total * 100, 1)
    else null
  end as margin_percent,
  f.supply_expenses_total,
  f.other_expenses_total,
  round(inv.inventory_current_value, 2) as inventory_current_value,
  round(inv.inventory_transferred_value, 2) as inventory_transferred_value,
  round(lc.manual_leftover_value, 2) as inventory_leftover_value,
  inv.negative_stock_count,
  round(inv.negative_stock_value, 2) as negative_stock_value,
  round(
    s.sales_total - x.expenses_total + lc.manual_leftover_value,
    2
  ) as result_total,
  case
    when s.sales_total > 0 then
      round(
        (s.sales_total - x.expenses_total + lc.manual_leftover_value)
        / s.sales_total
        * 100,
        1
      )
    else null
  end as result_margin_percent,
  s.promotion_sales_count,
  s.regular_sales_count,
  round(lc.manual_leftover_value, 2) as manual_leftover_value,
  round(inv.inventory_current_value + inv.inventory_transferred_value, 2)
    as automatic_inventory_value,
  inv.leftover_item_count,
  lc.leftover_counted_items,
  (lc.leftover_counted_items >= inv.leftover_item_count) as leftover_count_complete
from public.events e
left join public.profiles pr on pr.id = e.created_by
left join lateral (
  select
    count(*)::integer as sales_count,
    count(*) filter (where es.promotion_applied)::integer as promotion_sales_count,
    count(*) filter (where not es.promotion_applied)::integer as regular_sales_count,
    coalesce(sum(es.gross_total), 0) as gross_sales,
    coalesce(sum(es.discount_total), 0) as discount_total,
    coalesce(sum(es.total), 0) as sales_total
  from public.event_sales es
  where es.event_id = e.id
) s on true
left join lateral (
  select coalesce(sum(esi.quantity), 0)::integer as drinks_count
  from public.event_sales es
  join public.event_sale_items esi on esi.event_sale_id = es.id
  where es.event_id = e.id
) d on true
left join lateral (
  select
    coalesce(sum(ex.amount), 0) as expenses_total,
    count(*)::integer as expenses_count
  from public.event_expenses ex
  where ex.event_id = e.id
) x on true
left join lateral (
  select
    coalesce(sum(
      case
        when exists (
          select 1
          from public.event_inventory_loads l
          where l.event_expense_id = ex.id
        ) then ex.amount
        else 0
      end
    ), 0) as supply_expenses_total,
    coalesce(sum(
      case
        when exists (
          select 1
          from public.event_inventory_loads l
          where l.event_expense_id = ex.id
        ) then 0
        else ex.amount
      end
    ), 0) as other_expenses_total
  from public.event_expenses ex
  where ex.event_id = e.id
) f on true
left join lateral (
  select
    coalesce(sum(s.stock_value), 0) as inventory_current_value,
    coalesce(sum(s.transferred_base * s.avg_unit_cost), 0)
      as inventory_transferred_value,
    count(*)::integer as leftover_item_count,
    count(*) filter (where s.current_qty_base < 0)::integer as negative_stock_count,
    coalesce(sum(
      case
        when s.current_qty_base < 0 then s.stock_value
        else 0
      end
    ), 0) as negative_stock_value
  from public.v_event_inventory_stock s
  where s.event_id = e.id
) inv on true
left join lateral (
  select
    coalesce(sum(lc.value), 0) as manual_leftover_value,
    count(*)::integer as leftover_counted_items
  from public.event_leftover_counts lc
  where lc.event_id = e.id
) lc on true;

revoke all on public.v_events from anon, authenticated;
grant select on public.v_events to authenticated;
