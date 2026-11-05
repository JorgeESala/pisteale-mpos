create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category_id uuid references public.inventory_categories (id) on delete set null,
  kind text not null default 'ingrediente'
    check (kind in ('ingrediente', 'consumible', 'botella', 'preparacion')),
  base_unit text not null
    check (base_unit in ('ml', 'g', 'pza')),
  purchase_unit text not null default 'pza',
  purchase_factor numeric(14, 4) not null default 1 check (purchase_factor > 0),
  avg_cost numeric(14, 6) not null default 0 check (avg_cost >= 0),
  min_stock_base integer not null default 0 check (min_stock_base >= 0),
  track_stock boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  category_id uuid references public.product_categories (id) on delete set null,
  kind text not null default 'preparado'
    check (kind in ('preparado', 'botella', 'servicio')),
  price numeric(12, 2) not null default 0 check (price >= 0),
  is_alcoholic boolean not null default true,
  serving_size_ml integer not null default 1000 check (serving_size_ml > 0),
  inventory_item_id uuid references public.inventory_items (id) on delete set null,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now()
);

create unique index product_aliases_alias_lower_idx on public.product_aliases (lower(alias));

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products (id) on delete cascade,
  yield_qty numeric(14, 3) not null default 1 check (yield_qty > 0),
  yield_unit text not null default 'porcion',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  qty_base integer not null check (qty_base > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (recipe_id, inventory_item_id)
);

create index products_category_idx on public.products (category_id);
create index products_active_idx on public.products (active);
create index inventory_items_category_idx on public.inventory_items (category_id);
create index inventory_items_active_idx on public.inventory_items (active);
create index recipe_items_recipe_idx on public.recipe_items (recipe_id);

create view public.v_product_costs
with (security_invoker = true)
as
select
  p.id as product_id,
  p.name,
  p.category_id,
  pc.name as category_name,
  p.price,
  p.is_alcoholic,
  p.active,
  case
    when r.id is null or count(ri.id) = 0 then null
    else round((sum(ri.qty_base * ii.avg_cost) / r.yield_qty)::numeric, 2)
  end as estimated_cost,
  case
    when r.id is null or count(ri.id) = 0 then null
    else round(p.price - (sum(ri.qty_base * ii.avg_cost) / r.yield_qty)::numeric, 2)
  end as estimated_margin,
  case
    when r.id is null or count(ri.id) = 0 then false
    else true
  end as has_recipe,
  case
    when r.id is null or count(ri.id) = 0 then false
    else bool_and(ii.avg_cost > 0)
  end as cost_complete
from public.products p
left join public.product_categories pc on pc.id = p.category_id
left join public.recipes r on r.product_id = p.id
left join public.recipe_items ri on ri.recipe_id = r.id
left join public.inventory_items ii on ii.id = ri.inventory_item_id
group by
  p.id,
  p.name,
  p.category_id,
  pc.name,
  p.price,
  p.is_alcoholic,
  p.active,
  r.id,
  r.yield_qty;

