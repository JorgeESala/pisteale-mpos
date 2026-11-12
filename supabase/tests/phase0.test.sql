begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(177);

delete from auth.users
where id in (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  '33333333-3333-3333-3333-333333333333'::uuid,
  '44444444-4444-4444-4444-444444444444'::uuid
);

delete from public.document_sequences;
delete from public.profiles;
delete from public.ice_daily_records;
delete from public.inventory_waste;
delete from public.inventory_movements;
delete from public.bottle_openings;
delete from public.purchase_items;
delete from public.purchases;

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'admin-test@pisteale.local',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Admin Test"}'::jsonb,
  now(),
  now()
);

select extensions.is(
  (
    select role
    from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'
  ),
  'admin'::public.user_role,
  'first user becomes admin'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'operator-test@pisteale.local',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Operator Test"}'::jsonb,
    now(),
    now()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'authenticated',
    'authenticated',
    'inactive-test@pisteale.local',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Inactive Test"}'::jsonb,
    now(),
    now()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'authenticated',
    'authenticated',
    'consulta-test@pisteale.local',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Consulta Test"}'::jsonb,
    now(),
    now()
  );

update public.profiles
set active = false
where id = '33333333-3333-3333-3333-333333333333';

select extensions.is(
  (select public.ping() ->> 'ok'),
  'true',
  'ping returns ok'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select extensions.is(
  (select public.ping() ->> 'ok'),
  'true',
  'anon can call ping'
);

select extensions.throws_ok(
  $sql$select count(*) from public.profiles$sql$,
  '42501',
  'permission denied for table profiles',
  'anon cannot read profiles'
);

select extensions.throws_ok(
  $sql$select count(*) from public.app_settings$sql$,
  '42501',
  'permission denied for table app_settings',
  'anon cannot read app_settings'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select extensions.is(
  (select count(*) from public.profiles),
  4::bigint,
  'admin sees all profiles'
);

select extensions.is(
  (select count(*) from public.app_settings),
  7::bigint,
  'admin sees all settings'
);

select extensions.ok(
  (select count(*) from public.audit_log) > 0,
  'admin sees audit log'
);

select extensions.is(
  (
    select (
      public.admin_set_profile(
        '22222222-2222-2222-2222-222222222222'::uuid,
        'operador'::public.user_role,
        true,
        true,
        false,
        false
      )
    ).can_view_financials
  ),
  true,
  'admin can update permissions'
);

select extensions.throws_ok(
  $sql$select public.admin_set_profile('11111111-1111-1111-1111-111111111111'::uuid, 'operador'::public.user_role, true, true, true, false)$sql$,
  'P0001',
  'No puedes quitarte el rol de administrador',
  'admin cannot remove own admin role'
);

select extensions.throws_ok(
  $sql$update public.app_settings set value = '"x"'::jsonb where key = 'business_name'$sql$,
  '42501',
  'permission denied for table app_settings',
  'authenticated cannot update settings directly'
);

select extensions.throws_ok(
  $sql$insert into public.audit_log (action, table_name) values ('test', 'test')$sql$,
  '42501',
  'permission denied for table audit_log',
  'authenticated cannot write audit log'
);

select extensions.throws_ok(
  $sql$select count(*) from public.document_sequences$sql$,
  '42501',
  'permission denied for table document_sequences',
  'authenticated cannot read document sequences'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.is(
  (select count(*) from public.profiles),
  1::bigint,
  'operator sees only own profile'
);

select extensions.is(
  (select count(*) from public.app_settings),
  7::bigint,
  'operator sees settings'
);

select extensions.is(
  (select count(*) from public.audit_log),
  0::bigint,
  'operator cannot see audit log'
);

select extensions.throws_ok(
  $sql$select public.admin_set_profile('22222222-2222-2222-2222-222222222222'::uuid, 'admin'::public.user_role, true, true, true, false)$sql$,
  '42501',
  'No autorizado',
  'operator cannot call admin_set_profile'
);

select extensions.throws_ok(
  $sql$insert into public.profiles (id, full_name) values (gen_random_uuid(), 'x')$sql$,
  '42501',
  'permission denied for table profiles',
  'authenticated cannot insert profiles directly'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-3333-3333-333333333333',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select extensions.is(
  (select count(*) from public.profiles),
  1::bigint,
  'inactive user sees own profile'
);

select extensions.is(
  (select count(*) from public.app_settings),
  0::bigint,
  'inactive user cannot see settings'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select extensions.throws_ok(
  $sql$select public.next_folio('order')$sql$,
  '42501',
  'permission denied for function next_folio',
  'authenticated cannot call next_folio directly'
);

reset role;

select extensions.matches(
  public.next_folio('order'),
  '^PED-[0-9]{4}-00001$',
  'first order folio'
);

select extensions.matches(
  public.next_folio('order'),
  '^PED-[0-9]{4}-00002$',
  'second order folio'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.is(
  (
    select (public.update_my_profile('  Operador Nuevo  ')).full_name
  ),
  'Operador Nuevo',
  'operator updates own name and trims spaces'
);

select extensions.throws_ok(
  $sql$select public.update_my_profile(' ')$sql$,
  '22023',
  'Nombre inválido',
  'empty name is rejected'
);

select extensions.throws_ok(
  $sql$select public.update_my_profile('A')$sql$,
  '22023',
  'Nombre inválido',
  'one character name is rejected'
);

select extensions.throws_ok(
  $sql$select public.update_my_profile(repeat('a', 81))$sql$,
  '22023',
  'Nombre inválido',
  'too long name is rejected'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-3333-3333-333333333333',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select extensions.throws_ok(
  $sql$select public.update_my_profile('Inactivo Nuevo')$sql$,
  '42501',
  'Perfil no encontrado o inactivo',
  'inactive user cannot update own name'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.throws_ok(
  $sql$select public.admin_update_profile_name('11111111-1111-1111-1111-111111111111'::uuid, 'Hack')$sql$,
  '42501',
  'No autorizado',
  'operator cannot update another profile name'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select extensions.is(
  (
    select (public.admin_update_profile_name(
      '22222222-2222-2222-2222-222222222222'::uuid,
      'Operador Admin'
    )).full_name
  ),
  'Operador Admin',
  'admin updates another profile name'
);

select extensions.throws_ok(
  $sql$select public.admin_update_profile_name('99999999-9999-9999-9999-999999999999'::uuid, 'Nadie')$sql$,
  'P0001',
  'Perfil no encontrado',
  'admin cannot update a missing profile'
);

reset role;

delete from public.recipe_items
where inventory_group_id = '44444444-4444-4444-4444-444444444444'::uuid;

delete from public.recipes
where product_id in (
  '77777777-7777-7777-7777-777777777777'::uuid,
  '88888888-8888-8888-8888-888888888888'::uuid
);

delete from public.products
where id in (
  '77777777-7777-7777-7777-777777777777'::uuid,
  '88888888-8888-8888-8888-888888888888'::uuid
);

delete from public.inventory_items
where id in (
  '55555555-5555-5555-5555-555555555555'::uuid,
  '66666666-6666-6666-6666-666666666666'::uuid
);

delete from public.inventory_item_groups
where id = '44444444-4444-4444-4444-444444444444'::uuid;

update public.inventory_items
set avg_cost = 0.001
where group_id = (
  select id from public.inventory_item_groups where name = 'Hielo'
);

update public.inventory_items
set avg_cost = 1.0
where group_id = (
  select id from public.inventory_item_groups where name = 'Vaso 940 ml'
);

update public.inventory_items
set avg_cost = 0.5
where group_id = (
  select id from public.inventory_item_groups where name = 'Tapa 940 ml'
);

update public.inventory_items
set avg_cost = 0.1
where group_id = (
  select id from public.inventory_item_groups where name = 'Popote'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select extensions.is(
  (
    select (public.upsert_inventory_group(
      '44444444-4444-4444-4444-444444444444'::uuid,
      'Test Ron',
      (select id from public.inventory_categories where name = 'Destilados'),
      'ml',
      true,
      true
    )).name
  ),
  'Test Ron',
  'admin creates inventory group'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.throws_ok(
  $sql$select public.upsert_inventory_group('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'Hack', null, 'ml', true, true)$sql$,
  '42501',
  'No autorizado',
  'operator cannot create inventory group'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select extensions.is(
  (
    select (public.upsert_inventory_item(
      '55555555-5555-5555-5555-555555555555'::uuid,
      '44444444-4444-4444-4444-444444444444'::uuid,
      'Test Ron Estándar',
      'estandar',
      'ingrediente',
      'botella',
      750,
      0.1,
      0,
      true,
      true
    )).tier
  ),
  'estandar',
  'admin creates standard item'
);

select extensions.is(
  (
    select (public.upsert_inventory_item(
      '66666666-6666-6666-6666-666666666666'::uuid,
      '44444444-4444-4444-4444-444444444444'::uuid,
      'Test Ron Premium',
      'premium',
      'ingrediente',
      'botella',
      750,
      0.2,
      0,
      true,
      true
    )).tier
  ),
  'premium',
  'admin creates premium item'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.throws_ok(
  $sql$select public.upsert_inventory_item('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, '44444444-4444-4444-4444-444444444444'::uuid, 'Hack', 'estandar', 'ingrediente', 'botella', 750, 0, 0, true, true)$sql$,
  '42501',
  'No autorizado',
  'operator cannot create inventory item'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select extensions.is(
  (
    select (public.upsert_product(
      '77777777-7777-7777-7777-777777777777'::uuid,
      'Test Cocktail Premium',
      '',
      (select id from public.product_categories where name = 'Ron'),
      'preparado',
      120,
      150,
      true,
      940,
      null,
      true,
      ''
    )).name
  ),
  'Test Cocktail Premium',
  'admin creates product'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.throws_ok(
  $sql$select public.upsert_product('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, 'Hack', '', null, 'preparado', 120, 150, true, 1000, null, true, '')$sql$,
  '42501',
  'No autorizado',
  'operator cannot create product'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select extensions.is(
  (
    select (public.upsert_recipe(
      '77777777-7777-7777-7777-777777777777'::uuid,
      1,
      'porcion',
      '',
      '[{"inventory_group_id":"44444444-4444-4444-4444-444444444444","tier_rule":"match","qty":1.5,"unit":"oz"}]'::jsonb
    )).product_id
  ),
  '77777777-7777-7777-7777-777777777777'::uuid,
  'admin saves recipe'
);

select extensions.throws_ok(
  $sql$select public.upsert_recipe('77777777-7777-7777-7777-777777777777'::uuid, 1, 'porcion', '', '[{"inventory_group_id":"44444444-4444-4444-4444-444444444444","tier_rule":"match","qty":0,"unit":"oz"}]'::jsonb)$sql$,
  '22023',
  'Insumo inválido en la receta',
  'recipe rejects zero quantity'
);

select extensions.throws_ok(
  $sql$select public.upsert_recipe('77777777-7777-7777-7777-777777777777'::uuid, 1, 'porcion', '', '[{"inventory_group_id":"44444444-4444-4444-4444-444444444444","tier_rule":"match","qty":1,"unit":"oz"},{"inventory_group_id":"44444444-4444-4444-4444-444444444444","tier_rule":"match","qty":2,"unit":"oz"}]'::jsonb)$sql$,
  '22023',
  'Grupo duplicado en la receta',
  'recipe rejects duplicate groups'
);

select extensions.throws_ok(
  $sql$select public.upsert_recipe(
    '77777777-7777-7777-7777-777777777777'::uuid,
    1,
    'porcion',
    '',
    jsonb_build_array(
      jsonb_build_object(
        'inventory_group_id',
        (select id from public.inventory_item_groups where name = 'Hielo'),
        'tier_rule', 'any',
        'qty', 100,
        'unit', 'g'
      )
    )
  )$sql$,
  '22023',
  'Este insumo se agrega automáticamente',
  'recipe rejects automatic consumables'
);

select extensions.is(
  (select consumables_cost from public.v_product_costs where product_id = '77777777-7777-7777-7777-777777777777'),
  null::numeric,
  'consumables cost waits for daily ice records'
);

select public.upsert_ice_daily_record(null, current_date - 1, 1, 10, 20, '');
select public.upsert_ice_daily_record(null, current_date - 2, 1, 15, 30, '');

select extensions.is(
  (select cost_per_drink from public.v_ice_daily_records where record_date = current_date - 1),
  0.50::numeric,
  'daily ice cost per drink is calculated'
);

select extensions.is(
  (select cost_per_drink from public.v_ice_cost_7d),
  0.50::numeric,
  '7-day ice average is weighted'
);

select extensions.is(
  (select normal_cost from public.v_product_costs where product_id = '77777777-7777-7777-7777-777777777777'),
  6.60::numeric,
  'normal product cost is calculated'
);

select extensions.is(
  (select premium_cost from public.v_product_costs where product_id = '77777777-7777-7777-7777-777777777777'),
  11.10::numeric,
  'premium product cost is calculated'
);

select extensions.is(
  (select consumables_cost from public.v_product_costs where product_id = '77777777-7777-7777-7777-777777777777'),
  2.10::numeric,
  'consumables cost is included'
);

select extensions.is(
  (select normal_margin from public.v_product_costs where product_id = '77777777-7777-7777-7777-777777777777'),
  113.40::numeric,
  'normal product margin is calculated'
);

select extensions.is(
  (select premium_margin from public.v_product_costs where product_id = '77777777-7777-7777-7777-777777777777'),
  138.90::numeric,
  'premium product margin is calculated'
);

select extensions.ok(
  (
    select public.create_purchase(
      current_date,
      'Proveedor Test',
      'F-001',
      '',
      '[{"item_id":"55555555-5555-5555-5555-555555555555","qty_purchase":1,"total_cost":100}]'::jsonb
    ) is not null
  ),
  'admin creates purchase'
);

select extensions.ok(
  (select folio from public.purchases order by created_at limit 1) like 'CMP-%',
  'purchase folio is generated'
);

select extensions.is(
  (select total_cost from public.purchases order by created_at limit 1),
  100.00::numeric,
  'purchase total is calculated'
);

select extensions.is(
  (
    select qty_base
    from public.inventory_movements
    where purchase_id = (select id from public.purchases order by created_at limit 1)
      and item_id = '55555555-5555-5555-5555-555555555555'::uuid
  ),
  750::numeric,
  'purchase creates inventory movement'
);

select extensions.is(
  (select avg_cost from public.inventory_items where id = '55555555-5555-5555-5555-555555555555'),
  0.133333::numeric,
  'purchase updates item average cost'
);

select public.create_purchase(
  current_date,
  'Proveedor Test',
  'F-002',
  '',
  '[{"item_id":"55555555-5555-5555-5555-555555555555","qty_purchase":1,"total_cost":200}]'::jsonb
);

select extensions.is(
  (select avg_cost from public.inventory_items where id = '55555555-5555-5555-5555-555555555555'),
  0.2::numeric,
  'second purchase updates weighted average'
);

select extensions.is(
  (
    select current_qty_base
    from public.v_inventory_stock
    where item_id = '55555555-5555-5555-5555-555555555555'
  ),
  1500::numeric,
  'stock view sums purchases'
);

select extensions.is(
  public.adjust_inventory_item(
    '55555555-5555-5555-5555-555555555555'::uuid,
    1400,
    'Conteo físico'
  ),
  (-100)::numeric,
  'admin adjusts inventory count'
);

select extensions.is(
  (
    select current_qty_base
    from public.v_inventory_stock
    where item_id = '55555555-5555-5555-5555-555555555555'
  ),
  1400::numeric,
  'adjustment updates stock view'
);

select extensions.ok(
  (
    select public.create_inventory_waste(
      '55555555-5555-5555-5555-555555555555'::uuid,
      current_date,
      100,
      'fondo_botella',
      'Prueba de merma'
    ) is not null
  ),
  'admin creates waste'
);

select extensions.is(
  (select total_cost from public.inventory_waste order by created_at limit 1),
  20.00::numeric,
  'waste cost is calculated'
);

select extensions.is(
  (
    select current_qty_base
    from public.v_inventory_stock
    where item_id = '55555555-5555-5555-5555-555555555555'
  ),
  1300::numeric,
  'waste reduces stock'
);

select extensions.throws_ok(
  $sql$select public.create_inventory_waste(
    '55555555-5555-5555-5555-555555555555'::uuid,
    current_date,
    2000,
    'derrame',
    ''
  )$sql$,
  '22023',
  'Stock insuficiente para el insumo Test Ron',
  'waste cannot exceed stock'
);

select extensions.ok(
  (
    select public.open_bottle(
      '55555555-5555-5555-5555-555555555555'::uuid,
      current_date,
      750,
      'Apertura de prueba'
    ) is not null
  ),
  'admin opens bottle'
);

select extensions.is(
  (
    select current_qty_base
    from public.v_inventory_stock
    where item_id = '55555555-5555-5555-5555-555555555555'
  ),
  1300::numeric,
  'opening bottle keeps stock'
);

select extensions.throws_ok(
  $sql$select public.open_bottle(
    '55555555-5555-5555-5555-555555555555'::uuid,
    current_date,
    750,
    ''
  )$sql$,
  '22023',
  'No hay suficiente stock sellado para abrir la botella',
  'cannot open more than sealed stock'
);

select extensions.throws_ok(
  $sql$select public.consume_open_bottle(
    (
      select id
      from public.bottle_openings
      where item_id = '55555555-5555-5555-5555-555555555555'
        and status = 'open'
      order by created_at desc
      limit 1
    ),
    1000,
    ''
  )$sql$,
  '22023',
  'La cantidad supera el contenido de la botella',
  'cannot consume more than bottle content'
);

select extensions.is(
  (
    select public.consume_open_bottle(
      (
        select id
        from public.bottle_openings
        where item_id = '55555555-5555-5555-5555-555555555555'
          and status = 'open'
        order by created_at desc
        limit 1
      ),
      100,
      'Consumo de prueba'
    )
  ),
  650::numeric,
  'consume updates bottle remaining'
);

select extensions.is(
  (
    select current_qty_base
    from public.v_inventory_stock
    where item_id = '55555555-5555-5555-5555-555555555555'
  ),
  1200::numeric,
  'consume reduces stock'
);

select public.close_open_bottle(
  (
    select id
    from public.bottle_openings
    where item_id = '55555555-5555-5555-5555-555555555555'
      and status = 'open'
    order by created_at desc
    limit 1
  ),
  50,
  'Cierre de prueba'
);

select extensions.is(
  (
    select current_qty_base
    from public.v_inventory_stock
    where item_id = '55555555-5555-5555-5555-555555555555'
  ),
  550::numeric,
  'closing bottle reduces stock'
);

select extensions.is(
  (
    select status
    from public.bottle_openings
    where item_id = '55555555-5555-5555-5555-555555555555'
    order by created_at desc
    limit 1
  ),
  'finished',
  'bottle is closed'
);

select extensions.is(
  (
    select w.total_cost
    from public.inventory_waste w
    join public.inventory_movements m on m.id = w.movement_id
    where m.bottle_opening_id is not null
    order by w.created_at desc
    limit 1
  ),
  10.00::numeric,
  'bottle bottom waste is recorded'
);

select extensions.throws_ok(
  $sql$select public.create_purchase(
    current_date,
    '',
    '',
    '',
    jsonb_build_array(
      jsonb_build_object(
        'item_id',
        (
          select i.id
          from public.inventory_items i
          join public.inventory_item_groups g on g.id = i.group_id
          where g.name = 'Hielo'
          limit 1
        ),
        'qty_purchase', 1,
        'total_cost', 10
      )
    )
  )$sql$,
  '22023',
  'El insumo Hielo no lleva inventario',
  'purchase rejects non-stock item'
);

select extensions.throws_ok(
  $sql$select public.create_purchase(
    current_date,
    '',
    '',
    '',
    '[{"item_id":"55555555-5555-5555-5555-555555555555","qty_purchase":1,"total_cost":10},{"item_id":"55555555-5555-5555-5555-555555555555","qty_purchase":1,"total_cost":10}]'::jsonb
  )$sql$,
  '22023',
  'Insumo duplicado en la compra',
  'purchase rejects duplicate items'
);

select public.upsert_product(
  '88888888-8888-8888-8888-888888888888'::uuid,
  'Test Sin Receta',
  '',
  null,
  'preparado',
  120,
  150,
  true,
  1000,
  null,
  true,
  ''
);

select extensions.is(
  (select has_recipe from public.v_product_costs where product_id = '88888888-8888-8888-8888-888888888888'),
  false,
  'product without recipe is pending'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.ok(
  (select count(*) from public.products) > 0,
  'operator can read catalog'
);

select extensions.ok(
  (
    select public.upsert_ice_daily_record(null, current_date - 3, 1, 5, 10, 'Operador')
      is not null
  ),
  'operator can record daily ice'
);

select extensions.throws_ok(
  $sql$select public.delete_ice_daily_record((select id from public.ice_daily_records where record_date = current_date - 3))$sql$,
  '42501',
  'No autorizado',
  'operator cannot delete daily ice'
);

select extensions.throws_ok(
  $sql$select public.create_purchase(
    current_date,
    '',
    '',
    '',
    '[{"item_id":"55555555-5555-5555-5555-555555555555","qty_purchase":1,"total_cost":10}]'::jsonb
  )$sql$,
  '42501',
  'No autorizado',
  'operator cannot create purchase'
);

select extensions.throws_ok(
  $sql$select public.adjust_inventory_item(
    '55555555-5555-5555-5555-555555555555'::uuid,
    1500,
    ''
  )$sql$,
  '42501',
  'No autorizado',
  'operator cannot adjust inventory'
);

select extensions.throws_ok(
  $sql$select public.create_inventory_waste(
    '55555555-5555-5555-5555-555555555555'::uuid,
    current_date,
    10,
    'derrame',
    ''
  )$sql$,
  '42501',
  'No autorizado',
  'operator cannot create waste'
);

select extensions.throws_ok(
  $sql$select public.open_bottle(
    '55555555-5555-5555-5555-555555555555'::uuid,
    current_date,
    750,
    ''
  )$sql$,
  '42501',
  'No autorizado',
  'operator cannot open bottle'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select public.delete_ice_daily_record(
  (select id from public.ice_daily_records where record_date = current_date - 3)
);

select extensions.is(
  (
    select count(*)
    from public.ice_daily_records
    where record_date = current_date - 3
  ),
  0::bigint,
  'admin deletes daily ice'
);

select extensions.is(
  (
    select (
      public.admin_set_profile(
        '22222222-2222-2222-2222-222222222222'::uuid,
        'operador'::public.user_role,
        true,
        true,
        false,
        true
      )
    ).can_manage_catalog
  ),
  true,
  'admin grants catalog permission'
);

select extensions.is(
  (
    select email
    from public.admin_list_users()
    where id = '22222222-2222-2222-2222-222222222222'::uuid
  ),
  'operator-test@pisteale.local',
  'admin lists users with email'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.is(
  (
    select (
      public.upsert_inventory_group(
        null,
        'Test Barman',
        (select id from public.inventory_categories where name = 'Destilados'),
        'ml',
        false,
        true
      )
    ).name
  ),
  'Test Barman',
  'operator with catalog permission creates group'
);

select extensions.is(
  (
    select (
      public.upsert_inventory_item(
        null,
        (select id from public.inventory_item_groups where name = 'Test Barman'),
        'Test Barman Ron',
        null,
        'ingrediente',
        'botella',
        750,
        0.5,
        0,
        true,
        true
      )
    ).name
  ),
  'Test Barman Ron',
  'operator with catalog permission creates item'
);

select extensions.is(
  (
    select (
      public.upsert_product(
        null,
        'Test Barman Drink',
        '',
        null,
        'preparado',
        100,
        null,
        false,
        940,
        null,
        true,
        ''
      )
    ).name
  ),
  'Test Barman Drink',
  'operator with catalog permission creates product'
);

select extensions.is(
  (
    select (
      public.upsert_recipe(
        (select id from public.products where name = 'Test Barman Drink'),
        1,
        'porcion',
        '',
        jsonb_build_array(
          jsonb_build_object(
            'inventory_group_id',
            (select id from public.inventory_item_groups where name = 'Test Barman'),
            'tier_rule', 'any',
            'qty', 30,
            'unit', 'ml'
          )
        )
      )
    ).product_id
  ),
  (select id from public.products where name = 'Test Barman Drink'),
  'operator with catalog permission saves recipe'
);

select extensions.throws_ok(
  $sql$select public.save_recipe_default_consumables('[]'::jsonb, 0.9)$sql$,
  '42501',
  'No autorizado',
  'operator with catalog permission cannot manage automatic consumables'
);

select extensions.throws_ok(
  $sql$select * from public.admin_list_users()$sql$,
  '42501',
  'No autorizado',
  'operator cannot list users'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select extensions.is(
  (
    select (
      public.admin_set_profile(
        '22222222-2222-2222-2222-222222222222'::uuid,
        'operador'::public.user_role,
        true,
        true,
        false,
        false
      )
    ).can_manage_catalog
  ),
  false,
  'admin revokes catalog permission'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.throws_ok(
  $sql$select public.upsert_inventory_group(
    null,
    'Test Barman Denied',
    (select id from public.inventory_categories where name = 'Destilados'),
    'ml',
    false,
    true
  )$sql$,
  '42501',
  'No autorizado',
  'operator without catalog permission cannot create group'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select public.create_purchase(
  current_date,
  'Proveedor ventas',
  'V-001',
  '',
  jsonb_build_array(
    jsonb_build_object(
      'item_id', (select id from public.inventory_items where name = 'Test Barman Ron'),
      'qty_purchase', 1,
      'total_cost', 375
    ),
    jsonb_build_object(
      'item_id', (select id from public.inventory_items where name = 'Vaso 940 ml'),
      'qty_purchase', 1,
      'total_cost', 25
    ),
    jsonb_build_object(
      'item_id', (select id from public.inventory_items where name = 'Tapa 940 ml'),
      'qty_purchase', 1,
      'total_cost', 12.5
    ),
    jsonb_build_object(
      'item_id', (select id from public.inventory_items where name = 'Popote'),
      'qty_purchase', 1,
      'total_cost', 10
    )
  )
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.is(
  jsonb_array_length(
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Barman Drink'),
          'tier', 'normal',
          'qty', 2
        )
      )
    ))->'warnings'
  ),
  0,
  'sale preview has no warnings'
);

select extensions.ok(
  (
    public.create_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Barman Drink'),
          'tier', 'normal',
          'qty', 2
        )
      ),
      'cash',
      'T-001',
      10,
      'Venta de prueba'
    )
  ) is not null,
  'operator creates sale'
);

select extensions.is(
  (select total from public.v_orders order by folio desc limit 1),
  210.00::numeric,
  'sale total includes tip'
);

select extensions.is(
  (select cost_total from public.v_orders order by folio desc limit 1),
  34.20::numeric,
  'sale cost is calculated'
);

select extensions.is(
  (select amount from public.v_payments order by created_at desc limit 1),
  210.00::numeric,
  'payment amount is recorded'
);

select extensions.is(
  (
    select current_qty_base
    from public.v_inventory_stock
    where name = 'Test Barman Ron'
  ),
  690::numeric,
  'sale deducts recipe ingredient'
);

select extensions.is(
  (
    select current_qty_base
    from public.v_inventory_stock
    where name = 'Vaso 940 ml'
  ),
  23::numeric,
  'sale deducts cup'
);

select extensions.is(
  (select warning_count from public.v_orders order by folio desc limit 1),
  0,
  'sale without inventory warnings'
);

select extensions.ok(
  jsonb_array_length(
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'premium',
          'qty', 1
        )
      )
    ))->'warnings'
  ) > 0,
  'premium sale preview warns about stock'
);

select extensions.ok(
  (
    public.create_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'premium',
          'qty', 1
        )
      ),
      'cash',
      '',
      0,
      'Venta premium sin stock'
    )
  ) is not null,
  'premium sale is allowed with warning'
);

select extensions.is(
  (
    select current_qty_base
    from public.v_inventory_stock
    where name = 'Test Ron Premium'
  ),
  (-45)::numeric,
  'premium sale leaves negative stock'
);

select extensions.ok(
  (select warning_count from public.v_orders order by folio desc limit 1) > 0,
  'sale stores inventory warnings'
);

select extensions.is(
  (
    select stock_status
    from public.v_inventory_stock
    where name = 'Test Ron Premium'
  ),
  'negative',
  'stock shows negative status'
);

select extensions.ok(
  exists (
    select 1
    from jsonb_array_elements(
      (public.preview_sale(
        jsonb_build_array(
          jsonb_build_object(
            'product_id', (select id from public.products where name = 'Test Sin Receta'),
            'tier', 'normal',
            'qty', 1
          )
        )
      ))->'warnings'
    ) as e
    where e->>'type' = 'no_recipe'
  ),
  'sale preview warns about missing recipe'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select public.open_bottle(
  (select id from public.inventory_items where name = 'Test Ron Estándar'),
  current_date,
  500,
  'Botella para venta'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select public.create_sale(
  jsonb_build_array(
    jsonb_build_object(
      'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
      'tier', 'normal',
      'qty', 1
    )
  ),
  'cash',
  '',
  0,
  'Venta con botella abierta'
);

select extensions.is(
  (
    select remaining_ml
    from public.bottle_openings
    where item_id = (select id from public.inventory_items where name = 'Test Ron Estándar')
      and status = 'open'
    order by created_at desc
    limit 1
  ),
  455::numeric,
  'sale consumes from open bottle'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select public.upsert_promotion(
  null,
  'Manual 2 x $150',
  2,
  150,
  'non_alcoholic',
  'normal',
  '{}'::uuid[],
  '{}'::uuid[],
  false,
  true,
  20
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.ok(
  exists (
    select 1
    from public.promotions
    where name = '2 x $180'
      and active
      and automatic
  ),
  'automatic 2 x 180 promotion is configured'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal',
          'qty', 2
        )
      ),
      '{}'::uuid[]
    ))->>'gross_total'
  )::numeric,
  240::numeric,
  'automatic promotion gross total is calculated'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal',
          'qty', 2
        )
      ),
      '{}'::uuid[]
    ))->>'discount_total'
  )::numeric,
  60::numeric,
  'automatic 2 x 180 discount is applied'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal',
          'qty', 2
        )
      ),
      '{}'::uuid[]
    ))->>'subtotal'
  )::numeric,
  180::numeric,
  'automatic promotion net subtotal is calculated'
);

