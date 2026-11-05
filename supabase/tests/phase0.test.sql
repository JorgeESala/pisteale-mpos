begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(57);

delete from auth.users
where id in (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  '33333333-3333-3333-3333-333333333333'::uuid
);

delete from public.document_sequences;
delete from public.profiles;
delete from public.ice_daily_records;

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
  3::bigint,
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
        false
      )
    ).can_view_financials
  ),
  true,
  'admin can update permissions'
);

select extensions.throws_ok(
  $sql$select public.admin_set_profile('11111111-1111-1111-1111-111111111111'::uuid, 'operador'::public.user_role, true, true, true)$sql$,
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
  $sql$select public.admin_set_profile('22222222-2222-2222-2222-222222222222'::uuid, 'admin'::public.user_role, true, true, true)$sql$,
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

reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

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

reset role;

select *
from extensions.finish();



rollback;