create or replace function public.upsert_inventory_item(
  p_id uuid,
  p_name text,
  p_category_id uuid,
  p_kind text,
  p_base_unit text,
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
  v_item public.inventory_items;
begin
  perform private.require_admin();

  if v_name is null or length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  if p_kind not in ('ingrediente', 'consumible', 'botella', 'preparacion') then
    raise exception 'Tipo de insumo inválido' using errcode = '22023';
  end if;

  if p_base_unit not in ('ml', 'g', 'pza') then
    raise exception 'Unidad base inválida' using errcode = '22023';
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

  if p_id is null then
    insert into public.inventory_items (
      name,
      category_id,
      kind,
      base_unit,
      purchase_unit,
      purchase_factor,
      avg_cost,
      min_stock_base,
      track_stock,
      active
    )
    values (
      v_name,
      p_category_id,
      p_kind,
      p_base_unit,
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
      name = v_name,
      category_id = p_category_id,
      kind = p_kind,
      base_unit = p_base_unit,
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
        name,
        category_id,
        kind,
        base_unit,
        purchase_unit,
        purchase_factor,
        avg_cost,
        min_stock_base,
        track_stock,
        active
      )
      values (
        p_id,
        v_name,
        p_category_id,
        p_kind,
        p_base_unit,
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
  perform private.require_admin();

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
  perform private.require_admin();

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
      when not (e ? 'inventory_item_id') then true
      when not (e ? 'qty_base') then true
      when jsonb_typeof(e->'inventory_item_id') <> 'string' then true
      when (e->>'inventory_item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when jsonb_typeof(e->'qty_base') <> 'number' then true
      when (e->>'qty_base')::numeric <= 0 then true
      when (e->>'qty_base')::numeric <> trunc((e->>'qty_base')::numeric) then true
      else false
    end
  ) then
    raise exception 'Cantidad inválida en la receta' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_items) as e
    left join public.inventory_items ii on ii.id = (e->>'inventory_item_id')::uuid
    where ii.id is null
  ) then
    raise exception 'Insumo no encontrado' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(v_items)) <>
     (select count(distinct (e->>'inventory_item_id')) from jsonb_array_elements(v_items) as e) then
    raise exception 'Insumo duplicado en la receta' using errcode = '22023';
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

  insert into public.recipe_items (recipe_id, inventory_item_id, qty_base, sort_order)
  select
    v_recipe.id,
    (e->>'inventory_item_id')::uuid,
    (e->>'qty_base')::integer,
    (ordinality - 1)::integer
  from jsonb_array_elements(v_items) with ordinality as t(e, ordinality);

  return v_recipe;
end;
$$;

alter table public.product_categories enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;

create policy product_categories_select_active_users
on public.product_categories
for select
to authenticated
using (private.is_active_user());

create policy inventory_categories_select_active_users
on public.inventory_categories
for select
to authenticated
using (private.is_active_user());

create policy inventory_items_select_active_users
on public.inventory_items
for select
to authenticated
using (private.is_active_user());

create policy products_select_active_users
on public.products
for select
to authenticated
using (private.is_active_user());

create policy product_aliases_select_active_users
on public.product_aliases
for select
to authenticated
using (private.is_active_user());

create policy recipes_select_active_users
on public.recipes
for select
to authenticated
using (private.is_active_user());

create policy recipe_items_select_active_users
on public.recipe_items
for select
to authenticated
using (private.is_active_user());

revoke all on public.product_categories from anon, authenticated;
revoke all on public.inventory_categories from anon, authenticated;
revoke all on public.inventory_items from anon, authenticated;
revoke all on public.products from anon, authenticated;
revoke all on public.product_aliases from anon, authenticated;
revoke all on public.recipes from anon, authenticated;
revoke all on public.recipe_items from anon, authenticated;

grant select on public.product_categories to authenticated;
grant select on public.inventory_categories to authenticated;
grant select on public.inventory_items to authenticated;
grant select on public.products to authenticated;
grant select on public.product_aliases to authenticated;
grant select on public.recipes to authenticated;
grant select on public.recipe_items to authenticated;

revoke all on public.v_product_costs from anon, authenticated;
grant select on public.v_product_costs to authenticated;

revoke all on function public.upsert_inventory_item(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  numeric,
  numeric,
  integer,
  boolean,
  boolean
) from public, anon;
grant execute on function public.upsert_inventory_item(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  numeric,
  numeric,
  integer,
  boolean,
  boolean
) to authenticated;

revoke all on function public.upsert_product(
  uuid,
  text,
  text,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  uuid,
  boolean,
  text
) from public, anon;
grant execute on function public.upsert_product(
  uuid,
  text,
  text,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  uuid,
  boolean,
  text
) to authenticated;

revoke all on function public.upsert_recipe(uuid, numeric, text, text, jsonb)
  from public, anon;
grant execute on function public.upsert_recipe(uuid, numeric, text, text, jsonb)
  to authenticated;

insert into public.product_categories (name, sort_order)
values
  ('Ron', 10),
  ('Gin', 20),
  ('Vino', 30),
  ('Vodka', 40),
  ('Tequila', 50),
  ('Sin alcohol', 60),
  ('Especiales', 70)
on conflict (name) do nothing;

insert into public.inventory_categories (name, sort_order)
values
  ('Destilados', 10),
  ('Licores', 20),
  ('Vinos', 30),
  ('Mixers', 40),
  ('Frutas y hierbas', 50),
  ('Jarabes', 60),
  ('Consumibles', 70),
  ('Otros', 80)
