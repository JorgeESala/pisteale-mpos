alter table public.event_sales
  add column promotion_applied boolean not null default false,
  add column bundle_qty integer,
  add column bundle_price numeric(12, 2);

alter table public.event_sales
  add constraint event_sales_bundle_check check (
    (
      promotion_applied
      and bundle_qty is not null
      and bundle_qty >= 2
      and bundle_price is not null
      and bundle_price >= 0
    )
    or (
      not promotion_applied
      and bundle_qty is null
      and bundle_price is null
    )
  );

alter table public.event_sale_items
  add constraint event_sale_items_quantity_max check (quantity between 1 and 100);

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
  v_gross_total numeric := 0;
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

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    where (item->>'quantity') is null
      or (item->>'quantity')::numeric <> floor((item->>'quantity')::numeric)
      or (item->>'quantity')::numeric < 1
      or (item->>'quantity')::numeric > 100
      or (item->>'unit_price') is null
      or (item->>'unit_price')::numeric < 0
  ) then
    raise exception 'Cantidad o precio de bebida inválido' using errcode = '22023';
  end if;

  if (
    select coalesce(sum((item->>'quantity')::integer), 0)
    from jsonb_array_elements(p_items) as item
  ) > 500 then
    raise exception 'La venta supera el máximo de 500 bebidas' using errcode = '22023';
  end if;

  select coalesce(
    sum(round((item->>'unit_price')::numeric, 2) * (item->>'quantity')::integer),
    0
  )
  into v_gross_total
  from jsonb_array_elements(p_items) as item;

  if coalesce(p_apply_promotion, false) then
    with units as (
      select
        round((item->>'unit_price')::numeric, 2) as unit_price,
        coalesce((item->>'promotion_eligible')::boolean, true) as eligible
      from jsonb_array_elements(p_items) as item
      cross join generate_series(1, (item->>'quantity')::integer)
    ),
    eligible_units as (
      select unit_price, row_number() over (order by unit_price desc) as rn
      from units
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
    ),
    promo_totals as (
      select coalesce(
        sum(
          case
            when cnt = p_bundle_qty then least(p_bundle_price, gross)
            else gross
          end
        ),
        0
      ) as total
      from group_totals
    ),
    ineligible_totals as (
      select coalesce(sum(unit_price), 0) as total
      from units
      where not eligible
    )
    select (select total from promo_totals) + (select total from ineligible_totals)
    into v_total;
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

drop function if exists public.create_event_sale(
  uuid,
  uuid,
  jsonb,
  boolean,
  text,
  text,
  timestamptz
);

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

drop function if exists public.upsert_event_expense(
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
);

create or replace function public.create_event_expense(
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
  on conflict (client_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.event_expenses where client_id = v_client_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_event_expense(
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
grant execute on function public.create_event_expense(
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
  end as margin_percent
from public.events e
left join public.profiles pr on pr.id = e.created_by
left join lateral (
  select
    count(*)::integer as sales_count,
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
) x on true;

revoke all on public.v_events from anon, authenticated;
grant select on public.v_events to authenticated;

create or replace view public.v_event_sales
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
  ) as drinks_count,
  es.promotion_applied,
  es.bundle_qty,
  es.bundle_price
from public.event_sales es
join public.events e on e.id = es.event_id
left join public.profiles pr on pr.id = es.created_by;

revoke all on public.v_event_sales from anon, authenticated;
grant select on public.v_event_sales to authenticated;