select extensions.is(
  jsonb_array_length(
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal',
          'qty', 2
        )
      ),
      '{}'::uuid[]
    ))->'promotions'
  ),
  1,
  'automatic promotion application is returned'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Calimoncho'),
          'tier', 'normal',
          'qty', 2
        )
      ),
      '{}'::uuid[]
    ))->>'discount_total'
  )::numeric,
  0::numeric,
  'automatic promotion excludes wine'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'premium',
          'qty', 2
        )
      ),
      '{}'::uuid[]
    ))->>'discount_total'
  )::numeric,
  0::numeric,
  'automatic promotion excludes premium tier'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Barman Drink'),
          'tier', 'normal',
          'qty', 2
        )
      ),
      '{}'::uuid[]
    ))->>'discount_total'
  )::numeric,
  0::numeric,
  'manual promotion is not applied automatically'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Barman Drink'),
          'tier', 'normal',
          'qty', 2
        )
      ),
      array[(select id from public.promotions where name = 'Manual 2 x $150')]
    ))->>'discount_total'
  )::numeric,
  50::numeric,
  'manual promotion discount is applied when selected'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Barman Drink'),
          'tier', 'normal',
          'qty', 2
        )
      ),
      array[(select id from public.promotions where name = 'Manual 2 x $150')]
    ))->>'subtotal'
  )::numeric,
  150::numeric,
  'manual promotion net subtotal is calculated'
);

