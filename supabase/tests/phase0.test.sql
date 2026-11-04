begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(23);

delete from auth.users
where id in (
  '11111111-1111-1111-1111-111111111111'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  '33333333-3333-3333-3333-333333333333'::uuid
);

delete from public.document_sequences;
delete from public.profiles;

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
  6::bigint,
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
  6::bigint,
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

select *
from extensions.finish();

rollback;
