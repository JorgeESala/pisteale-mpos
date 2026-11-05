drop view if exists public.v_product_costs;

drop function if exists public.upsert_inventory_item(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  numeric,
  numeric,
  integer,
  boolean,
  boolean
);

drop function if exists public.upsert_product(
  uuid,
  text,
  text,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  uuid,
  boolean,
  text
);

drop function if exists public.upsert_recipe(uuid, numeric, text, text, jsonb);

create table public.inventory_item_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category_id uuid references public.inventory_categories (id) on delete set null,
  base_unit text not null check (base_unit in ('ml', 'g', 'pza')),
  is_tiered boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_items
  add column group_id uuid,
  add column tier text;

insert into public.inventory_item_groups (name, category_id, base_unit, is_tiered)
select
  i.name,
  i.category_id,
  i.base_unit,
  coalesce(c.name in ('Destilados', 'Licores', 'Vinos'), false)
from public.inventory_items i
left join public.inventory_categories c on c.id = i.category_id
on conflict (name) do nothing;

update public.inventory_items i
set
  group_id = g.id,
  tier = case when g.is_tiered then 'estandar' else null end
from public.inventory_item_groups g
where g.name = i.name;

alter table public.inventory_items
  alter column group_id set not null,
  add constraint inventory_items_group_id_fkey
    foreign key (group_id) references public.inventory_item_groups (id) on delete restrict,
  add constraint inventory_items_tier_check
    check (tier is null or tier in ('estandar', 'premium'));

alter table public.inventory_items
  drop column category_id,
  drop column base_unit;

alter table public.products
  add column premium_price numeric(12, 2);

update public.products
set premium_price = case when is_alcoholic then 150.00 else null end;

alter table public.products
  add constraint products_premium_price_check
    check (premium_price is null or premium_price >= 0),
  add constraint products_premium_price_required
    check (
      (is_alcoholic and premium_price is not null)
      or (not is_alcoholic and premium_price is null)
    );

alter table public.recipe_items
  add column inventory_group_id uuid,
  add column tier_rule text not null default 'any',
  add column input_qty numeric(14, 4),
  add column input_unit text;

update public.recipe_items ri
set
  inventory_group_id = ii.group_id,
  tier_rule = case
    when g.is_tiered then case when ii.tier = 'premium' then 'premium' else 'estandar' end
    else 'any'
  end,
  input_qty = ri.qty_base,
  input_unit = g.base_unit
from public.inventory_items ii
join public.inventory_item_groups g on g.id = ii.group_id
where ii.id = ri.inventory_item_id;

alter table public.recipe_items
  alter column inventory_group_id set not null,
  add constraint recipe_items_inventory_group_id_fkey
    foreign key (inventory_group_id) references public.inventory_item_groups (id) on delete restrict,
  add constraint recipe_items_tier_rule_check
    check (tier_rule in ('any', 'estandar', 'premium', 'match')),
  add constraint recipe_items_input_unit_check
    check (input_unit is null or input_unit in ('ml', 'oz', 'g', 'pza'));

alter table public.recipe_items
  drop constraint if exists recipe_items_recipe_id_inventory_item_id_key,
  drop column inventory_item_id;

alter table public.recipe_items
  add constraint recipe_items_recipe_group_key unique (recipe_id, inventory_group_id);

create view public.v_inventory_group_costs
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
    as premium_cost_count
from public.inventory_item_groups g
left join public.inventory_categories c on c.id = g.category_id
left join public.inventory_items ii on ii.group_id = g.id and ii.active = true
group by g.id, g.name, g.category_id, c.name, g.base_unit, g.is_tiered, g.active;

create view public.v_inventory_items
with (security_invoker = true)
as
select
  i.id,
  i.name,
  i.group_id,
  g.name as group_name,
  g.category_id,
  c.name as category_name,
  g.base_unit,
  g.is_tiered,
  i.tier,
  i.kind,
  i.purchase_unit,
  i.purchase_factor,
  i.avg_cost,
  i.min_stock_base,
  i.track_stock,
  i.active,
  i.created_at,
  i.updated_at