select public.create_sale(
  jsonb_build_array(
    jsonb_build_object(
      'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
      'tier', 'normal',
      'qty', 2
    )
  ),
  '{}'::uuid[],
  'cash',
  '',
  0,
  'Venta con promoción automática'
);

select extensions.is(
  (select total from public.v_orders order by folio desc limit 1),
  180::numeric,
  'sale total uses automatic promotion'
);

select extensions.is(
  (select discount_total from public.v_orders order by folio desc limit 1),
  60::numeric,
  'sale stores automatic promotion discount'
);

select extensions.is(
  (select promotion_count from public.v_orders order by folio desc limit 1),
  1,
  'sale stores promotion application'
);

select extensions.is(
  (
    select amount
    from public.v_payments
    where order_id = (select id from public.v_orders order by folio desc limit 1)
  ),
  180::numeric,
  'payment uses promoted total'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal',
          'qty', 1
        )
      ),
      '{}'::uuid[],
      jsonb_build_object(
        'promotion_id', (select id from public.promotions where name = 'Precio socio'),
        'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
        'tier', 'normal'
      )
    ))->>'gross_total'
  )::numeric,
  120::numeric,
  'member price gross total is calculated'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal',
          'qty', 1
        )
      ),
      '{}'::uuid[],
      jsonb_build_object(
        'promotion_id', (select id from public.promotions where name = 'Precio socio'),
        'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
        'tier', 'normal'
      )
    ))->>'discount_total'
  )::numeric,
  30::numeric,
  'member price applies 30 discount'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal',
          'qty', 1
        )
      ),
      '{}'::uuid[],
      jsonb_build_object(
        'promotion_id', (select id from public.promotions where name = 'Precio socio'),
        'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
        'tier', 'normal'
      )
    ))->>'subtotal'
  )::numeric,
  90::numeric,
  'member price net subtotal is calculated'
);

