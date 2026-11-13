update public.recipe_items ri
set
  qty_base = 0.1667,
  input_qty = 0.1667
from public.recipes r
join public.products p on p.id = r.product_id
where r.id = ri.recipe_id
  and ri.inventory_group_id = (
    select id from public.inventory_item_groups where name = 'Naranja'
  )
  and p.name in ('Desarmador', 'Havana''s Light');

delete from public.recipe_items ri
using public.recipes r, public.products p, public.inventory_item_groups g
where r.id = ri.recipe_id
  and p.id = r.product_id
  and g.id = ri.inventory_group_id
  and p.name = 'Paloma'
  and g.name = 'Toronja';
