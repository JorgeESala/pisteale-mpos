create table public.orders (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  sold_at timestamptz not null default now(),
  status text not null default 'paid' check (status in ('paid', 'cancelled')),
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  tip_total numeric(14, 2) not null default 0 check (tip_total >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  cost_total numeric(14, 2) check (cost_total is null or cost_total >= 0),
  inventory_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(inventory_warnings) = 'array'),
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  tier text not null check (tier in ('normal', 'premium')),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  unit_cost numeric(14, 2) check (unit_cost is null or unit_cost >= 0),
  line_cost numeric(14, 2) check (line_cost is null or line_cost >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method text not null
    check (method in ('cash', 'card', 'transfer', 'other')),
  amount numeric(14, 2) not null check (amount > 0),
  tip_amount numeric(14, 2) not null default 0 check (tip_amount >= 0),
  reference text not null default '',
  paid_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
create index payments_order_idx on public.payments (order_id);
create index orders_sold_at_idx on public.orders (sold_at desc);

alter table public.inventory_movements
  add column order_id uuid references public.orders (id) on delete set null,
  add column order_item_id uuid references public.order_items (id) on delete set null;

create index inventory_movements_order_idx on public.inventory_movements (order_id);
create index inventory_movements_order_item_idx on public.inventory_movements (order_item_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

create policy orders_select_active_users
on public.orders
for select
to authenticated
using (private.is_active_user());

create policy order_items_select_active_users
on public.order_items
for select
to authenticated
using (private.is_active_user());

create policy payments_select_active_users
on public.payments
for select
to authenticated
using (private.is_active_user());

revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.payments from anon, authenticated;

grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select on public.payments to authenticated;

create trigger orders_set_updated_at
before update on public.orders
for each row execute function private.set_updated_at();

create trigger orders_audit
after insert or update or delete on public.orders
for each row execute function private.audit_trigger();

create trigger order_items_audit
after insert or update or delete on public.order_items
for each row execute function private.audit_trigger();

create trigger payments_audit
after insert or update or delete on public.payments
for each row execute function private.audit_trigger();

create or replace view public.v_inventory_stock
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
    when coalesce(m.qty_base, 0) < 0 then 'negative'
    when coalesce(m.qty_base, 0) = 0 then 'out'
    when coalesce(m.qty_base, 0) <= i.min_stock_base then 'low'
    else 'ok'
  end as stock_status
from public.inventory_items i
join public.inventory_item_groups g on g.id = i.group_id
left join public.inventory_categories c on c.id = g.category_id
left join movement_totals m on m.item_id = i.id;

revoke all on public.v_inventory_stock from anon, authenticated;
grant select on public.v_inventory_stock to authenticated;

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
  o.folio as order_folio
from public.inventory_movements m
join public.inventory_items i on i.id = m.item_id
join public.inventory_item_groups g on g.id = i.group_id
left join public.purchases p on p.id = m.purchase_id
left join public.orders o on o.id = m.order_id
left join public.profiles pr on pr.id = m.created_by;

revoke all on public.v_inventory_movements from anon, authenticated;
grant select on public.v_inventory_movements to authenticated;

create view public.v_orders
with (security_invoker = true)
as
select
  o.id,
  o.folio,
  o.sold_at,
  (o.sold_at at time zone 'America/Cancun')::date as sale_date,
  o.status,
  o.subtotal,
  o.tip_total,
  o.total,
  o.cost_total,
  case when o.cost_total is null then null else round(o.subtotal - o.cost_total, 2) end as margin,
  (
    select count(*)::integer
    from public.order_items oi
    where oi.order_id = o.id
  ) as item_count,
  (
    select string_agg(distinct pay.method, ', ')
    from public.payments pay
    where pay.order_id = o.id
  ) as payment_methods,
  (
    select coalesce(sum(pay.amount), 0)
    from public.payments pay
    where pay.order_id = o.id
  ) as payment_total,
  jsonb_array_length(o.inventory_warnings) as warning_count,
  o.created_by,
  pr.full_name as created_by_name,
  o.notes,
  o.created_at,
  o.updated_at
from public.orders o
left join public.profiles pr on pr.id = o.created_by;

revoke all on public.v_orders from anon, authenticated;
grant select on public.v_orders to authenticated;

create view public.v_order_items
with (security_invoker = true)
as
select
  oi.id,
  oi.order_id,
  o.folio,
  o.sold_at,
  (o.sold_at at time zone 'America/Cancun')::date as sale_date,
  oi.product_id,
  oi.product_name,
  oi.tier,
  oi.quantity,
  oi.unit_price,
  oi.line_total,
  oi.unit_cost,
  oi.line_cost,
  oi.notes,
  oi.created_at
from public.order_items oi
join public.orders o on o.id = oi.order_id;

revoke all on public.v_order_items from anon, authenticated;
grant select on public.v_order_items to authenticated;

create view public.v_payments
with (security_invoker = true)
as
select
  pay.id,
  pay.order_id,
  o.folio,
  pay.method,
  pay.amount,
  pay.tip_amount,
  pay.reference,
  pay.paid_at,
  pay.created_by,
  pr.full_name as created_by_name,
  pay.created_at
from public.payments pay
join public.orders o on o.id = pay.order_id
left join public.profiles pr on pr.id = pay.created_by;

revoke all on public.v_payments from anon, authenticated;
grant select on public.v_payments to authenticated;
