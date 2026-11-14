do $$
declare
  v_target text;
  v_target_id uuid;
  v_source_ids uuid[];
begin
  foreach v_target in array array['Ron', 'Tequila', 'Vodka', 'Ginebra'] loop
    select id into v_target_id
    from public.inventory_item_groups
    where name = v_target;

    if v_target_id is null then
      continue;
    end if;

    select coalesce(array_agg(id), '{}'::uuid[])
    into v_source_ids
    from public.inventory_item_groups
    where name <> v_target
      and name like v_target || ' %';

    if cardinality(v_source_ids) = 0 then
      continue;
    end if;

    delete from public.recipe_default_consumables d
    where d.inventory_group_id = any(v_source_ids)
      and exists (
        select 1
        from public.recipe_default_consumables t
        where t.role = d.role
          and t.inventory_group_id = v_target_id
      );

    update public.recipe_default_consumables
    set inventory_group_id = v_target_id
    where inventory_group_id = any(v_source_ids);
  end loop;
end
$$;
