create or replace function private.consolidate_inventory_group_family(
  p_target text,
  p_category text,
  p_base_unit text,
  p_is_tiered boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_id uuid;
  v_target_unit text;
  v_target_tiered boolean;
  v_category_id uuid;
  v_source_ids uuid[] := '{}'::uuid[];
begin
  if p_target is null or btrim(p_target) = '' then
    raise exception 'Grupo destino inválido' using errcode = '22023';
  end if;

  if p_base_unit is null or p_base_unit not in ('ml', 'g', 'pza') then
    raise exception 'Unidad base inválida' using errcode = '22023';
  end if;

  select id, base_unit, is_tiered
  into v_target_id, v_target_unit, v_target_tiered
  from public.inventory_item_groups
  where name = p_target;

  select coalesce(array_agg(id order by name), '{}'::uuid[])
  into v_source_ids
  from public.inventory_item_groups
  where active = true
    and name <> p_target
    and name like p_target || ' %';

  if v_target_id is null then
    if cardinality(v_source_ids) = 0 then
      return;
    end if;

    select id into v_category_id
    from public.inventory_categories
    where name = p_category;

    insert into public.inventory_item_groups (
      name,
      category_id,
      base_unit,
      is_tiered,
      active
    )
    values (
      p_target,
      v_category_id,
      p_base_unit,
      coalesce(p_is_tiered, false),
      true
    )
    returning id, base_unit, is_tiered
    into v_target_id, v_target_unit, v_target_tiered;
  else
    if cardinality(v_source_ids) = 0 then
      return;
    end if;

    if v_target_unit <> p_base_unit then
      raise exception 'El grupo % tiene una unidad base distinta', p_target
        using errcode = '22023';
    end if;

    update public.inventory_item_groups
    set active = true
    where id = v_target_id
      and not active;
  end if;

  update public.inventory_items
  set
    group_id = v_target_id,
    tier = case
      when v_target_tiered then coalesce(tier, 'estandar')
      else null
    end
  where group_id = any(v_source_ids);

  drop table if exists pg_temp.recipe_group_remap;

  create temp table pg_temp.recipe_group_remap on commit drop as
  select
    ri.recipe_id,
    sum(ri.qty_base) as qty_base,
    min(ri.sort_order) as sort_order
  from public.recipe_items ri
  where ri.inventory_group_id = any(v_source_ids)
     or ri.inventory_group_id = v_target_id
  group by ri.recipe_id;

  delete from public.recipe_items
  where inventory_group_id = any(v_source_ids)
     or inventory_group_id = v_target_id;

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
    r.recipe_id,
    v_target_id,
    'any',
    round(r.qty_base, 4),
    round(r.qty_base, 4),
    v_target_unit,
    coalesce(r.sort_order, 0)
  from pg_temp.recipe_group_remap r;

  drop table if exists pg_temp.recipe_group_remap;

  update public.inventory_item_groups
  set active = false
  where id = any(v_source_ids);
end;
$$;

revoke all on function private.consolidate_inventory_group_family(text, text, text, boolean)
  from public, anon, authenticated;

select private.consolidate_inventory_group_family('Ron', 'Destilados', 'ml', true);
select private.consolidate_inventory_group_family('Tequila', 'Destilados', 'ml', true);
select private.consolidate_inventory_group_family('Vodka', 'Destilados', 'ml', true);
select private.consolidate_inventory_group_family('Ginebra', 'Destilados', 'ml', true);