from public.inventory_items i
join public.inventory_item_groups g on g.id = i.group_id
left join public.inventory_categories c on c.id = g.category_id;

create or replace function public.product_cost(p_product_id uuid, p_tier text)
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
  costs.normal_cost,
  case
    when costs.normal_cost is null then null
    else round(p.price - costs.normal_cost, 2)
  end as normal_margin,
  costs.premium_cost,
  case
    when costs.premium_cost is null or p.premium_price is null then null
    else round(p.premium_price - costs.premium_cost, 2)
  end as premium_margin,
  costs.normal_cost is not null as normal_cost_complete,
  costs.premium_cost is not null as premium_cost_complete,
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
    public.product_cost(p.id, 'estandar') as normal_cost,
    public.product_cost(p.id, 'premium') as premium_cost
) costs;

alter table public.inventory_item_groups enable row level security;

create policy inventory_item_groups_select_active_users
on public.inventory_item_groups
for select
to authenticated
using (private.is_active_user());

revoke all on public.inventory_item_groups from anon, authenticated;
grant select on public.inventory_item_groups to authenticated;

revoke all on public.v_inventory_group_costs from anon, authenticated;
grant select on public.v_inventory_group_costs to authenticated;

revoke all on public.v_inventory_items from anon, authenticated;
grant select on public.v_inventory_items to authenticated;

revoke all on public.v_product_costs from anon, authenticated;
grant select on public.v_product_costs to authenticated;

revoke all on function public.product_cost(uuid, text) from public, anon;
grant execute on function public.product_cost(uuid, text) to authenticated;

create or replace function public.upsert_inventory_group(
  p_id uuid,
  p_name text,
  p_category_id uuid,
  p_base_unit text,
  p_is_tiered boolean,
  p_active boolean
)
returns public.inventory_item_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_group public.inventory_item_groups;
  v_existing public.inventory_item_groups;
  v_item_count bigint;
begin
  perform private.require_admin();

  if v_name is null or length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  if p_base_unit not in ('ml', 'g', 'pza') then
    raise exception 'Unidad base inválida' using errcode = '22023';
  end if;

  if p_id is not null then
    select * into v_existing from public.inventory_item_groups where id = p_id;

    if v_existing.id is not null then
      select count(*) into v_item_count from public.inventory_items where group_id = p_id;

      if v_item_count > 0 and v_existing.base_unit <> p_base_unit then
        raise exception 'No puedes cambiar la unidad base de un grupo con insumos'
          using errcode = '22023';
      end if;

      if not p_is_tiered and exists (
        select 1 from public.inventory_items
        where group_id = p_id and tier = 'premium'
      ) then
        raise exception 'No puedes quitar los tiers de un grupo con insumos premium'
          using errcode = '22023';
      end if;
    end if;
  end if;

  if p_id is null then
    insert into public.inventory_item_groups (
      name,
      category_id,
      base_unit,
      is_tiered,
      active
    )
    values (v_name, p_category_id, p_base_unit, p_is_tiered, p_active)
    returning * into v_group;
  else
    update public.inventory_item_groups
    set
      name = v_name,
      category_id = p_category_id,
      base_unit = p_base_unit,
      is_tiered = p_is_tiered,
      active = p_active
    where id = p_id
    returning * into v_group;

    if v_group.id is null then
      insert into public.inventory_item_groups (
        id,
        name,
        category_id,
        base_unit,
        is_tiered,
        active
      )
      values (p_id, v_name, p_category_id, p_base_unit, p_is_tiered, p_active)
      returning * into v_group;
    end if;
  end if;

  if p_is_tiered then
    update public.inventory_items
    set tier = coalesce(tier, 'estandar')
    where group_id = v_group.id
      and tier is null;
  end if;

  return v_group;
exception
  when unique_violation then
    raise exception 'Ya existe un grupo con ese nombre' using errcode = '23505';
