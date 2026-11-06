create or replace function private.sale_warnings(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warnings jsonb := '[]'::jsonb;
  v_line record;
  v_product record;
  v_tier text;
  v_qty integer;
  v_recipe record;
  v_ri record;
  v_required numeric;
  v_available numeric;
  v_default record;
  v_default_required numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'El pedido debe incluir al menos un producto' using errcode = '22023';
  end if;

  for v_line in
    select
      (e->>'product_id')::uuid as product_id,
      coalesce(e->>'tier', 'normal') as tier,
      (e->>'qty')::integer as qty
    from jsonb_array_elements(p_items) as e
  loop
    v_tier := v_line.tier;
    v_qty := v_line.qty;

    if v_tier not in ('normal', 'premium') then
      raise exception 'Tier de venta inválido' using errcode = '22023';
    end if;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad de venta inválida' using errcode = '22023';
    end if;

    select p.id, p.name, p.kind, p.active, p.is_alcoholic, p.premium_price
    into v_product
    from public.products p
    where p.id = v_line.product_id;

    if not found then
      raise exception 'Producto no encontrado' using errcode = '22023';
    end if;

    if not v_product.active or v_product.kind <> 'preparado' then
      raise exception 'Solo se pueden vender bebidas preparadas activas' using errcode = '22023';
    end if;

    if v_tier = 'premium'
      and (not v_product.is_alcoholic or v_product.premium_price is null) then
      raise exception 'Este producto no tiene precio premium' using errcode = '22023';
    end if;

    if public.product_cost(v_product.id, v_tier) is null then
      v_warnings := v_warnings || jsonb_build_array(
        jsonb_build_object(
          'type', 'cost_pending',
          'product_id', v_product.id,
          'product_name', v_product.name
        )
      );
    end if;

    select r.id, r.yield_qty
    into v_recipe
    from public.recipes r
    where r.product_id = v_product.id;

    if v_recipe.id is null
      or not exists (
        select 1 from public.recipe_items ri where ri.recipe_id = v_recipe.id
      ) then
      v_warnings := v_warnings || jsonb_build_array(
        jsonb_build_object(
          'type', 'no_recipe',
          'product_id', v_product.id,
          'product_name', v_product.name
        )
      );
    else
      for v_ri in
        select
          ri.inventory_group_id,
          ri.tier_rule,
          ri.qty_base,
          g.name as group_name,
          g.base_unit,
          g.is_tiered
        from public.recipe_items ri
        join public.inventory_item_groups g on g.id = ri.inventory_group_id
        where ri.recipe_id = v_recipe.id
      loop
        v_required := round(
          (v_ri.qty_base::numeric / v_recipe.yield_qty) * v_qty,
          4
        );

        select coalesce(sum(m.qty_base), 0)
        into v_available
        from public.inventory_items i
        join public.inventory_item_groups g on g.id = i.group_id
        left join (
          select item_id, sum(qty_base) as qty_base
          from public.inventory_movements
          group by item_id
        ) m on m.item_id = i.id
        where i.group_id = v_ri.inventory_group_id
          and i.active
          and (
            not g.is_tiered
            or v_ri.tier_rule = 'any'
            or (
              v_ri.tier_rule = 'match'
              and i.tier = case when v_tier = 'premium' then 'premium' else 'estandar' end
            )
            or (v_ri.tier_rule = 'estandar' and i.tier = 'estandar')
            or (v_ri.tier_rule = 'premium' and i.tier = 'premium')
          );

        if v_available < v_required then
          v_warnings := v_warnings || jsonb_build_array(
            jsonb_build_object(
              'type', 'stock',
              'scope', 'recipe',
              'group_id', v_ri.inventory_group_id,
              'group_name', v_ri.group_name,
              'required_base', v_required,
              'available_base', round(v_available, 4),
              'missing_base', round(v_required - v_available, 4),
              'base_unit', v_ri.base_unit
            )
          );
        end if;
      end loop;
    end if;

    for v_default in
      select
        d.role,
        d.qty_base,
        d.inventory_group_id as group_id,
        g.name as group_name,
        g.base_unit
      from public.recipe_default_consumables d
      join public.inventory_item_groups g on g.id = d.inventory_group_id
      where d.active
        and d.applies_to_kind = 'preparado'
        and d.role in ('cup', 'lid', 'straw')
    loop
      v_default_required := round(coalesce(v_default.qty_base, 1) * v_qty, 4);

      select coalesce(sum(m.qty_base), 0)
      into v_available
      from public.inventory_items i
      left join (
        select item_id, sum(qty_base) as qty_base
        from public.inventory_movements
        group by item_id
      ) m on m.item_id = i.id
      where i.group_id = v_default.group_id
        and i.active;

      if v_available < v_default_required then
        v_warnings := v_warnings || jsonb_build_array(
          jsonb_build_object(
            'type', 'stock',
            'scope', 'consumable',
            'role', v_default.role,
            'group_id', v_default.group_id,
            'group_name', v_default.group_name,
            'required_base', v_default_required,
            'available_base', round(v_available, 4),
            'missing_base', round(v_default_required - v_available, 4),
            'base_unit', v_default.base_unit
          )
        );
      end if;
    end loop;
  end loop;

  return v_warnings;
end;
$$;

revoke all on function private.sale_warnings(jsonb) from public, anon, authenticated;

create or replace function public.preview_sale(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_operator();

  return jsonb_build_object('warnings', private.sale_warnings(p_items));
end;
$$;

revoke all on function public.preview_sale(jsonb) from public, anon;
grant execute on function public.preview_sale(jsonb) to authenticated;
