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
        not g.is_tiered
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
        not g.is_tiered
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
