update public.inventory_items
set
  track_stock = false,
  purchase_factor = 5000,
  min_stock_base = 0
where name = 'Hielo'
  and group_id = (
    select id from public.inventory_item_groups where name = 'Hielo'
  );

create table public.ice_daily_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null unique,
  bags numeric(10, 2) check (bags is null or bags >= 0),
  total_cost numeric(12, 2) not null check (total_cost >= 0),
  drinks_sold integer not null check (drinks_sold > 0),
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ice_daily_records_date_idx on public.ice_daily_records (record_date desc);

alter table public.ice_daily_records enable row level security;

create policy ice_daily_records_select_active_users
on public.ice_daily_records
for select
to authenticated
using (private.is_active_user());

revoke all on public.ice_daily_records from anon, authenticated;
grant select on public.ice_daily_records to authenticated;

create trigger ice_daily_records_set_updated_at
before update on public.ice_daily_records
for each row execute function private.set_updated_at();

create trigger ice_daily_records_audit
after insert or update or delete on public.ice_daily_records
for each row execute function private.audit_trigger();

create view public.v_ice_daily_records
with (security_invoker = true)
as
select
  r.id,
  r.record_date,
  r.bags,
  r.total_cost,
  r.drinks_sold,
  round(r.total_cost / r.drinks_sold, 2) as cost_per_drink,
  r.notes,
  r.created_by,
  r.created_at,
  r.updated_at
from public.ice_daily_records r;

revoke all on public.v_ice_daily_records from anon, authenticated;
grant select on public.v_ice_daily_records to authenticated;

create view public.v_ice_cost_7d
with (security_invoker = true)
as
with recent as (
  select record_date, total_cost, drinks_sold
  from public.ice_daily_records
  order by record_date desc
  limit 7
)
select
  count(*)::integer as days_count,
  min(record_date) as date_from,
  max(record_date) as date_to,
  case
    when count(*) = 0 then null
    else round(sum(total_cost) / sum(drinks_sold), 2)
  end as cost_per_drink
from recent;

revoke all on public.v_ice_cost_7d from anon, authenticated;
grant select on public.v_ice_cost_7d to authenticated;

create or replace function private.require_operator()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('admin'::public.user_role, 'operador'::public.user_role)
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_operator() from public, anon, authenticated;

create or replace function public.upsert_ice_daily_record(
  p_id uuid,
  p_record_date date,
  p_bags numeric,
  p_total_cost numeric,
  p_drinks_sold integer,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_bags numeric;
  v_total_cost numeric;
  v_drinks_sold integer;
  v_notes text;
begin
  perform private.require_operator();

  if p_record_date is null then
    raise exception 'La fecha es obligatoria' using errcode = '22023';
  end if;

  if p_record_date > current_date then
    raise exception 'La fecha no puede ser futura' using errcode = '22023';
  end if;

  if p_total_cost is null or p_total_cost < 0 then
    raise exception 'El gasto de hielo es inválido' using errcode = '22023';
  end if;

  if p_drinks_sold is null or p_drinks_sold <= 0 then
    raise exception 'Las bebidas vendidas deben ser mayores a cero' using errcode = '22023';
  end if;

  if p_bags is not null and p_bags < 0 then
    raise exception 'Las bolsas de hielo son inválidas' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));
  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  v_bags := p_bags;
  v_total_cost := round(p_total_cost, 2);
  v_drinks_sold := p_drinks_sold;

  if p_id is null then
    insert into public.ice_daily_records (
      record_date,
      bags,
      total_cost,
      drinks_sold,
      notes,
      created_by
    )
    values (
      p_record_date,
      v_bags,
      v_total_cost,
      v_drinks_sold,
      v_notes,
      auth.uid()
    )
    on conflict (record_date) do update
    set
      bags = excluded.bags,
      total_cost = excluded.total_cost,
      drinks_sold = excluded.drinks_sold,
      notes = excluded.notes
    returning id into v_id;
  else
    update public.ice_daily_records
    set
      record_date = p_record_date,
      bags = v_bags,
      total_cost = v_total_cost,
      drinks_sold = v_drinks_sold,
      notes = v_notes
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Registro de hielo no encontrado' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un cierre de hielo para esa fecha' using errcode = '23505';
end;
$$;

revoke all on function public.upsert_ice_daily_record(uuid, date, numeric, numeric, integer, text)
  from public, anon;
grant execute on function public.upsert_ice_daily_record(uuid, date, numeric, numeric, integer, text)
  to authenticated;

create or replace function public.delete_ice_daily_record(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  delete from public.ice_daily_records where id = p_id;

  if not found then
    raise exception 'Registro de hielo no encontrado' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_ice_daily_record(uuid) from public, anon;
grant execute on function public.delete_ice_daily_record(uuid) to authenticated;

create or replace function public.product_consumables_cost(p_product_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  with product as (
    select kind
    from public.products
    where id = p_product_id
  ),
  defaults as (
    select d.role, d.qty_base, gc.all_avg_cost
    from public.recipe_default_consumables d
    join public.v_inventory_group_costs gc on gc.group_id = d.inventory_group_id
    where d.active
      and d.applies_to_kind = 'preparado'
  ),
  ice as (
    select cost_per_drink
    from public.v_ice_cost_7d
  )
  select case
    when (select kind from product) <> 'preparado' then 0
    when not exists (select 1 from defaults) then 0
    when exists (
      select 1 from defaults
      where role <> 'ice'
        and (qty_base is null or qty_base <= 0)
    ) then null
    when exists (
      select 1 from defaults
      where role <> 'ice' and all_avg_cost is null
    ) then null
    when exists (select 1 from defaults where role = 'ice')
      and (select cost_per_drink from ice) is null then null
    else (
      select round(sum(
        case
          when d.role = 'ice' then (select cost_per_drink from ice)
          else d.qty_base * d.all_avg_cost
        end
      ), 2)
      from defaults d
    )
  end;
$$;

revoke all on function public.product_consumables_cost(uuid) from public, anon;
grant execute on function public.product_consumables_cost(uuid) to authenticated;