end;
$$;

create or replace function public.upsert_inventory_item(
  p_id uuid,
  p_group_id uuid,
  p_name text,
  p_tier text,
  p_kind text,
  p_purchase_unit text,
  p_purchase_factor numeric,
  p_avg_cost numeric,
  p_min_stock_base integer,
  p_track_stock boolean,
  p_active boolean
)
returns public.inventory_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_purchase_unit text := btrim(p_purchase_unit);
  v_group public.inventory_item_groups;
  v_item public.inventory_items;
begin
  perform private.require_admin();

  select * into v_group from public.inventory_item_groups where id = p_group_id;

  if v_group.id is null then
    raise exception 'Grupo de insumos no encontrado' using errcode = 'P0001';
  end if;

  if v_name is null or length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  if p_kind not in ('ingrediente', 'consumible', 'botella', 'preparacion') then
    raise exception 'Tipo de insumo inválido' using errcode = '22023';
  end if;

  if v_purchase_unit is null or length(v_purchase_unit) < 1 or length(v_purchase_unit) > 30 then
    raise exception 'Unidad de compra inválida' using errcode = '22023';
  end if;

  if p_purchase_factor is null or p_purchase_factor <= 0 then
    raise exception 'Factor de compra inválido' using errcode = '22023';
  end if;

  if p_avg_cost is null or p_avg_cost < 0 then
    raise exception 'Costo inválido' using errcode = '22023';
  end if;

  if p_min_stock_base is null or p_min_stock_base < 0 then
    raise exception 'Stock mínimo inválido' using errcode = '22023';
  end if;

  if v_group.is_tiered then
    if p_tier not in ('estandar', 'premium') then
      raise exception 'Selecciona un tier para este insumo' using errcode = '22023';
    end if;
  elsif p_tier is not null then
    raise exception 'Este grupo no maneja tiers' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.inventory_items (
      group_id,
      name,
      tier,
      kind,
      purchase_unit,
      purchase_factor,
      avg_cost,
      min_stock_base,
      track_stock,
      active
    )
    values (
      p_group_id,
      v_name,
      p_tier,
      p_kind,
      v_purchase_unit,
      p_purchase_factor,
      p_avg_cost,
      p_min_stock_base,
      p_track_stock,
      p_active
    )
    returning * into v_item;
  else
    update public.inventory_items
    set
      group_id = p_group_id,
      name = v_name,
      tier = p_tier,
      kind = p_kind,
      purchase_unit = v_purchase_unit,
      purchase_factor = p_purchase_factor,
      avg_cost = p_avg_cost,
      min_stock_base = p_min_stock_base,
      track_stock = p_track_stock,
      active = p_active
    where id = p_id
    returning * into v_item;

    if v_item.id is null then
      insert into public.inventory_items (
        id,
        group_id,
        name,
        tier,
        kind,
        purchase_unit,
        purchase_factor,
        avg_cost,
        min_stock_base,
        track_stock,
        active
      )
      values (
        p_id,
        p_group_id,
        v_name,
        p_tier,
        p_kind,
        v_purchase_unit,
        p_purchase_factor,
        p_avg_cost,
        p_min_stock_base,
        p_track_stock,
        p_active
      )
      returning * into v_item;
    end if;
  end if;

  return v_item;
exception
  when unique_violation then
    raise exception 'Ya existe un insumo con ese nombre' using errcode = '23505';
end;
$$;