select extensions.is(
  (
    select (e->>'line_targeted')::boolean
    from jsonb_array_elements(
      (public.preview_sale(
        jsonb_build_array(
          jsonb_build_object(
            'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
            'tier', 'normal',
            'qty', 1
          )
        ),
        '{}'::uuid[],
        jsonb_build_object(
          'promotion_id', (select id from public.promotions where name = 'Precio socio'),
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal'
        )
      ))->'promotions'
    ) as e
  ),
  true,
  'member price is recorded as a line promotion'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal',
          'qty', 3
        )
      ),
      '{}'::uuid[],
      jsonb_build_object(
        'promotion_id', (select id from public.promotions where name = 'Precio socio'),
        'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
        'tier', 'normal'
      )
    ))->>'discount_total'
  )::numeric,
  90::numeric,
  'member drink is excluded from automatic pairing'
);

select extensions.is(
  (
    (public.preview_sale(
      jsonb_build_array(
        jsonb_build_object(
          'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
          'tier', 'normal',
          'qty', 3
        )
      ),
      '{}'::uuid[],
      jsonb_build_object(
        'promotion_id', (select id from public.promotions where name = 'Precio socio'),
        'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
        'tier', 'normal'
      )
    ))->>'subtotal'
  )::numeric,
  270::numeric,
  'member price allows automatic promo on other drinks'
);

