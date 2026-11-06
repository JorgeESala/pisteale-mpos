create or replace function private.sale_promotions(
  p_items jsonb,
  p_promotion_ids uuid[],
  p_line_promotion jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manual_ids uuid[] := coalesce(p_promotion_ids, '{}'::uuid[]);
  v_units_count integer;
  v_gross_total numeric := 0;
  v_discount_total numeric := 0;
  v_subtotal numeric := 0;
  v_applications jsonb := '[]'::jsonb;
  v_promo record;
  v_eligible_count integer;
  v_apps integer;
  v_take integer;
  v_gross numeric;
  v_promo_total numeric;
  v_discount numeric;
  v_line_promo record;
  v_target_unit record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'El pedido debe incluir al menos un producto' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_manual_ids) as m(id)
    where m.id is null
      or not exists (
        select 1 from public.promotions p where p.id = m.id and p.active
      )
  ) then
    raise exception 'Promoción no encontrada o inactiva' using errcode = '22023';
  end if;

  drop table if exists pg_temp.sale_units;
  create temp table pg_temp.sale_units (
    id bigserial primary key,
    product_id uuid not null,
    tier text not null,
    unit_price numeric(12, 2) not null,
    category_id uuid,
    is_alcoholic boolean not null,
    used boolean not null default false
  ) on commit drop;

  insert into pg_temp.sale_units (
    product_id,
    tier,
    unit_price,
    category_id,
    is_alcoholic
  )
  select
    p.id,
    coalesce(e->>'tier', 'normal'),
    case
      when coalesce(e->>'tier', 'normal') = 'premium' then p.premium_price
      else p.price
    end,
    p.category_id,
    p.is_alcoholic
  from jsonb_array_elements(p_items) as e
  join public.products p on p.id = (e->>'product_id')::uuid
  cross join generate_series(1, (e->>'qty')::integer);

  select coalesce(sum(unit_price), 0)
  into v_gross_total
  from pg_temp.sale_units;

  select count(*) into v_units_count from pg_temp.sale_units;

  if v_units_count = 0 then
    raise exception 'El pedido debe incluir al menos un producto' using errcode = '22023';
  end if;

  if p_line_promotion is not null then
    select p.*
    into v_line_promo
    from public.promotions p
    where p.id = (p_line_promotion->>'promotion_id')::uuid
      and p.active
      and p.line_targeted;

    if not found then
      raise exception 'Promoción de precio por línea no encontrada o inactiva'
        using errcode = '22023';
    end if;

    if (p_line_promotion->>'tier') not in ('normal', 'premium') then
      raise exception 'Tier de precio por línea inválido' using errcode = '22023';
    end if;

    select u.id, u.unit_price
    into v_target_unit
    from pg_temp.sale_units u
    where u.product_id = (p_line_promotion->>'product_id')::uuid
      and u.tier = p_line_promotion->>'tier'
      and not u.used
      and (
        v_line_promo.applies_to = 'any'
        or (v_line_promo.applies_to = 'alcoholic' and u.is_alcoholic)
        or (v_line_promo.applies_to = 'non_alcoholic' and not u.is_alcoholic)
      )
      and (v_line_promo.applies_to_tier = 'any' or v_line_promo.applies_to_tier = u.tier)
      and (
        cardinality(v_line_promo.include_category_ids) = 0
        or u.category_id = any(v_line_promo.include_category_ids)
      )
      and not (u.category_id = any(v_line_promo.exclude_category_ids))
    order by u.id
    limit 1;

    if not found then
      raise exception 'La bebida seleccionada no es elegible para esta promoción'
        using errcode = '22023';
    end if;

    v_gross := v_target_unit.unit_price;
    v_discount := greatest(0, round(v_gross - v_line_promo.fixed_price, 2));

    update pg_temp.sale_units
    set used = true
    where id = v_target_unit.id;

    v_discount_total := v_discount_total + v_discount;
    v_applications := v_applications || jsonb_build_array(
      jsonb_build_object(
        'promotion_id', v_line_promo.id,
        'promotion_name', v_line_promo.name,
        'automatic', v_line_promo.automatic,
        'line_targeted', true,
        'bundle_qty', v_line_promo.bundle_qty,
        'applications', 1,
        'gross_amount', round(v_gross, 2),
        'discount_amount', v_discount
      )
    );
  end if;

  for v_promo in
    select p.*
    from public.promotions p
    where p.id = any(v_manual_ids)
      and not p.line_targeted
    order by array_position(v_manual_ids, p.id)
  loop
    select count(*)
    into v_eligible_count
    from pg_temp.sale_units u
    where not u.used
      and (
        v_promo.applies_to = 'any'
        or (v_promo.applies_to = 'alcoholic' and u.is_alcoholic)
        or (v_promo.applies_to = 'non_alcoholic' and not u.is_alcoholic)
      )
      and (v_promo.applies_to_tier = 'any' or v_promo.applies_to_tier = u.tier)
      and (
        cardinality(v_promo.include_category_ids) = 0
        or u.category_id = any(v_promo.include_category_ids)
      )
      and not (u.category_id = any(v_promo.exclude_category_ids));

    v_apps := v_eligible_count / v_promo.bundle_qty;

    if v_apps > 0 then
      v_take := v_apps * v_promo.bundle_qty;

      select coalesce(sum(unit_price), 0)
      into v_gross
      from (
        select u.unit_price
        from pg_temp.sale_units u
        where not u.used
          and (
            v_promo.applies_to = 'any'
            or (v_promo.applies_to = 'alcoholic' and u.is_alcoholic)
            or (v_promo.applies_to = 'non_alcoholic' and not u.is_alcoholic)
          )
          and (v_promo.applies_to_tier = 'any' or v_promo.applies_to_tier = u.tier)
          and (
            cardinality(v_promo.include_category_ids) = 0
            or u.category_id = any(v_promo.include_category_ids)
          )
          and not (u.category_id = any(v_promo.exclude_category_ids))
        order by u.unit_price desc, u.id
        limit v_take
      ) selected;

      v_promo_total := round(v_promo.fixed_price * v_apps, 2);
      v_discount := greatest(0, round(v_gross - v_promo_total, 2));

      update pg_temp.sale_units u
      set used = true
      where u.id in (
        select u.id
        from pg_temp.sale_units u
        where not u.used
          and (
            v_promo.applies_to = 'any'
            or (v_promo.applies_to = 'alcoholic' and u.is_alcoholic)
            or (v_promo.applies_to = 'non_alcoholic' and not u.is_alcoholic)
          )
          and (v_promo.applies_to_tier = 'any' or v_promo.applies_to_tier = u.tier)
          and (
            cardinality(v_promo.include_category_ids) = 0
            or u.category_id = any(v_promo.include_category_ids)
          )
          and not (u.category_id = any(v_promo.exclude_category_ids))
        order by u.unit_price desc, u.id
        limit v_take
      );

      v_discount_total := v_discount_total + v_discount;
      v_applications := v_applications || jsonb_build_array(
        jsonb_build_object(
          'promotion_id', v_promo.id,
          'promotion_name', v_promo.name,
          'automatic', v_promo.automatic,
          'line_targeted', v_promo.line_targeted,
          'bundle_qty', v_promo.bundle_qty,
          'applications', v_apps,
          'gross_amount', round(v_gross, 2),
          'discount_amount', v_discount
        )
      );
    end if;
  end loop;

  for v_promo in
    select p.*
    from public.promotions p
    where p.active
      and p.automatic
      and not p.line_targeted
      and not (p.id = any(v_manual_ids))
    order by p.sort_order, p.name
  loop
    select count(*)
    into v_eligible_count
    from pg_temp.sale_units u
    where not u.used
      and (
        v_promo.applies_to = 'any'
        or (v_promo.applies_to = 'alcoholic' and u.is_alcoholic)
        or (v_promo.applies_to = 'non_alcoholic' and not u.is_alcoholic)
      )
      and (v_promo.applies_to_tier = 'any' or v_promo.applies_to_tier = u.tier)
      and (
        cardinality(v_promo.include_category_ids) = 0
        or u.category_id = any(v_promo.include_category_ids)
      )
      and not (u.category_id = any(v_promo.exclude_category_ids));

    v_apps := v_eligible_count / v_promo.bundle_qty;

    if v_apps > 0 then
      v_take := v_apps * v_promo.bundle_qty;

      select coalesce(sum(unit_price), 0)
      into v_gross
      from (
        select u.unit_price
        from pg_temp.sale_units u
        where not u.used
          and (
            v_promo.applies_to = 'any'
            or (v_promo.applies_to = 'alcoholic' and u.is_alcoholic)
            or (v_promo.applies_to = 'non_alcoholic' and not u.is_alcoholic)
          )
          and (v_promo.applies_to_tier = 'any' or v_promo.applies_to_tier = u.tier)
          and (
            cardinality(v_promo.include_category_ids) = 0
            or u.category_id = any(v_promo.include_category_ids)
          )
          and not (u.category_id = any(v_promo.exclude_category_ids))
        order by u.unit_price desc, u.id
        limit v_take
      ) selected;

      v_promo_total := round(v_promo.fixed_price * v_apps, 2);
      v_discount := greatest(0, round(v_gross - v_promo_total, 2));

      update pg_temp.sale_units u
      set used = true
      where u.id in (
        select u.id
        from pg_temp.sale_units u
        where not u.used
          and (
            v_promo.applies_to = 'any'
            or (v_promo.applies_to = 'alcoholic' and u.is_alcoholic)
            or (v_promo.applies_to = 'non_alcoholic' and not u.is_alcoholic)
          )
          and (v_promo.applies_to_tier = 'any' or v_promo.applies_to_tier = u.tier)
          and (
            cardinality(v_promo.include_category_ids) = 0
            or u.category_id = any(v_promo.include_category_ids)
          )
          and not (u.category_id = any(v_promo.exclude_category_ids))
        order by u.unit_price desc, u.id
        limit v_take
      );

      v_discount_total := v_discount_total + v_discount;
      v_applications := v_applications || jsonb_build_array(
        jsonb_build_object(
          'promotion_id', v_promo.id,
          'promotion_name', v_promo.name,
          'automatic', v_promo.automatic,
          'line_targeted', v_promo.line_targeted,
          'bundle_qty', v_promo.bundle_qty,
          'applications', v_apps,
          'gross_amount', round(v_gross, 2),
          'discount_amount', v_discount
        )
      );
    end if;
  end loop;

  v_subtotal := greatest(0, round(v_gross_total - v_discount_total, 2));

  drop table if exists pg_temp.sale_units;

  return jsonb_build_object(
    'gross_total', round(v_gross_total, 2),
    'discount_total', round(v_discount_total, 2),
    'subtotal', v_subtotal,
    'promotions', v_applications
  );
end;
$$;

create or replace function private.sale_promotions(
  p_items jsonb,
  p_promotion_ids uuid[]
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.sale_promotions(p_items, p_promotion_ids, null);
$$;

revoke all on function private.sale_promotions(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function private.sale_promotions(jsonb, uuid[], jsonb)
  from public, anon, authenticated;
