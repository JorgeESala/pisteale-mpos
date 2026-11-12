create table public.events (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  name text not null,
  venue text not null default '',
  event_date date not null,
  start_time time,
  end_time time,
  status text not null default 'open' check (status in ('open', 'closed')),
  promotion_enabled boolean not null default true,
  bundle_qty integer not null default 2 check (bundle_qty > 1),
  bundle_price numeric(12, 2) not null default 180 check (bundle_price >= 0),
  opening_cash numeric(14, 2) not null default 0 check (opening_cash >= 0),
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  sold_at timestamptz not null default now(),
  payment_method text not null check (payment_method in ('cash', 'card', 'transfer', 'other')),
  gross_total numeric(14, 2) not null default 0 check (gross_total >= 0),
  discount_total numeric(14, 2) not null default 0 check (discount_total >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.event_sale_items (
  id uuid primary key default gen_random_uuid(),
  event_sale_id uuid not null references public.event_sales (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  promotion_eligible boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.event_expenses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  category text not null
    check (category in ('supplies', 'ice', 'transport', 'staff', 'permits', 'rent', 'other')),
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'transfer', 'other')),
  reference text not null default '',
  spent_at timestamptz not null default now(),
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_event_date_idx on public.events (event_date desc);
create index events_status_idx on public.events (status, event_date);
create index event_sales_event_idx on public.event_sales (event_id, sold_at desc);
create index event_sales_sold_at_idx on public.event_sales (sold_at desc);
create index event_sale_items_sale_idx on public.event_sale_items (event_sale_id);
create index event_sale_items_product_idx on public.event_sale_items (product_id);
create index event_expenses_event_idx on public.event_expenses (event_id, spent_at desc);
create index event_expenses_spent_at_idx on public.event_expenses (spent_at desc);

alter table public.events enable row level security;
alter table public.event_sales enable row level security;
alter table public.event_sale_items enable row level security;
alter table public.event_expenses enable row level security;

create policy events_select_active_users
on public.events
for select
to authenticated
using (private.is_active_user());

create policy event_sales_select_active_users
on public.event_sales
for select
to authenticated
using (private.is_active_user());

create policy event_sale_items_select_active_users
on public.event_sale_items
for select
to authenticated
using (private.is_active_user());

create policy event_expenses_select_active_users
on public.event_expenses
for select
to authenticated
using (private.is_active_user());

revoke all on public.events from anon, authenticated;
revoke all on public.event_sales from anon, authenticated;
revoke all on public.event_sale_items from anon, authenticated;
revoke all on public.event_expenses from anon, authenticated;

grant select on public.events to authenticated;
grant select on public.event_sales to authenticated;
grant select on public.event_sale_items to authenticated;
grant select on public.event_expenses to authenticated;

create trigger events_set_updated_at
before update on public.events
for each row execute function private.set_updated_at();

create trigger event_expenses_set_updated_at
before update on public.event_expenses
for each row execute function private.set_updated_at();

create trigger events_audit
after insert or update or delete on public.events
for each row execute function private.audit_trigger();

create trigger event_sales_audit
after insert or update or delete on public.event_sales
for each row execute function private.audit_trigger();

create trigger event_sale_items_audit
after insert or update or delete on public.event_sale_items
for each row execute function private.audit_trigger();

create trigger event_expenses_audit
after insert or update or delete on public.event_expenses
for each row execute function private.audit_trigger();

create or replace function private.event_sale_totals(
  p_items jsonb,
  p_bundle_qty integer,
  p_bundle_price numeric,
  p_apply_promotion boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_quantity integer;
  v_unit_price numeric;
  v_gross_total numeric := 0;
  v_ineligible_total numeric := 0;
  v_promo_total numeric := 0;
  v_total numeric := 0;
  v_discount numeric := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'La venta debe incluir al menos una bebida' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'La venta tiene demasiadas líneas' using errcode = '22023';
  end if;

  if p_bundle_qty is null or p_bundle_qty < 2 then
    raise exception 'La cantidad de la promoción es inválida' using errcode = '22023';
  end if;

  if p_bundle_price is null or p_bundle_price < 0 then
    raise exception 'El precio de la promoción es inválido' using errcode = '22023';
  end if;

  drop table if exists pg_temp.event_sale_units;
  create temp table pg_temp.event_sale_units (
    id bigserial primary key,
    unit_price numeric(12, 2) not null,
    eligible boolean not null
  ) on commit drop;

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_line.value->>'quantity')::integer;
    v_unit_price := round((v_line.value->>'unit_price')::numeric, 2);

    if v_quantity is null or v_quantity < 1 then
      raise exception 'La cantidad de una bebida es inválida' using errcode = '22023';
    end if;

    if v_unit_price is null or v_unit_price < 0 then
      raise exception 'El precio de una bebida es inválido' using errcode = '22023';
    end if;

    insert into pg_temp.event_sale_units (unit_price, eligible)
    select
      v_unit_price,
      coalesce((v_line.value->>'promotion_eligible')::boolean, true)
    from generate_series(1, v_quantity);
  end loop;

  select coalesce(sum(unit_price), 0)
  into v_gross_total
  from pg_temp.event_sale_units;

  select coalesce(sum(unit_price), 0)
  into v_ineligible_total
  from pg_temp.event_sale_units
  where not eligible;

  if p_apply_promotion then
    with eligible_units as (
      select unit_price, row_number() over (order by unit_price desc, id) as rn
      from pg_temp.event_sale_units
      where eligible
    ),
    grouped as (
      select ceil(rn::numeric / p_bundle_qty) as group_no, unit_price
      from eligible_units
    ),
    group_totals as (
      select group_no, count(*) as cnt, sum(unit_price) as gross
      from grouped
      group by group_no
    )
    select coalesce(
      sum(case when cnt = p_bundle_qty then least(p_bundle_price, gross) else gross end),
      0
    )
    into v_promo_total
    from group_totals;

    v_total := v_promo_total + v_ineligible_total;
  else
    v_total := v_gross_total;
  end if;

  v_gross_total := round(v_gross_total, 2);
  v_total := round(v_total, 2);
  v_discount := greatest(0, round(v_gross_total - v_total, 2));

  return jsonb_build_object(
    'gross_total', v_gross_total,
    'discount_total', v_discount,
    'total', v_total
  );
end;
$$;

revoke all on function private.event_sale_totals(jsonb, integer, numeric, boolean)
  from public, anon, authenticated;

create or replace function public.create_event(
  p_name text,
  p_venue text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_promotion_enabled boolean,
  p_bundle_qty integer,
  p_bundle_price numeric,
  p_opening_cash numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_venue text;
  v_notes text;
begin
  perform private.require_operator();

  v_name := btrim(coalesce(p_name, ''));
  v_venue := btrim(coalesce(p_venue, ''));
  v_notes := btrim(coalesce(p_notes, ''));

  if length(v_name) < 2 then
    raise exception 'El nombre del evento es obligatorio' using errcode = '22023';
  end if;

  if length(v_name) > 120 then
    raise exception 'El nombre del evento es demasiado largo' using errcode = '22023';
  end if;

  if length(v_venue) > 200 then
    raise exception 'La sede es demasiado larga' using errcode = '22023';
  end if;

  if p_event_date is null then
    raise exception 'La fecha del evento es obligatoria' using errcode = '22023';
  end if;

  if p_start_time is not null and p_end_time is not null and p_end_time <= p_start_time then
    raise exception 'La hora de fin debe ser posterior a la de inicio' using errcode = '22023';
  end if;

  if p_bundle_qty is null or p_bundle_qty < 2 then
    raise exception 'La cantidad de la promoción es inválida' using errcode = '22023';
  end if;

  if p_bundle_price is null or p_bundle_price < 0 then
    raise exception 'El precio de la promoción es inválido' using errcode = '22023';
  end if;

  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'El fondo de caja es inválido' using errcode = '22023';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  insert into public.events (
    folio,
    name,
    venue,
    event_date,
    start_time,
    end_time,
    status,
    promotion_enabled,
    bundle_qty,
    bundle_price,
    opening_cash,
    notes,
    created_by
  )
  values (
    public.next_folio('event'),
    v_name,
    v_venue,
    p_event_date,
    p_start_time,
    p_end_time,
    'open',
    coalesce(p_promotion_enabled, true),
    p_bundle_qty,
    round(p_bundle_price, 2),
    round(p_opening_cash, 2),
    v_notes,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_event(
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) from public, anon;
grant execute on function public.create_event(
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) to authenticated;

create or replace function public.update_event(
  p_id uuid,
  p_name text,
  p_venue text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_promotion_enabled boolean,
  p_bundle_qty integer,
  p_bundle_price numeric,
  p_opening_cash numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_venue text;
  v_notes text;
begin
  perform private.require_operator();

  if p_id is null then
    raise exception 'El evento es obligatorio' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  v_venue := btrim(coalesce(p_venue, ''));
  v_notes := btrim(coalesce(p_notes, ''));

  if length(v_name) < 2 then
    raise exception 'El nombre del evento es obligatorio' using errcode = '22023';
  end if;

  if length(v_name) > 120 then
    raise exception 'El nombre del evento es demasiado largo' using errcode = '22023';
  end if;

  if length(v_venue) > 200 then
    raise exception 'La sede es demasiado larga' using errcode = '22023';
  end if;

  if p_event_date is null then
    raise exception 'La fecha del evento es obligatoria' using errcode = '22023';
  end if;

  if p_start_time is not null and p_end_time is not null and p_end_time <= p_start_time then
    raise exception 'La hora de fin debe ser posterior a la de inicio' using errcode = '22023';
  end if;

  if p_bundle_qty is null or p_bundle_qty < 2 then
    raise exception 'La cantidad de la promoción es inválida' using errcode = '22023';
  end if;

  if p_bundle_price is null or p_bundle_price < 0 then
    raise exception 'El precio de la promoción es inválido' using errcode = '22023';
  end if;

  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'El fondo de caja es inválido' using errcode = '22023';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  update public.events
  set
    name = v_name,
    venue = v_venue,
    event_date = p_event_date,
    start_time = p_start_time,
    end_time = p_end_time,
    promotion_enabled = coalesce(p_promotion_enabled, true),
    bundle_qty = p_bundle_qty,
    bundle_price = round(p_bundle_price, 2),
    opening_cash = round(p_opening_cash, 2),
    notes = v_notes,
    updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  return p_id;
end;
$$;

revoke all on function public.update_event(
  uuid,
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) from public, anon;
grant execute on function public.update_event(
  uuid,
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) to authenticated;

create or replace function public.set_event_status(p_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_operator();

  if p_id is null then
    raise exception 'El evento es obligatorio' using errcode = '22023';
  end if;

  if p_status not in ('open', 'closed') then
    raise exception 'Estado de evento inválido' using errcode = '22023';
  end if;

  update public.events
  set status = p_status, updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  return p_id;
end;
$$;

revoke all on function public.set_event_status(uuid, text) from public, anon;
grant execute on function public.set_event_status(uuid, text) to authenticated;

create or replace function public.create_event_sale(
  p_client_id uuid,
  p_event_id uuid,
  p_items jsonb,
  p_apply_promotion boolean,
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
begin
  perform private.require_operator();

  select id into v_existing_id from public.event_sales where client_id = v_client_id;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select bundle_qty, bundle_price, promotion_enabled, status
  into v_event
  from public.events
  where id = p_event_id;

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

  v_totals := private.event_sale_totals(
    p_items,
    v_event.bundle_qty,
    v_event.bundle_price,
    coalesce(p_apply_promotion, false) and v_event.promotion_enabled
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
    v_notes,
    auth.uid()
  )
  returning id into v_sale_id;

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
    round((item->>'quantity')::integer * (item->>'unit_price')::numeric, 2),
    coalesce((item->>'promotion_eligible')::boolean, true),
    btrim(coalesce(item->>'notes', ''))
  from jsonb_array_elements(p_items) as item;

  return v_sale_id;
end;
$$;

revoke all on function public.create_event_sale(
  uuid,
  uuid,
  jsonb,
  boolean,
  text,
  text,
  timestamptz
) from public, anon;
grant execute on function public.create_event_sale(
  uuid,
  uuid,
  jsonb,
  boolean,
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
begin
  perform private.require_admin();

  delete from public.event_sales where id = p_id;

  if not found then
    raise exception 'Venta no encontrada' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.delete_event_sale(uuid) from public, anon;
grant execute on function public.delete_event_sale(uuid) to authenticated;

create or replace function public.upsert_event_expense(
  p_id uuid,
  p_client_id uuid,
  p_event_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_payment_method text,
  p_reference text,
  p_spent_at timestamptz,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_client_id uuid := coalesce(p_client_id, gen_random_uuid());
  v_description text;
  v_reference text;
  v_notes text;
  v_spent_at timestamptz := coalesce(p_spent_at, now());
begin
  perform private.require_operator();

  if p_category not in ('supplies', 'ice', 'transport', 'staff', 'permits', 'rent', 'other') then
    raise exception 'Categoría de gasto inválida' using errcode = '22023';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'other') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;

  v_description := btrim(coalesce(p_description, ''));
  v_reference := btrim(coalesce(p_reference, ''));
  v_notes := btrim(coalesce(p_notes, ''));

  if length(v_description) < 2 then
    raise exception 'La descripción del gasto es obligatoria' using errcode = '22023';
  end if;

  if length(v_description) > 200 then
    raise exception 'La descripción del gasto es demasiado larga' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del gasto es inválido' using errcode = '22023';
  end if;

  if length(v_reference) > 100 then
    raise exception 'La referencia es demasiado larga' using errcode = '22023';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  if p_id is null then
    select id into v_id from public.event_expenses where client_id = v_client_id;

    if v_id is not null then
      return v_id;
    end if;

    if not exists (select 1 from public.events where id = p_event_id) then
      raise exception 'Evento no encontrado' using errcode = '22023';
    end if;

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
      v_client_id,
      p_event_id,
      p_category,
      v_description,
      round(p_amount, 2),
      p_payment_method,
      v_reference,
      v_spent_at,
      v_notes,
      auth.uid()
    )
    returning id into v_id;

    return v_id;
  end if;

  update public.event_expenses
  set
    event_id = p_event_id,
    category = p_category,
    description = v_description,
    amount = round(p_amount, 2),
    payment_method = p_payment_method,
    reference = v_reference,
    spent_at = v_spent_at,
    notes = v_notes,
    updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Gasto no encontrado' using errcode = '22023';
  end if;

  return p_id;
end;
$$;

revoke all on function public.upsert_event_expense(
  uuid,
  uuid,
  uuid,
  text,
  text,
  numeric,
  text,
  text,
  timestamptz,
  text
) from public, anon;
grant execute on function public.upsert_event_expense(
  uuid,
  uuid,
  uuid,
  text,
  text,
  numeric,
  text,
  text,
  timestamptz,
  text
) to authenticated;

create or replace function public.delete_event_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  delete from public.event_expenses where id = p_id;

  if not found then
    raise exception 'Gasto no encontrado' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.delete_event_expense(uuid) from public, anon;
grant execute on function public.delete_event_expense(uuid) to authenticated;

create view public.v_events
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
  coalesce(s.sales_count, 0)::integer as sales_count,
  coalesce(d.drinks_count, 0)::integer as drinks_count,
  coalesce(s.gross_sales, 0)::numeric as gross_sales,
  coalesce(s.discount_total, 0)::numeric as discount_total,
  coalesce(s.sales_total, 0)::numeric as sales_total,
  coalesce(x.expenses_total, 0)::numeric as expenses_total,
  coalesce(x.expenses_count, 0)::integer as expenses_count,
  round(coalesce(s.sales_total, 0) - coalesce(x.expenses_total, 0), 2) as profit,
  case
    when coalesce(s.sales_total, 0) > 0 then
      round(
        (coalesce(s.sales_total, 0) - coalesce(x.expenses_total, 0))
        / coalesce(s.sales_total, 0)
        * 100,
        1
      )
    else null
  end as margin_percent
from public.events e
left join public.profiles pr on pr.id = e.created_by
left join (
  select
    es.event_id,
    count(*) as sales_count,
    sum(es.gross_total) as gross_sales,
    sum(es.discount_total) as discount_total,
    sum(es.total) as sales_total
  from public.event_sales es
  group by es.event_id
) s on s.event_id = e.id
left join (
  select es.event_id, coalesce(sum(esi.quantity), 0) as drinks_count
  from public.event_sales es
  join public.event_sale_items esi on esi.event_sale_id = es.id
  group by es.event_id
) d on d.event_id = e.id
left join (
  select event_id, sum(amount) as expenses_total, count(*) as expenses_count
  from public.event_expenses
  group by event_id
) x on x.event_id = e.id;

revoke all on public.v_events from anon, authenticated;
grant select on public.v_events to authenticated;

create view public.v_event_sales
with (security_invoker = true)
as
select
  es.id,
  es.client_id,
  es.event_id,
  e.folio as event_folio,
  e.name as event_name,
  e.event_date,
  es.sold_at,
  es.payment_method,
  es.gross_total,
  es.discount_total,
  es.total,
  es.notes,
  es.created_by,
  pr.full_name as created_by_name,
  es.created_at,
  (
    select count(*)::integer
    from public.event_sale_items esi
    where esi.event_sale_id = es.id
  ) as item_count,
  (
    select coalesce(sum(esi.quantity), 0)::integer
    from public.event_sale_items esi
    where esi.event_sale_id = es.id
  ) as drinks_count
from public.event_sales es
join public.events e on e.id = es.event_id
left join public.profiles pr on pr.id = es.created_by;

revoke all on public.v_event_sales from anon, authenticated;
grant select on public.v_event_sales to authenticated;

create view public.v_event_sale_items
with (security_invoker = true)
as
select
  esi.id,
  esi.event_sale_id,
  es.event_id,
  e.folio as event_folio,
  es.sold_at,
  esi.product_id,
  esi.product_name,
  esi.quantity,
  esi.unit_price,
  esi.line_total,
  esi.promotion_eligible,
  esi.notes,
  esi.created_at
from public.event_sale_items esi
join public.event_sales es on es.id = esi.event_sale_id
join public.events e on e.id = es.event_id;

revoke all on public.v_event_sale_items from anon, authenticated;
grant select on public.v_event_sale_items to authenticated;

create view public.v_event_expenses
with (security_invoker = true)
as
select
  x.id,
  x.client_id,
  x.event_id,
  e.folio as event_folio,
  e.name as event_name,
  x.category,
  x.description,
  x.amount,
  x.payment_method,
  x.reference,
  x.spent_at,
  x.notes,
  x.created_by,
  pr.full_name as created_by_name,
  x.created_at,
  x.updated_at
from public.event_expenses x
join public.events e on e.id = x.event_id
left join public.profiles pr on pr.id = x.created_by;

revoke all on public.v_event_expenses from anon, authenticated;
grant select on public.v_event_expenses to authenticated;