select extensions.throws_ok(
  $sql$select public.preview_sale(
    jsonb_build_array(
      jsonb_build_object(
        'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
        'tier', 'premium',
        'qty', 1
      )
    ),
    '{}'::uuid[],
    jsonb_build_object(
      'promotion_id', (select id from public.promotions where name = 'Precio socio'),
      'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
      'tier', 'premium'
    )
  )$sql$,
  '22023',
  'La bebida seleccionada no es elegible para esta promoción',
  'member price rejects premium drink'
);

select public.create_sale(
  jsonb_build_array(
    jsonb_build_object(
      'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
      'tier', 'normal',
      'qty', 1
    )
  ),
  '{}'::uuid[],
  jsonb_build_object(
    'promotion_id', (select id from public.promotions where name = 'Precio socio'),
    'product_id', (select id from public.products where name = 'Test Cocktail Premium'),
    'tier', 'normal'
  ),
  'cash',
  '',
  0,
  'Venta precio socio'
);

select extensions.is(
  (select total from public.v_orders order by folio desc limit 1),
  90::numeric,
  'member sale total is 90'
);

select extensions.is(
  (select discount_total from public.v_orders order by folio desc limit 1),
  30::numeric,
  'member sale stores discount'
);

select extensions.is(
  (select promotion_count from public.v_orders order by folio desc limit 1),
  1,
  'member sale stores promotion'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select extensions.ok(
  public.create_event(
    'Test Evento Parque',
    'Parque central',
    current_date,
    '17:00'::time,
    '22:00'::time,
    true,
    2,
    180,
    500,
    ''
  ) is not null,
  'admin creates event'
);

select extensions.ok(
  (
    select folio like 'EVT-%'
    from public.v_events
    where name = 'Test Evento Parque'
  ),
  'event folio uses EVT prefix'
);

select extensions.is(
  (select profit from public.v_events where name = 'Test Evento Parque'),
  0::numeric,
  'new event has zero profit'
);

select public.create_event_sale(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  (select id from public.events where name = 'Test Evento Parque'),
  jsonb_build_array(
    jsonb_build_object(
      'product_id', null,
      'product_name', 'Mojito',
      'quantity', 3,
      'unit_price', 100,
      'promotion_eligible', true
    )
  ),
  true,
  2,
  180,
  'cash',
  '',
  '2026-11-14T20:00:00-05:00'::timestamptz
);

select extensions.is(
  (
    select total
    from public.event_sales
    where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  ),
  280::numeric,
  'event sale applies the bundle promotion'
);

select extensions.is(
  (
    select discount_total
    from public.event_sales
    where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  ),
  20::numeric,
  'event sale stores the promotion discount'
);

select extensions.is(
  (select sales_total from public.v_events where name = 'Test Evento Parque'),
  280::numeric,
  'event view totals sales'
);

select extensions.is(
  (select drinks_count from public.v_events where name = 'Test Evento Parque'),
  3,
  'event view counts drinks'
);

select extensions.is(
  (
    select count(*)::integer
    from public.event_sale_items
    where event_sale_id = (
      select id
      from public.event_sales
      where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
    )
  ),
  1,
  'event sale stores its items'
);

select extensions.is(
  (
    select jsonb_build_object(
      'applied', promotion_applied,
      'qty', bundle_qty,
      'price', bundle_price
    )
    from public.event_sales
    where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  ),
  '{"applied":true,"qty":2,"price":180}'::jsonb,
  'event sale stores the promotion snapshot'
);

select public.create_event_sale(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  (select id from public.events where name = 'Test Evento Parque'),
  jsonb_build_array(
    jsonb_build_object(
      'product_id', null,
      'product_name', 'Mojito',
      'quantity', 3,
      'unit_price', 100,
      'promotion_eligible', true
    )
  ),
  true,
  2,
  180,
  'cash',
  '',
  '2026-11-14T20:00:00-05:00'::timestamptz
);

select extensions.is(
  (
    select count(*)::integer
    from public.event_sales
    where event_id = (select id from public.events where name = 'Test Evento Parque')
  ),
  1,
  'duplicate client id does not create another sale'
);

select public.create_event_sale(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  (select id from public.events where name = 'Test Evento Parque'),
  jsonb_build_array(
    jsonb_build_object(
      'product_id', null,
      'product_name', 'Paloma',
      'quantity', 2,
      'unit_price', 100,
      'promotion_eligible', true
    )
  ),
  false,
  2,
  180,
  'transfer',
  '',
  '2026-11-14T21:00:00-05:00'::timestamptz
);

select extensions.is(
  (
    select total
    from public.event_sales
    where client_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
  ),
  200::numeric,
  'event sale can skip the promotion'
);

select extensions.throws_ok(
  $sql$
    select public.create_event_sale(
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
      (select id from public.events where name = 'Test Evento Parque'),
      jsonb_build_array(
        jsonb_build_object(
          'product_id', null,
          'product_name', 'Mojito',
          'quantity', 101,
          'unit_price', 100,
          'promotion_eligible', true
        )
      ),
      true,
      2,
      180,
      'cash',
      '',
      now()
    )
  $sql$,
  '22023',
  'Cantidad o precio de bebida inválido',
  'event sale rejects quantities above the line limit'
);

select extensions.throws_ok(
  $sql$
    select public.create_event_sale(
      'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
      (select id from public.events where name = 'Test Evento Parque'),
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id', null,
            'product_name', 'Mojito',
            'quantity', 100,
            'unit_price', 100,
            'promotion_eligible', true
          )
        )
        from generate_series(1, 6)
      ),
      true,
      2,
      180,
      'cash',
      '',
      now()
    )
  $sql$,
  '22023',
  'La venta supera el máximo de 500 bebidas',
  'event sale rejects more than 500 total units'
);

