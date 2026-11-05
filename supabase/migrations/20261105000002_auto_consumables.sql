update public.inventory_item_groups
set name = 'Vaso 940 ml'
where name = 'Vaso 1L';

update public.inventory_item_groups
set name = 'Tapa 940 ml'
where name = 'Tapa 1L';

update public.inventory_items
set name = 'Vaso 940 ml'
where name = 'Vaso 1L';

update public.inventory_items
set name = 'Tapa 940 ml'
where name = 'Tapa 1L';

update public.products
set serving_size_ml = 940
where kind = 'preparado';

insert into public.app_settings (key, value)
values ('ice_density_g_per_ml', '0.9'::jsonb)
on conflict (key) do nothing;

create table public.recipe_default_consumables (
  id uuid primary key default gen_random_uuid(),
  inventory_group_id uuid not null references public.inventory_item_groups (id) on delete restrict,
  role text not null check (role in ('ice', 'cup', 'lid', 'straw')),
  qty_base integer check (qty_base is null or qty_base > 0),
  applies_to_kind text not null default 'preparado'
    check (applies_to_kind in ('preparado', 'botella', 'servicio')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role)
);

insert into public.recipe_default_consumables (
  inventory_group_id,
  role,
  qty_base,
  active,
  sort_order
)
select
  g.id,
  v.role,
  v.qty_base,
  true,
  v.sort_order
from (
  values
    ('ice'::text, 'Hielo'::text, null::integer, 10),
    ('cup'::text, 'Vaso 940 ml'::text, 1::integer, 20),
    ('lid'::text, 'Tapa 940 ml'::text, 1::integer, 30),
    ('straw'::text, 'Popote'::text, 1::integer, 40)
) as v(role, group_name, qty_base, sort_order)
join public.inventory_item_groups g on g.name = v.group_name
on conflict (role) do nothing;

delete from public.recipe_items ri
using public.recipe_default_consumables d
where ri.inventory_group_id = d.inventory_group_id;

alter table public.recipe_default_consumables enable row level security;

create policy recipe_default_consumables_select_active_users
on public.recipe_default_consumables
for select
to authenticated
using (private.is_active_user());

revoke all on public.recipe_default_consumables from anon, authenticated;
grant select on public.recipe_default_consumables to authenticated;

create view public.v_recipe_default_consumables
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
  gc.all_avg_cost as avg_cost,
  gc.all_cost_count
from public.recipe_default_consumables d
join public.inventory_item_groups g on g.id = d.inventory_group_id
left join public.v_inventory_group_costs gc on gc.group_id = d.inventory_group_id;

revoke all on public.v_recipe_default_consumables from anon, authenticated;
grant select on public.v_recipe_default_consumables to authenticated;

create trigger recipe_default_consumables_set_updated_at
before update on public.recipe_default_consumables
for each row execute function private.set_updated_at();

create trigger recipe_default_consumables_audit
after insert or update or delete on public.recipe_default_consumables
for each row execute function private.audit_trigger();

create or replace function private.reject_default_recipe_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.recipe_default_consumables d
    where d.inventory_group_id = new.inventory_group_id
      and d.active
      and d.applies_to_kind = 'preparado'
  ) then
    raise exception 'Este insumo se agrega automáticamente' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger recipe_items_reject_defaults
before insert or update on public.recipe_items
for each row execute function private.reject_default_recipe_item();

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
        when not gc.is_tiered or ri.tier_rule = 'any' then gc.all_avg_cost
        when ri.tier_rule = 'match' then
          case
            when p_tier = 'premium' then gc.premium_avg_cost
            else gc.standard_avg_cost
          end
        when ri.tier_rule = 'estandar' then gc.standard_avg_cost
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
    select kind, serving_size_ml
    from public.products
    where id = p_product_id
  ),
  liquid as (
    select coalesce(sum(ri.qty_base), 0)::numeric as ml
    from public.recipe_items ri
    join public.recipes r on r.id = ri.recipe_id
    join public.inventory_item_groups g on g.id = ri.inventory_group_id
    where r.product_id = p_product_id
      and g.base_unit = 'ml'
  ),
  defaults as (
    select d.role, d.qty_base, gc.all_avg_cost
    from public.recipe_default_consumables d
    join public.v_inventory_group_costs gc on gc.group_id = d.inventory_group_id
    where d.active
      and d.applies_to_kind = 'preparado'
  ),
  ice as (
    select greatest(
      0,
      (select serving_size_ml from product) - (select ml from liquid)
    )::numeric as ml
  ),
  density as (
    select coalesce(
      (select value::text::numeric from public.app_settings where key = 'ice_density_g_per_ml'),
      0.9
    ) as g_per_ml
  )
  select case
    when (select kind from product) <> 'preparado' then 0
    when (select count(*) from defaults) < 4 then null
    when exists (select 1 from defaults where all_avg_cost is null) then null
    when exists (
      select 1 from defaults
      where role <> 'ice'
        and (qty_base is null or qty_base <= 0)
    ) then null
    else (
      select round(sum(
        case
          when d.role = 'ice' then
            round((select ml from ice) * (select g_per_ml from density)) * d.all_avg_cost
          else d.qty_base * d.all_avg_cost
        end
      ), 2)
      from defaults d
    )
  end;
$$;

create or replace function public.product_cost(p_product_id uuid, p_tier text)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  with costs as (
    select
      public.product_recipe_cost(p_product_id, p_tier) as recipe_cost,
      public.product_consumables_cost(p_product_id) as consumables_cost
  )
  select case
    when recipe_cost is null or consumables_cost is null then null
    else round(recipe_cost + consumables_cost, 2)
  end
  from costs;