create or replace function public.upsert_product(
  p_id uuid,
  p_name text,
  p_description text,
  p_category_id uuid,
  p_kind text,
  p_price numeric,
  p_premium_price numeric,
  p_is_alcoholic boolean,
  p_serving_size_ml integer,
  p_inventory_item_id uuid,
  p_active boolean,
  p_notes text
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_description text := coalesce(p_description, '');
  v_notes text := coalesce(p_notes, '');
  v_product public.products;
begin
  perform private.require_admin();

  if v_name is null or length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  if length(v_description) > 1000 or length(v_notes) > 1000 then
    raise exception 'Texto demasiado largo' using errcode = '22023';
  end if;

  if p_kind not in ('preparado', 'botella', 'servicio') then
    raise exception 'Tipo de producto inválido' using errcode = '22023';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Precio inválido' using errcode = '22023';
  end if;

  if p_is_alcoholic then
    if p_premium_price is null or p_premium_price < 0 then
      raise exception 'Precio premium requerido para bebidas con alcohol'
        using errcode = '22023';
    end if;
  elsif p_premium_price is not null then
    raise exception 'Las bebidas sin alcohol no tienen precio premium'
      using errcode = '22023';
  end if;

  if p_serving_size_ml is null or p_serving_size_ml <= 0 then
    raise exception 'Tamaño de producto inválido' using errcode = '22023';
  end if;

  if p_kind = 'botella' and p_inventory_item_id is null then
    raise exception 'Una botella debe tener un insumo asociado' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.products (
      name,
      description,
      category_id,
      kind,
      price,
      premium_price,
      is_alcoholic,
      serving_size_ml,
      inventory_item_id,
      active,
      notes
    )
    values (
      v_name,
      v_description,
      p_category_id,
      p_kind,
      p_price,
      p_premium_price,
      p_is_alcoholic,
      p_serving_size_ml,
      p_inventory_item_id,
      p_active,
      v_notes
    )
    returning * into v_product;
  else
    update public.products
    set
      name = v_name,
      description = v_description,
      category_id = p_category_id,
      kind = p_kind,
      price = p_price,
      premium_price = p_premium_price,
      is_alcoholic = p_is_alcoholic,
      serving_size_ml = p_serving_size_ml,
      inventory_item_id = p_inventory_item_id,
      active = p_active,
      notes = v_notes
    where id = p_id
    returning * into v_product;

    if v_product.id is null then
      insert into public.products (
        id,
        name,
        description,
        category_id,
        kind,
        price,
        premium_price,
        is_alcoholic,
        serving_size_ml,
        inventory_item_id,
        active,
        notes
      )
      values (
        p_id,
        v_name,
        v_description,
        p_category_id,
        p_kind,
        p_price,
        p_premium_price,
        p_is_alcoholic,
        p_serving_size_ml,
        p_inventory_item_id,
        p_active,
        v_notes
      )
      returning * into v_product;
    end if;
  end if;

  return v_product;
exception
  when unique_violation then
    raise exception 'Ya existe un producto con ese nombre' using errcode = '23505';
end;
$$;

create or replace function public.upsert_recipe(
  p_product_id uuid,
  p_yield_qty numeric,
  p_yield_unit text,
  p_notes text,
  p_items jsonb
)
returns public.recipes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_yield_unit text := btrim(p_yield_unit);
  v_notes text := coalesce(p_notes, '');
  v_recipe public.recipes;
  v_product_exists boolean;
begin
  perform private.require_admin();

  select exists (
    select 1 from public.products where id = p_product_id
  ) into v_product_exists;

  if not v_product_exists then
    raise exception 'Producto no encontrado' using errcode = 'P0001';
  end if;

  perform 1 from public.products where id = p_product_id for update;

  if p_yield_qty is null or p_yield_qty <= 0 then
    raise exception 'Rendimiento inválido' using errcode = '22023';
  end if;

  if v_yield_unit is null or length(v_yield_unit) < 1 or length(v_yield_unit) > 30 then
    raise exception 'Unidad de rendimiento inválida' using errcode = '22023';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Notas demasiado largas' using errcode = '22023';
  end if;

  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'Los insumos deben ser una lista' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_items) as e
    where case
      when jsonb_typeof(e) <> 'object' then true
      when not (e ? 'inventory_group_id') then true
      when not (e ? 'qty') then true
      when not (e ? 'unit') then true
      when jsonb_typeof(e->'inventory_group_id') <> 'string' then true
      when (e->>'inventory_group_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when jsonb_typeof(e->'qty') <> 'number' then true
      when (e->>'qty')::numeric <= 0 then true
      when jsonb_typeof(e->'unit') <> 'string' then true
      else false
    end
  ) then
    raise exception 'Insumo inválido en la receta' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_items) as e
    left join public.inventory_item_groups g on g.id = (e->>'inventory_group_id')::uuid
    where g.id is null
  ) then
    raise exception 'Grupo de insumos no encontrado' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(v_items)) <>
     (select count(distinct (e->>'inventory_group_id')) from jsonb_array_elements(v_items) as e) then
    raise exception 'Grupo duplicado en la receta' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_items) as e
    join public.inventory_item_groups g on g.id = (e->>'inventory_group_id')::uuid
    where case
      when g.base_unit = 'ml' and (e->>'unit') not in ('ml', 'oz') then true
      when g.base_unit = 'g' and (e->>'unit') <> 'g' then true
      when g.base_unit = 'pza' and (e->>'unit') <> 'pza' then true
      when not g.is_tiered and coalesce(e->>'tier_rule', 'any') <> 'any' then true
      when g.is_tiered and coalesce(e->>'tier_rule', 'any') not in ('any', 'estandar', 'premium', 'match') then true
      else false
    end
  ) then
    raise exception 'Unidad o tier inválido en la receta' using errcode = '22023';
  end if;

  select * into v_recipe from public.recipes where product_id = p_product_id;

  if v_recipe.id is null then
    insert into public.recipes (product_id, yield_qty, yield_unit, notes)
    values (p_product_id, p_yield_qty, v_yield_unit, v_notes)
    returning * into v_recipe;
  else
    update public.recipes
    set
      yield_qty = p_yield_qty,
      yield_unit = v_yield_unit,
      notes = v_notes
    where id = v_recipe.id
    returning * into v_recipe;
  end if;

  delete from public.recipe_items where recipe_id = v_recipe.id;

  insert into public.recipe_items (
    recipe_id,
    inventory_group_id,
    tier_rule,
    qty_base,
    input_qty,
    input_unit,
    sort_order
  )
  select
    v_recipe.id,
    (e->>'inventory_group_id')::uuid,
    coalesce(e->>'tier_rule', 'any'),
    case
      when (e->>'unit') = 'oz' then round((e->>'qty')::numeric * 30)::integer
      else round((e->>'qty')::numeric)::integer
    end,
    (e->>'qty')::numeric,
    e->>'unit',
    (ordinality - 1)::integer
  from jsonb_array_elements(v_items) with ordinality as t(e, ordinality);

  return v_recipe;
