create or replace function public.preview_sale(
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
  v_warnings jsonb;
  v_promotions jsonb;
begin
  perform private.require_operator();

  v_warnings := private.sale_warnings(p_items);
  v_promotions := private.sale_promotions(p_items, p_promotion_ids, p_line_promotion);

  return jsonb_build_object(
    'warnings', v_warnings,
    'gross_total', v_promotions->'gross_total',
    'discount_total', v_promotions->'discount_total',
    'subtotal', v_promotions->'subtotal',
    'promotions', v_promotions->'promotions'
  );
end;
$$;

revoke all on function public.preview_sale(jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.preview_sale(jsonb, uuid[], jsonb) to authenticated;

create or replace function public.create_sale(
  p_items jsonb,
  p_promotion_ids uuid[],
  p_line_promotion jsonb,
  p_payment_method text,
  p_payment_reference text,
  p_tip numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warnings jsonb;
  v_promotions jsonb;
  v_order_id uuid;
  v_order_item_id uuid;
  v_folio text;
  v_line record;
  v_product record;
  v_tier text;
  v_qty integer;
  v_unit_price numeric;
  v_line_total numeric;
  v_unit_cost numeric;
  v_line_cost numeric;
  v_gross_total numeric;
  v_discount_total numeric;
  v_subtotal numeric;
  v_cost_total numeric := 0;
  v_cost_complete boolean := true;
  v_tip numeric;
  v_notes text;
  v_reference text;
  v_recipe record;
  v_ri record;
  v_required numeric;
  v_default record;
  v_default_required numeric;
  v_promo_application jsonb;
begin
  perform private.require_operator();

  if p_payment_method not in ('cash', 'card', 'transfer', 'other') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;

  if p_tip is null or p_tip < 0 then
    raise exception 'Propina inválida' using errcode = '22023';
  end if;

  v_notes := btrim(coalesce(p_notes, ''));
  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  v_reference := btrim(coalesce(p_payment_reference, ''));
  if length(v_reference) > 100 then
    raise exception 'La referencia de pago es demasiado larga' using errcode = '22023';
  end if;

  v_tip := round(p_tip, 2);
  v_warnings := private.sale_warnings(p_items);
  v_promotions := private.sale_promotions(p_items, p_promotion_ids, p_line_promotion);
  v_gross_total := (v_promotions->>'gross_total')::numeric;
  v_discount_total := (v_promotions->>'discount_total')::numeric;
  v_subtotal := (v_promotions->>'subtotal')::numeric;
  v_folio := public.next_folio('order');

  insert into public.orders (
    folio,
    sold_at,
    status,
    gross_total,
    discount_total,
    subtotal,
    tip_total,
    total,
    cost_total,
    inventory_warnings,
    notes,
    created_by
  )
  values (
    v_folio,
    now(),
    'paid',
    v_gross_total,
    v_discount_total,
    v_subtotal,
    v_tip,
    round(v_subtotal + v_tip, 2),
    null,
    v_warnings,
    v_notes,
    auth.uid()
  )
  returning id into v_order_id;

  for v_line in
    select
      (e->>'product_id')::uuid as product_id,
      coalesce(e->>'tier', 'normal') as tier,
      (e->>'qty')::integer as qty,
      coalesce(e->>'notes', '') as notes
    from jsonb_array_elements(p_items) as e
  loop
    v_tier := v_line.tier;
    v_qty := v_line.qty;

    select p.id, p.name, p.price, p.premium_price
    into v_product
    from public.products p
    where p.id = v_line.product_id;

    v_unit_price := case when v_tier = 'premium' then v_product.premium_price else v_product.price end;
    v_line_total := round(v_unit_price * v_qty, 2);
    v_unit_cost := public.product_cost(v_product.id, v_tier);
    v_line_cost := case when v_unit_cost is null then null else round(v_unit_cost * v_qty, 2) end;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      tier,
      quantity,
      unit_price,
      line_total,
      unit_cost,
      line_cost,
      notes
    )
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_tier,
      v_qty,
      v_unit_price,
      v_line_total,
      v_unit_cost,
      v_line_cost,
      v_line.notes
    )
    returning id into v_order_item_id;

    if v_line_cost is null then
      v_cost_complete := false;
    else
      v_cost_total := v_cost_total + v_line_cost;
    end if;

    select r.id, r.yield_qty
    into v_recipe
    from public.recipes r
    where r.product_id = v_product.id;

    if v_recipe.id is not null then
      for v_ri in
        select inventory_group_id, tier_rule, qty_base
        from public.recipe_items
        where recipe_id = v_recipe.id
      loop
        v_required := round(
          (v_ri.qty_base::numeric / v_recipe.yield_qty) * v_qty,
          4
        );

        perform private.consume_sale_group(
          v_ri.inventory_group_id,
          v_tier,
          v_ri.tier_rule,
          v_required,
          v_order_id,
          v_order_item_id,
          'Venta ' || v_folio || ' · ' || v_product.name
        );
      end loop;
    end if;

    for v_default in
      select inventory_group_id, qty_base
      from public.recipe_default_consumables
      where active
        and applies_to_kind = 'preparado'
        and role in ('cup', 'lid', 'straw')
    loop
      v_default_required := round(coalesce(v_default.qty_base, 1) * v_qty, 4);

      perform private.consume_sale_group(
        v_default.inventory_group_id,
        v_tier,
        'any',
        v_default_required,
        v_order_id,
        v_order_item_id,
        'Consumible ' || v_folio
      );
    end loop;
  end loop;

  for v_promo_application in
    select value
    from jsonb_array_elements(v_promotions->'promotions')
  loop
    insert into public.order_promotions (
      order_id,
      promotion_id,
      promotion_name,
      automatic,
      line_targeted,
      bundle_qty,
      applications,
      gross_amount,
      discount_amount
    )
    values (
      v_order_id,
      (v_promo_application->>'promotion_id')::uuid,
      v_promo_application->>'promotion_name',
      (v_promo_application->>'automatic')::boolean,
      (v_promo_application->>'line_targeted')::boolean,
      (v_promo_application->>'bundle_qty')::integer,
      (v_promo_application->>'applications')::integer,
      (v_promo_application->>'gross_amount')::numeric,
      (v_promo_application->>'discount_amount')::numeric
    );
  end loop;

  update public.orders
  set cost_total = case when v_cost_complete then round(v_cost_total, 2) else null end
  where id = v_order_id;

  insert into public.payments (
    order_id,
    method,
    amount,
    tip_amount,
    reference,
    paid_at,
    created_by
  )
  values (
    v_order_id,
    p_payment_method,
    round(v_subtotal + v_tip, 2),
    v_tip,
    v_reference,
    now(),
    auth.uid()
  );

  return v_order_id;
end;
$$;

revoke all on function public.create_sale(jsonb, uuid[], jsonb, text, text, numeric, text)
  from public, anon;
grant execute on function public.create_sale(jsonb, uuid[], jsonb, text, text, numeric, text)
  to authenticated;
