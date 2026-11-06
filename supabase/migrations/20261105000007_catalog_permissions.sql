alter table public.profiles
  add column can_manage_catalog boolean not null default false;

create or replace function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and (
        role = 'admin'::public.user_role
        or (p_permission = 'view_financials' and can_view_financials)
        or (p_permission = 'adjust_inventory' and can_adjust_inventory)
        or (p_permission = 'manage_catalog' and can_manage_catalog)
        or (
          p_permission in ('read', 'operate')
          and role in (
            'admin'::public.user_role,
            'operador'::public.user_role,
            'consulta'::public.user_role
          )
        )
      )
  );
$$;

create or replace function private.require_manage_catalog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('manage_catalog') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_manage_catalog() from public, anon, authenticated;

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
  perform private.require_manage_catalog();

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
  perform private.require_manage_catalog();

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
  perform private.require_manage_catalog();

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

revoke all on function public.upsert_recipe(uuid, numeric, text, text, jsonb)
  from public, anon;
grant execute on function public.upsert_recipe(uuid, numeric, text, text, jsonb)
  to authenticated;

drop function if exists public.admin_set_profile(
  uuid,
  public.user_role,
  boolean,
  boolean,
  boolean
);

create or replace function public.admin_set_profile(
  p_user_id uuid,
  p_role public.user_role,
  p_active boolean,
  p_can_view_financials boolean,
  p_can_adjust_inventory boolean,
  p_can_manage_catalog boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  perform private.require_admin();

  if p_user_id = auth.uid() and p_role <> 'admin'::public.user_role then
    raise exception 'No puedes quitarte el rol de administrador';
  end if;

  update public.profiles
  set
    role = p_role,
    active = p_active,
    can_view_financials = p_can_view_financials,
    can_adjust_inventory = p_can_adjust_inventory,
    can_manage_catalog = p_can_manage_catalog,
    updated_at = now()
  where id = p_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Perfil no encontrado';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.admin_set_profile(
  uuid,
  public.user_role,
  boolean,
  boolean,
  boolean,
  boolean
) from public, anon;
grant execute on function public.admin_set_profile(
  uuid,
  public.user_role,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

create or replace function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  email text,
  role public.user_role,
  active boolean,
  can_view_financials boolean,
  can_adjust_inventory boolean,
  can_manage_catalog boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    p.role,
    p.active,
    p.can_view_financials,
    p.can_adjust_inventory,
    p.can_manage_catalog,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.full_name, u.email;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