select public.create_event_expense(
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  (select id from public.events where name = 'Test Evento Parque'),
  'supplies',
  'Hielo',
  50,
  'cash',
  '',
  now(),
  ''
);

select extensions.is(
  (
    select amount
    from public.event_expenses
    where client_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
  ),
  50::numeric,
  'event expense is stored'
);

select public.create_event_expense(
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  (select id from public.events where name = 'Test Evento Parque'),
  'supplies',
  'Hielo',
  50,
  'cash',
  '',
  now(),
  ''
);

select extensions.is(
  (
    select count(*)::integer
    from public.event_expenses
    where event_id = (select id from public.events where name = 'Test Evento Parque')
  ),
  1,
  'duplicate expense client id is idempotent'
);

select extensions.is(
  (select expenses_total from public.v_events where name = 'Test Evento Parque'),
  50::numeric,
  'event view totals expenses'
);

select extensions.is(
  (select profit from public.v_events where name = 'Test Evento Parque'),
  430::numeric,
  'event view calculates profit'
);

select extensions.is(
  (select margin_percent from public.v_events where name = 'Test Evento Parque'),
  89.6::numeric,
  'event view calculates margin'
);

select public.set_event_status(
  (select id from public.events where name = 'Test Evento Parque'),
  'closed'
);

