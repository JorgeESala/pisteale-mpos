create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  bundle_qty integer not null default 2 check (bundle_qty > 0),
  fixed_price numeric(12, 2) not null check (fixed_price >= 0),
  applies_to text not null default 'any'
    check (applies_to in ('any', 'alcoholic', 'non_alcoholic')),
  applies_to_tier text not null default 'any'
    check (applies_to_tier in ('any', 'normal', 'premium')),
  include_category_ids uuid[] not null default '{}'::uuid[],
  exclude_category_ids uuid[] not null default '{}'::uuid[],
  automatic boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_promotions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  promotion_id uuid references public.promotions (id) on delete set null,
  promotion_name text not null,
  automatic boolean not null default false,
  bundle_qty integer not null check (bundle_qty > 0),
  applications integer not null check (applications > 0),
  gross_amount numeric(14, 2) not null check (gross_amount >= 0),
  discount_amount numeric(14, 2) not null check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.orders
  add column gross_total numeric(14, 2) not null default 0 check (gross_total >= 0),
  add column discount_total numeric(14, 2) not null default 0 check (discount_total >= 0);

update public.orders
set gross_total = subtotal
where gross_total = 0
  and subtotal > 0;

create index order_promotions_order_idx on public.order_promotions (order_id);
create index promotions_active_idx on public.promotions (active, automatic, sort_order);

alter table public.promotions enable row level security;
alter table public.order_promotions enable row level security;

create policy promotions_select_active_users
on public.promotions
for select
to authenticated
using (private.is_active_user());

create policy order_promotions_select_active_users
on public.order_promotions
for select
to authenticated
using (private.is_active_user());

revoke all on public.promotions from anon, authenticated;
revoke all on public.order_promotions from anon, authenticated;
grant select on public.promotions to authenticated;
grant select on public.order_promotions to authenticated;

create trigger promotions_set_updated_at
before update on public.promotions
for each row execute function private.set_updated_at();

create trigger promotions_audit
after insert or update or delete on public.promotions
for each row execute function private.audit_trigger();

create trigger order_promotions_audit
after insert or update or delete on public.order_promotions
for each row execute function private.audit_trigger();

insert into public.promotions (
  name,
  bundle_qty,
  fixed_price,
  applies_to,
  applies_to_tier,
  exclude_category_ids,
  automatic,
  active,
  sort_order
)
select
  '2 x $180',
  2,
  180,
  'alcoholic',
  'normal',
  coalesce(
    (select array_agg(id) from public.product_categories where name = 'Vino'),
    '{}'::uuid[]
  ),
  true,
  true,
  10
where not exists (
  select 1 from public.promotions where name = '2 x $180'
);

create or replace view public.v_orders
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
  o.updated_at,
  o.inventory_warnings,
  o.gross_total,
  o.discount_total,
  (
    select count(*)::integer
    from public.order_promotions op
    where op.order_id = o.id
  ) as promotion_count
from public.orders o
left join public.profiles pr on pr.id = o.created_by;

revoke all on public.v_orders from anon, authenticated;
grant select on public.v_orders to authenticated;

create view public.v_order_promotions
with (security_invoker = true)
as
select
  op.id,
  op.order_id,
  o.folio,
  o.sold_at,
  op.promotion_id,
  op.promotion_name,
  op.automatic,
  op.bundle_qty,
  op.applications,
  op.gross_amount,
  op.discount_amount,
  op.created_at
from public.order_promotions op
join public.orders o on o.id = op.order_id;

revoke all on public.v_order_promotions from anon, authenticated;
grant select on public.v_order_promotions to authenticated;

create or replace function public.upsert_promotion(
  p_id uuid,
  p_name text,
  p_bundle_qty integer,
  p_fixed_price numeric,
  p_applies_to text,
  p_applies_to_tier text,
  p_include_category_ids uuid[],
  p_exclude_category_ids uuid[],
  p_automatic boolean,
  p_active boolean,
  p_sort_order integer
)
returns public.promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_promotion public.promotions;
begin
  perform private.require_admin();

  if v_name is null or length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Nombre de promoción inválido' using errcode = '22023';
  end if;

  if p_bundle_qty is null or p_bundle_qty <= 0 then
    raise exception 'Cantidad de la promoción inválida' using errcode = '22023';
  end if;

  if p_fixed_price is null or p_fixed_price < 0 then
    raise exception 'Precio de la promoción inválido' using errcode = '22023';
  end if;

  if p_applies_to not in ('any', 'alcoholic', 'non_alcoholic') then
    raise exception 'Aplicación de promoción inválida' using errcode = '22023';
  end if;

  if p_applies_to_tier not in ('any', 'normal', 'premium') then
    raise exception 'Tier de promoción inválido' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.promotions (
      name,
      bundle_qty,
      fixed_price,
      applies_to,
      applies_to_tier,
      include_category_ids,
      exclude_category_ids,
      automatic,
      active,
      sort_order,
      created_by
    )
    values (
      v_name,
      p_bundle_qty,
      round(p_fixed_price, 2),
      p_applies_to,
      p_applies_to_tier,
      coalesce(p_include_category_ids, '{}'::uuid[]),
      coalesce(p_exclude_category_ids, '{}'::uuid[]),
      coalesce(p_automatic, false),
      coalesce(p_active, true),
      coalesce(p_sort_order, 0),
      auth.uid()
    )
    returning * into v_promotion;
  else
    update public.promotions
    set
      name = v_name,
      bundle_qty = p_bundle_qty,
      fixed_price = round(p_fixed_price, 2),
      applies_to = p_applies_to,
      applies_to_tier = p_applies_to_tier,
      include_category_ids = coalesce(p_include_category_ids, '{}'::uuid[]),
      exclude_category_ids = coalesce(p_exclude_category_ids, '{}'::uuid[]),
      automatic = coalesce(p_automatic, false),
      active = coalesce(p_active, true),
      sort_order = coalesce(p_sort_order, 0)
    where id = p_id
    returning * into v_promotion;

    if v_promotion.id is null then
      raise exception 'Promoción no encontrada' using errcode = 'P0002';
    end if;
  end if;

  return v_promotion;
exception
  when unique_violation then
    raise exception 'Ya existe una promoción con ese nombre' using errcode = '23505';
end;
$$;

revoke all on function public.upsert_promotion(
  uuid, text, integer, numeric, text, text, uuid[], uuid[], boolean, boolean, integer
) from public, anon;
grant execute on function public.upsert_promotion(
  uuid, text, integer, numeric, text, text, uuid[], uuid[], boolean, boolean, integer
) to authenticated;