on conflict (name) do nothing;

insert into public.inventory_items (
  name,
  category_id,
  kind,
  base_unit,
  purchase_unit,
  purchase_factor,
  avg_cost,
  min_stock_base,
  track_stock
)
select
  v.name,
  c.id,
  v.kind,
  v.base_unit,
  v.purchase_unit,
  v.purchase_factor,
  v.avg_cost,
  v.min_stock_base,
  v.track_stock
from (
  values
    ('Ron blanco', 'Destilados', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Ron oscuro', 'Destilados', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Tequila blanco', 'Destilados', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Tequila reposado', 'Destilados', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Vodka', 'Destilados', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Ginebra', 'Destilados', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Licor de naranja', 'Licores', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Licor de cassis', 'Licores', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Licor de melón', 'Licores', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Blue curaçao', 'Licores', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Licor de fresa', 'Licores', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Granadina', 'Licores', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Vino tinto', 'Vinos', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Agua mineral', 'Mixers', 'ingrediente', 'ml', 'botella', 1000::numeric, 0::numeric, 0, true),
    ('Agua tónica', 'Mixers', 'ingrediente', 'ml', 'botella', 1000::numeric, 0::numeric, 0, true),
    ('Refresco de cola', 'Mixers', 'ingrediente', 'ml', 'botella', 1000::numeric, 0::numeric, 0, true),
    ('Sprite', 'Mixers', 'ingrediente', 'ml', 'botella', 1000::numeric, 0::numeric, 0, true),
    ('Jugo de piña', 'Mixers', 'ingrediente', 'ml', 'botella', 1000::numeric, 0::numeric, 0, true),
    ('Jugo de naranja', 'Mixers', 'ingrediente', 'ml', 'botella', 1000::numeric, 0::numeric, 0, true),
    ('Jugo de toronja', 'Mixers', 'ingrediente', 'ml', 'botella', 1000::numeric, 0::numeric, 0, true),
    ('Crema de coco', 'Mixers', 'ingrediente', 'ml', 'botella', 750::numeric, 0::numeric, 0, true),
    ('Limón', 'Frutas y hierbas', 'ingrediente', 'pza', 'pza', 1::numeric, 0::numeric, 0, true),
    ('Naranja', 'Frutas y hierbas', 'ingrediente', 'pza', 'pza', 1::numeric, 0::numeric, 0, true),
    ('Toronja', 'Frutas y hierbas', 'ingrediente', 'pza', 'pza', 1::numeric, 0::numeric, 0, true),
    ('Hierbabuena', 'Frutas y hierbas', 'ingrediente', 'g', 'kg', 1000::numeric, 0::numeric, 0, true),
    ('Albahaca', 'Frutas y hierbas', 'ingrediente', 'g', 'kg', 1000::numeric, 0::numeric, 0, true),
    ('Jarabe natural', 'Jarabes', 'ingrediente', 'ml', 'botella', 1000::numeric, 0::numeric, 0, true),
    ('Jarabe de fresa', 'Jarabes', 'ingrediente', 'ml', 'botella', 1000::numeric, 0::numeric, 0, true),
    ('Vaso 1L', 'Consumibles', 'consumible', 'pza', 'caja', 25::numeric, 0::numeric, 0, true),
    ('Tapa 1L', 'Consumibles', 'consumible', 'pza', 'caja', 25::numeric, 0::numeric, 0, true),
    ('Popote', 'Consumibles', 'consumible', 'pza', 'bolsa', 100::numeric, 0::numeric, 0, true),
    ('Sal', 'Otros', 'ingrediente', 'g', 'kg', 1000::numeric, 0::numeric, 0, true),
    ('Hielo', 'Otros', 'ingrediente', 'g', 'bolsa', 2000::numeric, 0::numeric, 0, true),
    ('Azúcar', 'Otros', 'ingrediente', 'g', 'kg', 1000::numeric, 0::numeric, 0, true)
) as v(
  name,
  category_name,
  kind,
  base_unit,
  purchase_unit,
  purchase_factor,
  avg_cost,
  min_stock_base,
  track_stock
)
join public.inventory_categories c on c.name = v.category_name
on conflict (name) do nothing;

insert into public.products (
  name,
  description,
  category_id,
  kind,
  price,
  is_alcoholic,
  serving_size_ml,
  active
)
select
  v.name,
  '',
  c.id,
  'preparado',
  120.00,
  v.is_alcoholic,
  1000,
  v.active
from (
  values
    ('Mojito', 'Ron', true, true),
    ('Daiquirí', 'Ron', true, true),
    ('Cuba Libre', 'Ron', true, true),
    ('Mai Tai', 'Ron', true, true),
    ('Piña Colada', 'Ron', true, true),
    ('Midori Colado', 'Ron', true, true),
    ('Tom Collins', 'Gin', true, true),
    ('Gin Tonic', 'Gin', true, true),
    ('Rosaditos', 'Gin', true, true),
    ('Gin Basil Smash', 'Gin', true, true),
    ('Calimoncho', 'Vino', true, true),
    ('Tinto de Verano', 'Vino', true, true),
    ('Sangría', 'Vino', true, true),
    ('Clericot', 'Vino', true, true),
    ('Desarmador', 'Vodka', true, true),
    ('Absolute Gray House', 'Vodka', true, true),
    ('Vodka Tonic', 'Vodka', true, true),
    ('Vodka Smash', 'Vodka', true, true),
    ('Azulito', 'Vodka', true, true),
    ('Paloma', 'Tequila', true, true),
    ('Margarita', 'Tequila', true, true),
    ('Perro Salado', 'Tequila', true, true),
    ('Tequila Sunrise', 'Tequila', true, true),
    ('Limonada Eléctrica', 'Sin alcohol', false, true),
    ('Piña Colada sin alcohol', 'Sin alcohol', false, true),
    ('Tequila Mineral', 'Especiales', true, true),
    ('Vodka Mineral', 'Especiales', true, true),
    ('Havana''s Light', 'Especiales', true, true),
    ('Ponche de Frutas', 'Sin alcohol', false, false)
) as v(name, category_name, is_alcoholic, active)
join public.product_categories c on c.name = v.category_name
on conflict (name) do nothing;

insert into public.product_aliases (product_id, alias)
select p.id, v.alias
from (
  values
    ('Gin Basil Smash', 'gin smash'),
    ('Gin Basil Smash', 'gin basil smash'),
    ('Gin Basil Smash', 'gin brasil smash'),
    ('Gin Basil Smash', 'basil smash'),
    ('Daiquirí', 'daikiri'),
    ('Daiquirí', 'daiquiri'),
    ('Rosaditos', 'rosadito'),
    ('Desarmador', 'desarmadores'),
    ('Piña Colada sin alcohol', 'piñada'),
    ('Piña Colada sin alcohol', 'pina colada sin alcohol'),
    ('Piña Colada', 'pina colada'),
    ('Limonada Eléctrica', 'limonada electrica'),
    ('Absolute Gray House', 'absolute gray house'),
    ('Absolute Gray House', 'absolut gray house'),
    ('Havana''s Light', 'havanas light'),
    ('Havana''s Light', 'havana light'),
    ('Mai Tai', 'mai tai'),
    ('Tom Collins', 'tom collins'),
    ('Tinto de Verano', 'tinto de verano'),
    ('Tequila Mineral', 'tequila mineral'),
    ('Vodka Mineral', 'vodka mineral'),
    ('Ponche de Frutas', 'ponche de frutas')
) as v(product_name, alias)
join public.products p on p.name = v.product_name
on conflict do nothing;

create trigger product_categories_set_updated_at
before update on public.product_categories
for each row execute function private.set_updated_at();

create trigger inventory_categories_set_updated_at
before update on public.inventory_categories
for each row execute function private.set_updated_at();

create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row execute function private.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create trigger recipes_set_updated_at
before update on public.recipes
for each row execute function private.set_updated_at();

create trigger products_audit
after insert or update or delete on public.products
for each row execute function private.audit_trigger();

create trigger product_aliases_audit
after insert or update or delete on public.product_aliases
for each row execute function private.audit_trigger();

create trigger inventory_items_audit
after insert or update or delete on public.inventory_items
for each row execute function private.audit_trigger();

create trigger recipes_audit
after insert or update or delete on public.recipes
for each row execute function private.audit_trigger();

create trigger recipe_items_audit
after insert or update or delete on public.recipe_items
for each row execute function private.audit_trigger();
