-- Precios manuales por paquete para costear recetas.
-- El precio del paquete se sincroniza con el costo de referencia del grupo
-- cuando el grupo tiene un solo insumo activo. Así el motor de costos actual
-- sigue usando reference_cost, pero la captura es por presentación de compra.

alter table public.inventory_items
  add column package_price numeric(14, 4) not null default 0
    check (package_price >= 0),
  add column package_price_updated_at timestamptz;

comment on column public.inventory_items.package_price is
  'Precio manual del paquete de compra (MXN). Se captura desde la página de precios de insumos.';
comment on column public.inventory_items.package_price_updated_at is
  'Última vez que se actualizó el precio manual del paquete.';

update public.inventory_items
set
  package_price = round(avg_cost * purchase_factor, 4),
  package_price_updated_at = updated_at
where avg_cost > 0;

-- En producción los precios manuales viven en reference_cost. Para grupos con
-- un solo insumo activo, precargamos el precio de paquete desde ahí.
update public.inventory_items i
set
  package_price = round(g.reference_cost * i.purchase_factor, 4),
  package_price_updated_at = coalesce(g.reference_cost_updated_at, now())
from public.inventory_item_groups g
where g.id = i.group_id
  and g.reference_cost is not null
  and g.reference_cost > 0
  and i.active
  and (
    select count(*)
    from public.inventory_items i2
    where i2.group_id = i.group_id
      and i2.active
  ) = 1;

create or replace view public.v_inventory_items
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
  i.updated_at,
  i.package_price,
  i.package_price_updated_at,
  case
    when i.package_price > 0 and i.purchase_factor > 0
      then round(i.package_price / i.purchase_factor, 6)
    else null
  end as recipe_unit_cost
from public.inventory_items i
join public.inventory_item_groups g on g.id = i.group_id
left join public.inventory_categories c on c.id = g.category_id;

revoke all on public.v_inventory_items from anon, authenticated;
grant select on public.v_inventory_items to authenticated;