select extensions.is(
  (select status from public.v_events where name = 'Test Evento Parque'),
  'closed',
  'event can be closed'
);

select extensions.throws_ok(
  $sql$
    select public.create_event_sale(
      'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
      (select id from public.events where name = 'Test Evento Parque'),
      jsonb_build_array(
        jsonb_build_object(
          'product_id', null,
          'product_name', 'Mojito',
          'quantity', 1,
          'unit_price', 100,
          'promotion_eligible', true
        )
      ),
      true,
      2,
      180,
      'cash',
      '',
      now()
    )
  $sql$,
  '22023',
  'El evento está cerrado',
  'closed event rejects new sales'
);

select public.set_event_status(
  (select id from public.events where name = 'Test Evento Parque'),
  'open'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-2222-2222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select extensions.throws_ok(
  $sql$
    select public.delete_event_sale((
      select id
      from public.event_sales
      where client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
    ))
  $sql$,
  '42501',
  'No autorizado',
  'operator cannot delete event sales'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select public.delete_event_sale((
  select id
  from public.event_sales
  where client_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
));

select extensions.is(
  (
    select count(*)::integer
    from public.event_sales
    where event_id = (select id from public.events where name = 'Test Evento Parque')
  ),
  1,
  'admin deletes an event sale'
);

select extensions.is(
  (select sales_total from public.v_events where name = 'Test Evento Parque'),
  280::numeric,
  'deleted event sale no longer counts'
);

select public.delete_event_expense((
  select id
  from public.event_expenses
  where client_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
));

select extensions.is(
  (
    select count(*)::integer
    from public.event_expenses
    where event_id = (select id from public.events where name = 'Test Evento Parque')
  ),
  0,
  'admin deletes an event expense'
);

select extensions.is(
  (select profit from public.v_events where name = 'Test Evento Parque'),
  280::numeric,
  'profit is recalculated after deleting the expense'
);

select public.update_event(
  (select id from public.events where name = 'Test Evento Parque'),
  'Test Evento Parque',
  'Parque central',
  current_date,
  '17:00'::time,
  '22:00'::time,
  true,
  2,
  200,
  500,
  ''
);

select public.create_event_sale(
  '99999999-9999-4999-8999-999999999999'::uuid,
  (select id from public.events where name = 'Test Evento Parque'),
  jsonb_build_array(
    jsonb_build_object(
      'product_id', null,
      'product_name', 'Mojito',
      'quantity', 2,
      'unit_price', 100,
      'promotion_eligible', true
    )
  ),
  true,
  2,
  180,
  'cash',
  '',
  now()
);

select extensions.is(
  (
    select total
    from public.event_sales
    where client_id = '99999999-9999-4999-8999-999999999999'::uuid
  ),
  180::numeric,
  'event sale keeps its own promotion snapshot'
);

select extensions.is(
  (
    select bundle_price
    from public.event_sales
    where client_id = '99999999-9999-4999-8999-999999999999'::uuid
  ),
  180::numeric,
  'event sale stores the snapshot bundle price'
);

select extensions.ok(
  public.create_event(
    'Test Evento Nocturno',
    'Parque central',
    current_date,
    '17:00'::time,
    '04:00'::time,
    true,
    2,
    180,
    0,
    ''
  ) is not null,
  'event can cross midnight'
);

select extensions.is(
  (select end_time from public.events where name = 'Test Evento Nocturno'),
  '04:00'::time,
  'overnight event stores its end time'
);

select extensions.ok(
  public.update_event(
    (select id from public.events where name = 'Test Evento Nocturno'),
    'Test Evento Nocturno',
    'Parque central',
    current_date,
    '18:00'::time,
    '03:00'::time,
    true,
    2,
    180,
    0,
    ''
  ) is not null,
  'event can be updated across midnight'
);

select extensions.is(
  (select end_time from public.events where name = 'Test Evento Nocturno'),
  '03:00'::time,
  'overnight event update stores its end time'
);

select public.admin_set_profile(
  '44444444-4444-4444-4444-444444444444'::uuid,
  'consulta'::public.user_role,
  true,
  false,
  false,
  false
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-4444-444444444444',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);

select extensions.ok(
  (select count(*) from public.v_events) >= 1,
  'consulta can read events'
);

select extensions.throws_ok(
  $sql$select public.create_event('Evento consulta', '', current_date, null, null, true, 2, 180, 0, '')$sql$,
  '42501',
  'No autorizado',
  'consulta cannot create events'
);

select extensions.throws_ok(
  $sql$
    select public.create_event_sale(
      '88888888-8888-4888-8888-888888888888'::uuid,
      (select id from public.events where name = 'Test Evento Parque'),
      jsonb_build_array(
        jsonb_build_object(
          'product_id', null,
          'product_name', 'Mojito',
          'quantity', 1,
          'unit_price', 100,
          'promotion_eligible', true
        )
      ),
      true,
      2,
      180,
      'cash',
      '',
      now()
    )
  $sql$,
  '42501',
  'No autorizado',
  'consulta cannot create event sales'
);

reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select extensions.throws_ok(
  $sql$select count(*) from public.events$sql$,
  '42501',
  'permission denied for table events',
  'anon cannot read events'
);

select extensions.throws_ok(
  $sql$select count(*) from public.v_events$sql$,
  '42501',
  'permission denied for view v_events',
  'anon cannot read event view'
);

select extensions.throws_ok(
  $sql$select count(*) from public.v_event_sales$sql$,
  '42501',
  'permission denied for view v_event_sales',
  'anon cannot read event sales view'
);

select extensions.throws_ok(
  $sql$select count(*) from public.products$sql$,
  '42501',
  'permission denied for table products',
  'anon cannot read catalog'
);

select extensions.throws_ok(
  $sql$select count(*) from public.ice_daily_records$sql$,
  '42501',
  'permission denied for table ice_daily_records',
  'anon cannot read daily ice records'
);

select extensions.throws_ok(
  $sql$select count(*) from public.purchases$sql$,
  '42501',
  'permission denied for table purchases',
  'anon cannot read purchases'
);

select extensions.throws_ok(
  $sql$select count(*) from public.inventory_movements$sql$,
  '42501',
  'permission denied for table inventory_movements',
  'anon cannot read inventory movements'
);

select extensions.throws_ok(
  $sql$select count(*) from public.inventory_waste$sql$,
  '42501',
  'permission denied for table inventory_waste',
  'anon cannot read inventory waste'
);

select extensions.throws_ok(
  $sql$select count(*) from public.bottle_openings$sql$,
  '42501',
  'permission denied for table bottle_openings',
  'anon cannot read bottle openings'
);

select extensions.throws_ok(
  $sql$select public.preview_sale('[]'::jsonb)$sql$,
  '42501',
  'permission denied for function preview_sale',
  'anon cannot preview sale'
);

select extensions.throws_ok(
  $sql$select public.create_sale('[]'::jsonb, 'cash', '', 0, '')$sql$,
  '42501',
  'permission denied for function create_sale',
  'anon cannot create sale'
);

reset role;

select *
from extensions.finish();



rollback;