$$;

drop view if exists public.v_product_costs;

create view public.v_product_costs
with (security_invoker = true)
as
select
  p.id as product_id,
  p.name,
  p.category_id,
  pc.name as category_name,
  p.price,
  p.premium_price,
  p.is_alcoholic,
  p.active,
  costs.normal_recipe_cost,
  costs.premium_recipe_cost,
  costs.consumables_cost,
  case
    when costs.normal_recipe_cost is null or costs.consumables_cost is null then null
    else round(costs.normal_recipe_cost + costs.consumables_cost, 2)
  end as normal_cost,
  case
    when costs.premium_recipe_cost is null or costs.consumables_cost is null then null
    else round(costs.premium_recipe_cost + costs.consumables_cost, 2)
  end as premium_cost,
  case
    when costs.normal_recipe_cost is null or costs.consumables_cost is null then null
    else round(p.price - (costs.normal_recipe_cost + costs.consumables_cost), 2)
  end as normal_margin,
  case
    when costs.premium_recipe_cost is null
      or costs.consumables_cost is null
      or p.premium_price is null then null
    else round(p.premium_price - (costs.premium_recipe_cost + costs.consumables_cost), 2)
  end as premium_margin,
  costs.normal_recipe_cost is not null
    and costs.consumables_cost is not null as normal_cost_complete,
  costs.premium_recipe_cost is not null
    and costs.consumables_cost is not null as premium_cost_complete,
  exists (
    select 1
    from public.recipes r
    join public.recipe_items ri on ri.recipe_id = r.id
    where r.product_id = p.id
  ) as has_recipe
from public.products p
left join public.product_categories pc on pc.id = p.category_id
cross join lateral (
  select
    public.product_recipe_cost(p.id, 'estandar') as normal_recipe_cost,
    public.product_recipe_cost(p.id, 'premium') as premium_recipe_cost,
    public.product_consumables_cost(p.id) as consumables_cost
) costs;

revoke all on public.v_product_costs from anon, authenticated;
grant select on public.v_product_costs to authenticated;

revoke all on function public.product_recipe_cost(uuid, text) from public, anon;
grant execute on function public.product_recipe_cost(uuid, text) to authenticated;

revoke all on function public.product_consumables_cost(uuid) from public, anon;
grant execute on function public.product_consumables_cost(uuid) to authenticated;

revoke all on function public.product_cost(uuid, text) from public, anon;
grant execute on function public.product_cost(uuid, text) to authenticated;

create or replace function public.save_recipe_default_consumables(
  p_items jsonb,
  p_ice_density numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_group_id uuid;
  v_qty integer;
  v_active boolean;
  v_base_unit text;
  v_row record;
begin
  perform private.require_admin();

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 4 then
    raise exception 'Debes configurar exactamente cuatro consumibles' using errcode = '22023';
  end if;

  if (select count(distinct e->>'role') from jsonb_array_elements(p_items) as e) <> 4 then
    raise exception 'Los roles de consumibles deben ser únicos' using errcode = '22023';
  end if;

  if p_ice_density is null or p_ice_density <= 0 then
    raise exception 'Densidad de hielo inválida' using errcode = '22023';
  end if;

  for v_role in select unnest(array['ice', 'cup', 'lid', 'straw']) loop
    if not exists (
      select 1 from jsonb_array_elements(p_items) as e where e->>'role' = v_role
    ) then
      raise exception 'Falta el consumible %', v_role using errcode = '22023';
    end if;
  end loop;

  for v_row in
    select
      e->>'role' as role,
      (e->>'inventory_group_id')::uuid as group_id,
      case
        when e->'qty_base' is null or e->>'qty_base' = '' then null
        else (e->>'qty_base')::integer
      end as qty_base,
      coalesce((e->>'active')::boolean, true) as active
    from jsonb_array_elements(p_items) as e
  loop
    v_role := v_row.role;
    v_group_id := v_row.group_id;
    v_qty := v_row.qty_base;
    v_active := v_row.active;

    select base_unit into v_base_unit
    from public.inventory_item_groups
    where id = v_group_id;

    if v_base_unit is null then
      raise exception 'Grupo de consumible no encontrado' using errcode = '22023';
    end if;

    if v_role = 'ice' then
      if v_base_unit <> 'g' then
        raise exception 'El hielo debe usar un grupo en gramos' using errcode = '22023';
      end if;
      if v_qty is not null then
        raise exception 'El hielo se calcula automáticamente' using errcode = '22023';
      end if;
    else
      if v_base_unit <> 'pza' then
        raise exception 'Vaso, tapa y popote deben usar un grupo en piezas'
          using errcode = '22023';
      end if;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Cantidad inválida para consumible' using errcode = '22023';
      end if;
    end if;

    insert into public.recipe_default_consumables (
      inventory_group_id,
      role,
      qty_base,
      active
    )
    values (v_group_id, v_role, v_qty, v_active)
    on conflict (role) do update
    set
      inventory_group_id = excluded.inventory_group_id,
      qty_base = excluded.qty_base,
      active = excluded.active;
  end loop;

  insert into public.app_settings (key, value)
  values ('ice_density_g_per_ml', to_jsonb(p_ice_density))
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.save_recipe_default_consumables(jsonb, numeric)
  from public, anon;
grant execute on function public.save_recipe_default_consumables(jsonb, numeric)
  to authenticated;