end;
$$;

revoke all on function public.upsert_inventory_group(
  uuid,
  text,
  uuid,
  text,
  boolean,
  boolean
) from public, anon;
grant execute on function public.upsert_inventory_group(
  uuid,
  text,
  uuid,
  text,
  boolean,
  boolean
) to authenticated;

revoke all on function public.upsert_inventory_item(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  integer,
  boolean,
  boolean
) from public, anon;
grant execute on function public.upsert_inventory_item(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  integer,
  boolean,
  boolean
) to authenticated;

revoke all on function public.upsert_product(
  uuid,
  text,
  text,
  uuid,
  text,
  numeric,
  numeric,
  boolean,
  integer,
  uuid,
  boolean,
  text
) from public, anon;
grant execute on function public.upsert_product(
  uuid,
  text,
  text,
  uuid,
  text,
  numeric,
  numeric,
  boolean,
  integer,
  uuid,
  boolean,
  text
) to authenticated;

revoke all on function public.upsert_recipe(uuid, numeric, text, text, jsonb)
  from public, anon;
grant execute on function public.upsert_recipe(uuid, numeric, text, text, jsonb)
  to authenticated;

create trigger inventory_item_groups_set_updated_at
before update on public.inventory_item_groups
for each row execute function private.set_updated_at();

create trigger inventory_item_groups_audit
after insert or update or delete on public.inventory_item_groups
for each row execute function private.audit_trigger();
