alter table public.recipe_items
  alter column qty_base type numeric(14, 4) using qty_base::numeric(14, 4);

update public.recipe_items ri
set
  qty_base = case p.name
    when 'Mojito' then 0.8333
    when 'Margarita' then 0.5
    when 'Cuba Libre' then 0.1667
    when 'Gin Tonic' then 0.1667
    when 'Tom Collins' then 0.1667
    when 'Vodka Tonic' then 0.5
  end,
  input_qty = case p.name
    when 'Mojito' then 0.8333
    when 'Margarita' then 0.5
    when 'Cuba Libre' then 0.1667
    when 'Gin Tonic' then 0.1667
    when 'Tom Collins' then 0.1667
    when 'Vodka Tonic' then 0.5
  end
from public.recipes r
join public.products p on p.id = r.product_id
where r.id = ri.recipe_id
  and ri.inventory_group_id = (
    select id from public.inventory_item_groups where name = 'Limón'
  )
  and p.name in (
    'Mojito',
    'Margarita',
    'Cuba Libre',
    'Gin Tonic',
    'Tom Collins',
    'Vodka Tonic'
  );

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
  perform private.require_manage_catalog();

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
      when (e->>'unit') = 'oz' then round((e->>'qty')::numeric * 30, 4)
      else round((e->>'qty')::numeric, 4)
    end,
    (e->>'qty')::numeric,
    e->>'unit',
    (ordinality - 1)::integer
  from jsonb_array_elements(v_items) with ordinality as t(e, ordinality);

  return v_recipe;
end;
$$;

revoke all on function public.upsert_inventory_group(uuid, text, uuid, text, boolean, boolean)
  from public, anon;
grant execute on function public.upsert_inventory_group(uuid, text, uuid, text, boolean, boolean)
  to authenticated;

revoke all on function public.upsert_inventory_item(
  uuid, uuid, text, text, text, text, numeric, numeric, integer, boolean, boolean
) from public, anon;
grant execute on function public.upsert_inventory_item(
  uuid, uuid, text, text, text, text, numeric, numeric, integer, boolean, boolean
) to authenticated;

revoke all on function public.upsert_product(
  uuid, text, text, uuid, text, numeric, numeric, boolean, integer, uuid, boolean, text
) from public, anon;
grant execute on function public.upsert_product(
  uuid, text, text, uuid, text, numeric, numeric, boolean, integer, uuid, boolean, text
) to authenticated;