create or replace function public.set_inventory_package_prices(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_row record;
  v_item record;
  v_group_item_count integer;
  v_old_cost numeric;
  v_new_cost numeric;
  v_note text;
  v_presentation text;
begin
  perform private.require_admin();

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La lista de precios es inválida' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_items);

  if v_count < 1 or v_count > 500 then
    raise exception 'La lista de precios debe incluir entre 1 y 500 insumos'
      using errcode = '22023';
  end if;

  if (
    select count(distinct e->>'item_id')
    from jsonb_array_elements(p_items) as e
  ) <> v_count then
    raise exception 'Insumo duplicado en la lista de precios' using errcode = '22023';
  end if;

  for v_row in
    select
      nullif(btrim(e->>'item_id'), '')::uuid as item_id,
      nullif(btrim(e->>'package_price'), '')::numeric as package_price
    from jsonb_array_elements(p_items) as e
  loop
    if v_row.item_id is null then
      raise exception 'Insumo inválido en la lista de precios' using errcode = '22023';
    end if;

    if v_row.package_price is null or v_row.package_price < 0 then
      raise exception 'Precio inválido en la lista de precios' using errcode = '22023';
    end if;

    select
      i.id,
      i.group_id,
      i.purchase_factor,
      i.purchase_unit,
      i.active as item_active,
      g.base_unit
    into v_item
    from public.inventory_items i
    join public.inventory_item_groups g on g.id = i.group_id
    where i.id = v_row.item_id;

    if v_item.id is null then
      raise exception 'Insumo no encontrado en la lista de precios' using errcode = 'P0001';
    end if;

    update public.inventory_items
    set
      package_price = round(v_row.package_price, 4),
      package_price_updated_at = now()
    where id = v_item.id;

    select count(*)
    into v_group_item_count
    from public.inventory_items
    where group_id = v_item.group_id
      and active;

    if v_group_item_count = 1 and v_item.item_active then
      v_new_cost := case
        when v_row.package_price > 0 then round(v_row.package_price / v_item.purchase_factor, 6)
        else null
      end;

      v_presentation := case
        when v_item.base_unit = 'pza' and v_item.purchase_factor = 1 then 'la pieza'
        when v_item.base_unit = 'g' and v_item.purchase_factor = 1000
          and v_item.purchase_unit = 'kg' then 'por 1 kg'
        when v_item.base_unit = 'ml' and v_item.purchase_factor >= 1000 then
          'la ' || v_item.purchase_unit || ' de ' ||
          rtrim(to_char(v_item.purchase_factor / 1000, 'FM999999990.999'), '.') || ' L'
        when v_item.base_unit = 'g' and v_item.purchase_factor >= 1000 then
          'la ' || v_item.purchase_unit || ' de ' ||
          rtrim(to_char(v_item.purchase_factor / 1000, 'FM999999990.999'), '.') || ' kg'
        else
          'la ' || v_item.purchase_unit || ' de ' ||
          rtrim(to_char(v_item.purchase_factor, 'FM999999990.999'), '.') || ' ' ||
          v_item.base_unit
      end;

      v_note := case
        when v_new_cost is null then 'Precio del paquete eliminado'
        else
          'Precio del paquete · $' ||
          to_char(round(v_row.package_price, 2), 'FM999999990.00') || ' ' || v_presentation
      end;

      select reference_cost
      into v_old_cost
      from public.inventory_item_groups
      where id = v_item.group_id
      for update;

      update public.inventory_item_groups
      set
        reference_cost = v_new_cost,
        reference_cost_updated_at = now(),
        reference_cost_note = v_note,
        reference_cost_source = 'package_price'
      where id = v_item.group_id;

      insert into public.inventory_group_cost_history (
        group_id,
        old_cost,
        new_cost,
        note,
        source,
        created_by
      )
      values (
        v_item.group_id,
        v_old_cost,
        v_new_cost,
        v_note,
        'package_price',
        auth.uid()
      );
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.set_inventory_package_prices(jsonb) is
  'Actualiza precios de paquete y sincroniza el costo de referencia en grupos de un solo insumo.';

revoke all on function public.set_inventory_package_prices(jsonb) from public, anon;
grant execute on function public.set_inventory_package_prices(jsonb) to authenticated;

-- Si un grupo tiered solo tiene una marca activa, se usa esa misma marca para
-- normal y premium, tanto al costear como al descontar inventario.
create or replace function private.consume_sale_group(
  p_group_id uuid,
  p_order_tier text,
  p_tier_rule text,
  p_qty_base numeric,
  p_order_id uuid,
  p_order_item_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining numeric := round(p_qty_base, 4);
  v_single_item boolean;
  v_item record;
  v_take numeric;
  v_open_take numeric;
  v_take_bottle numeric;
  v_bottle record;
  v_first_item record;
begin
  if v_remaining <= 0 then
    return;
  end if;

  select count(*) = 1
  into v_single_item
  from public.inventory_items
  where group_id = p_group_id
    and active;

  for v_item in
    select
      i.id,
      i.avg_cost,
      i.tier,
      coalesce(m.qty_base, 0) as current_qty
    from public.inventory_items i
    join public.inventory_item_groups g on g.id = i.group_id
    left join (
      select item_id, sum(qty_base) as qty_base
      from public.inventory_movements
      group by item_id
    ) m on m.item_id = i.id
    where i.group_id = p_group_id
      and i.active
      and (
        v_single_item
        or not g.is_tiered
        or p_tier_rule = 'any'
        or (
          p_tier_rule = 'match'
          and i.tier = case when p_order_tier = 'premium' then 'premium' else 'estandar' end
        )
        or (p_tier_rule = 'estandar' and i.tier = 'estandar')
        or (p_tier_rule = 'premium' and i.tier = 'premium')
      )
    order by
      case
        when g.is_tiered
          and p_tier_rule = 'any'
          and i.tier = case when p_order_tier = 'premium' then 'premium' else 'estandar' end
        then 0
        else 1
      end,
      coalesce(
        (
          select min(m2.occurred_at)
          from public.inventory_movements m2
          where m2.item_id = i.id
            and m2.movement_type = 'purchase'
        ),
        i.created_at
      ),
      i.name
  loop
    if v_remaining <= 0 then
      exit;
    end if;

    v_take := least(v_remaining, greatest(v_item.current_qty, 0));

    if v_take > 0 then
      v_open_take := v_take;

      for v_bottle in
        select id, remaining_ml
        from public.bottle_openings
        where item_id = v_item.id
          and status = 'open'
        order by opened_at, id
      loop
        if v_open_take <= 0 then
          exit;
        end if;

        v_take_bottle := least(v_open_take, v_bottle.remaining_ml);

        if v_take_bottle > 0 then
          insert into public.inventory_movements (
            item_id,
            movement_type,
            qty_base,
            unit_cost,
            total_cost,
            notes,
            occurred_at,
            created_by,
            bottle_opening_id,
            order_id,
            order_item_id
          )
          values (
            v_item.id,
            'consumption',
            -v_take_bottle,
            v_item.avg_cost,
            round(v_take_bottle * v_item.avg_cost, 2),
            p_notes,
            now(),
            auth.uid(),
            v_bottle.id,
            p_order_id,
            p_order_item_id
          );

          update public.bottle_openings
          set
            remaining_ml = remaining_ml - v_take_bottle,
            status = case when remaining_ml - v_take_bottle = 0 then 'finished' else 'open' end,
            finished_at = case when remaining_ml - v_take_bottle = 0 then now() else null end
          where id = v_bottle.id;

          v_open_take := v_open_take - v_take_bottle;
        end if;
      end loop;

      if v_open_take > 0 then
        insert into public.inventory_movements (
          item_id,
          movement_type,
          qty_base,
          unit_cost,
          total_cost,
          notes,
          occurred_at,
          created_by,
          order_id,
          order_item_id
        )
        values (
          v_item.id,
          'consumption',
          -v_open_take,
          v_item.avg_cost,
          round(v_open_take * v_item.avg_cost, 2),
          p_notes,
          now(),
          auth.uid(),
          p_order_id,
          p_order_item_id
        );
      end if;

      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  if v_remaining > 0 then
    select
      i.id,
      i.avg_cost
    into v_first_item
    from public.inventory_items i
    join public.inventory_item_groups g on g.id = i.group_id
    where i.group_id = p_group_id
      and i.active
      and (
        v_single_item
        or not g.is_tiered
        or p_tier_rule = 'any'
        or (
          p_tier_rule = 'match'
          and i.tier = case when p_order_tier = 'premium' then 'premium' else 'estandar' end
        )
        or (p_tier_rule = 'estandar' and i.tier = 'estandar')
        or (p_tier_rule = 'premium' and i.tier = 'premium')
      )
    order by
      case
        when g.is_tiered
          and p_tier_rule = 'any'
          and i.tier = case when p_order_tier = 'premium' then 'premium' else 'estandar' end
        then 0
        else 1
      end,
      i.name
    limit 1;

    if v_first_item.id is not null then
      insert into public.inventory_movements (
        item_id,
        movement_type,
        qty_base,
        unit_cost,
        total_cost,
        notes,
        occurred_at,
        created_by,
        order_id,
        order_item_id
      )
      values (
        v_first_item.id,
        'consumption',
        -v_remaining,
        v_first_item.avg_cost,
        round(v_remaining * v_first_item.avg_cost, 2),
        p_notes,
        now(),
        auth.uid(),
        p_order_id,
        p_order_item_id
      );
    end if;
  end if;
end;
$$;

revoke all on function private.consume_sale_group(uuid, text, text, numeric, uuid, uuid, text)
  from public, anon, authenticated;

-- La vista previa de venta debe usar el mismo fallback de marca única que el
-- descuento real de inventario.
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
            (
              select count(*) = 1
              from public.inventory_items i2
              where i2.group_id = v_ri.inventory_group_id
                and i2.active
            )
            or not g.is_tiered
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
