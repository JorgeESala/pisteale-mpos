with values_to_seed (name, cost) as (
  values
    ('Ron blanco', 0.163::numeric),
    ('Ron oscuro', 0.279086::numeric),
    ('Tequila blanco', 0.09888::numeric),
    ('Vodka', 0.183::numeric),
    ('Ginebra', 0.16528::numeric),
    ('Licor de naranja', 0.04978::numeric),
    ('Licor de melón', 0.14565::numeric),
    ('Licor de fresa', 0.17461::numeric),
    ('Licor de coco', 0.15191::numeric),
    ('Licor de cassis', 0.653686::numeric),
    ('Vino tinto', 0.153333::numeric),
    ('Agua mineral', 0.0145::numeric),
    ('Agua tónica', 0.049296::numeric),
    ('Refresco de cola', 0.018::numeric),
    ('Sprite', 0.0142::numeric),
    ('Jugo de naranja', 0.048958::numeric),
    ('Jugo de piña', 0.02381::numeric),
    ('Jugo de toronja', 0.0425::numeric),
    ('Jugo de limón', 0.04::numeric),
    ('Crema de coco', 0.068::numeric),
    ('Limón', 1.495::numeric),
    ('Naranja', 6.0::numeric),
    ('Menta', 0.119::numeric),
    ('Albahaca', 0.15::numeric),
    ('Jarabe natural', 0.07618::numeric),
    ('Granadina', 0.07618::numeric),
    ('Blue curaçao', 0.08094::numeric),
    ('Sal', 0.01::numeric),
    ('Hielo', 0.006::numeric),
    ('Vaso 940 ml', 2.72::numeric),
    ('Tapa 940 ml', 1.16::numeric),
    ('Popote', 0.86::numeric)
),
updated as (
  update public.inventory_item_groups g
  set
    reference_cost = v.cost,
    reference_cost_updated_at = now(),
    reference_cost_note = 'Carga inicial de costo de referencia',
    reference_cost_source = 'initial'
  from values_to_seed v
  where g.name = v.name
    and g.reference_cost is null
  returning g.id, g.reference_cost
)
insert into public.inventory_group_cost_history (
  group_id,
  old_cost,
  new_cost,
  note,
  source
)
select
  id,
  null,
  reference_cost,
  'Carga inicial de costo de referencia',
  'initial'
from updated;
