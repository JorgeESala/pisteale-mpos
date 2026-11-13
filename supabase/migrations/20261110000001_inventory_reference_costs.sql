alter table public.inventory_item_groups
  add column reference_cost numeric(14, 6) check (reference_cost is null or reference_cost >= 0),
  add column reference_cost_updated_at timestamptz,
  add column reference_cost_note text not null default '',
  add column reference_cost_source text not null default '';

create table public.inventory_group_cost_history (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.inventory_item_groups (id) on delete cascade,
  old_cost numeric(14, 6),
  new_cost numeric(14, 6),
  note text not null default '',
  source text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (old_cost is null or old_cost >= 0),
  check (new_cost is null or new_cost >= 0)
);

create index inventory_group_cost_history_group_idx
  on public.inventory_group_cost_history (group_id, created_at desc);

alter table public.inventory_group_cost_history enable row level security;

create policy inventory_group_cost_history_select_active_users
on public.inventory_group_cost_history
for select
to authenticated
using (private.is_active_user());

revoke all on public.inventory_group_cost_history from anon, authenticated;
grant select on public.inventory_group_cost_history to authenticated;

create view public.v_inventory_group_cost_history
with (security_invoker = true)
as
select
  h.id,
  h.group_id,
  g.name as group_name,
  h.old_cost,
  h.new_cost,
  h.note,
  h.source,
  h.created_by,
  p.full_name as created_by_name,
  h.created_at
from public.inventory_group_cost_history h
join public.inventory_item_groups g on g.id = h.group_id
left join public.profiles p on p.id = h.created_by;

revoke all on public.v_inventory_group_cost_history from anon, authenticated;
grant select on public.v_inventory_group_cost_history to authenticated;

create or replace view public.v_inventory_group_costs
with (security_invoker = true)
as
select
  g.id as group_id,
  g.name,
  g.category_id,
  c.name as category_name,
  g.base_unit,
  g.is_tiered,
  g.active,
  count(ii.id) as item_count,
  avg(case when ii.avg_cost > 0 then ii.avg_cost end) as all_avg_cost,
  avg(case when ii.tier = 'estandar' and ii.avg_cost > 0 then ii.avg_cost end)
    as standard_avg_cost,
  avg(case when ii.tier = 'premium' and ii.avg_cost > 0 then ii.avg_cost end)
    as premium_avg_cost,
  count(case when ii.avg_cost > 0 then 1 end) as all_cost_count,
  count(case when ii.tier = 'estandar' and ii.avg_cost > 0 then 1 end)
    as standard_cost_count,
  count(case when ii.tier = 'premium' and ii.avg_cost > 0 then 1 end)
    as premium_cost_count,
  g.reference_cost,
  g.reference_cost_updated_at,
  g.reference_cost_note,
  g.reference_cost_source
from public.inventory_item_groups g
left join public.inventory_categories c on c.id = g.category_id
left join public.inventory_items ii on ii.group_id = g.id and ii.active = true
group by
  g.id, g.name, g.category_id, c.name, g.base_unit, g.is_tiered, g.active,
  g.reference_cost, g.reference_cost_updated_at, g.reference_cost_note,
  g.reference_cost_source;

create or replace view public.v_recipe_default_consumables
with (security_invoker = true)
as
select
  d.id,
  d.inventory_group_id as group_id,
  g.name as group_name,
  g.base_unit,
  d.role,
  d.qty_base,
  d.applies_to_kind,
  d.active,
  d.sort_order,
  coalesce(gc.reference_cost, gc.all_avg_cost) as avg_cost,
  gc.all_cost_count
from public.recipe_default_consumables d
join public.inventory_item_groups g on g.id = d.inventory_group_id
left join public.v_inventory_group_costs gc on gc.group_id = d.inventory_group_id;

create or replace function public.product_recipe_cost(p_product_id uuid, p_tier text)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  with recipe as (
    select r.id, r.yield_qty
    from public.recipes r
    where r.product_id = p_product_id
  ),
  items as (
    select
      ri.qty_base,
      case
        when not gc.is_tiered or ri.tier_rule = 'any'
          then coalesce(gc.reference_cost, gc.all_avg_cost)
        when ri.tier_rule = 'match' then
          case
            when p_tier = 'premium' then gc.premium_avg_cost
            else coalesce(gc.reference_cost, gc.standard_avg_cost)
          end
        when ri.tier_rule = 'estandar'
          then coalesce(gc.reference_cost, gc.standard_avg_cost)
        when ri.tier_rule = 'premium' then gc.premium_avg_cost
      end as unit_cost
    from public.recipe_items ri
    join public.v_inventory_group_costs gc on gc.group_id = ri.inventory_group_id
    join recipe r on r.id = ri.recipe_id
  )
  select case
    when not exists (select 1 from recipe) then null
    when not exists (select 1 from items) then null
    when exists (select 1 from items where unit_cost is null) then null
    else (
      select round(sum(qty_base * unit_cost) / (select yield_qty from recipe), 2)
      from items
    )
  end;
$$;

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
    select d.role, d.qty_base, coalesce(gc.reference_cost, gc.all_avg_cost) as all_avg_cost
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

create or replace function public.set_inventory_group_reference_cost(
  p_group_id uuid,
  p_reference_cost numeric,
  p_note text,
  p_source text
)
returns public.inventory_item_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.inventory_item_groups;
  v_old numeric;
  v_note text := btrim(coalesce(p_note, ''));
  v_source text := btrim(coalesce(p_source, ''));
begin
  perform private.require_manage_catalog();

  if p_group_id is null then
    raise exception 'Grupo inválido' using errcode = '22023';
  end if;

  if p_reference_cost is not null and p_reference_cost < 0 then
    raise exception 'Costo inválido' using errcode = '22023';
  end if;

  if length(v_note) > 500 then
    raise exception 'Nota demasiado larga' using errcode = '22023';
  end if;

  if length(v_source) > 100 then
    raise exception 'Fuente demasiado larga' using errcode = '22023';
  end if;

  select * into v_group
  from public.inventory_item_groups
  where id = p_group_id
  for update;

  if v_group.id is null then
    raise exception 'Grupo no encontrado' using errcode = 'P0002';
  end if;

  v_old := v_group.reference_cost;

  update public.inventory_item_groups
  set
    reference_cost = p_reference_cost,
    reference_cost_updated_at = now(),
    reference_cost_note = v_note,
    reference_cost_source = v_source
  where id = p_group_id
  returning * into v_group;

  insert into public.inventory_group_cost_history (
    group_id,
    old_cost,
    new_cost,
    note,
    source,
    created_by
  )
  values (
    p_group_id,
    v_old,
    p_reference_cost,
    v_note,
    v_source,
    auth.uid()
  );

  return v_group;
end;
$$;

revoke all on function public.set_inventory_group_reference_cost(uuid, numeric, text, text)
  from public, anon;
grant execute on function public.set_inventory_group_reference_cost(uuid, numeric, text, text)
  to authenticated;
