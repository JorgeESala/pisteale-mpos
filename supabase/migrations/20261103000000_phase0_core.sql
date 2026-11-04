create type public.user_role as enum ('admin', 'operador', 'consulta');

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'operador',
  can_view_financials boolean not null default false,
  can_adjust_inventory boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.document_sequences (
  doc_type text not null,
  year integer not null,
  last_number integer not null default 0,
  primary key (doc_type, year)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id, created_at desc);
create index profiles_role_idx on public.profiles (role);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role = 'admin'::public.user_role
  );
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
  );
$$;

create or replace function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and (
        role = 'admin'::public.user_role
        or (p_permission = 'view_financials' and can_view_financials)
        or (p_permission = 'adjust_inventory' and can_adjust_inventory)
        or (
          p_permission in ('read', 'operate')
          and role in (
            'admin'::public.user_role,
            'operador'::public.user_role,
            'consulta'::public.user_role
          )
        )
      )
  );
$$;

create or replace function private.require_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (user_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    case
      when tg_op = 'DELETE' then old.id::text
      else new.id::text
    end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;

  insert into public.profiles (id, full_name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, ''),
    case
      when is_first then 'admin'::public.user_role
      else 'operador'::public.user_role
    end,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function private.set_updated_at();

create trigger profiles_audit
after insert or update or delete on public.profiles
for each row execute function private.audit_trigger();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.document_sequences enable row level security;

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (id = auth.uid() or private.is_admin());

create policy app_settings_select_active_users
on public.app_settings
for select
to authenticated
using (private.is_active_user());

create policy audit_log_select_admin
on public.audit_log
for select
to authenticated
using (private.is_admin());

revoke all on public.profiles from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;
revoke all on public.document_sequences from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.app_settings to authenticated;
grant select on public.audit_log to authenticated;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
revoke all on all functions in schema private from public;
revoke all on all functions in schema private from anon;
revoke all on all functions in schema private from authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_active_user() to authenticated;

create or replace function public.ping()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'now', now());
$$;

create or replace function public.admin_set_profile(
  p_user_id uuid,
  p_role public.user_role,
  p_active boolean,
  p_can_view_financials boolean,
  p_can_adjust_inventory boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  perform private.require_admin();

  if p_user_id = auth.uid() and p_role <> 'admin'::public.user_role then
    raise exception 'No puedes quitarte el rol de administrador';
  end if;

  update public.profiles
  set
    role = p_role,
    active = p_active,
    can_view_financials = p_can_view_financials,
    can_adjust_inventory = p_can_adjust_inventory,
    updated_at = now()
  where id = p_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Perfil no encontrado';
  end if;

  return updated_profile;
end;
$$;

create or replace function public.next_folio(p_doc_type text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from (now() at time zone 'America/Cancun'))::integer;
  v_number integer;
  v_prefix text;
begin
  if p_doc_type not in ('order', 'event', 'purchase') then
    raise exception 'Tipo de folio no válido';
  end if;

  insert into public.document_sequences (doc_type, year, last_number)
  values (p_doc_type, v_year, 1)
  on conflict (doc_type, year)
  do update set last_number = public.document_sequences.last_number + 1
  returning last_number into v_number;

  v_prefix := case p_doc_type
    when 'order' then 'PED'
    when 'event' then 'EVT'
    when 'purchase' then 'CMP'
  end;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_number::text, 5, '0');
end;
$$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

revoke all on function public.admin_set_profile(
  uuid,
  public.user_role,
  boolean,
  boolean,
  boolean
) from public;
grant execute on function public.admin_set_profile(
  uuid,
  public.user_role,
  boolean,
  boolean,
  boolean
) to authenticated;

revoke all on function public.next_folio(text) from public, anon, authenticated;

insert into public.app_settings (key, value)
values
  ('business_name', '"PISTEALE"'::jsonb),
  ('timezone', '"America/Cancun"'::jsonb),
  ('currency', '"MXN"'::jsonb),
  ('phone', '"9831867263"'::jsonb),
  ('business_hours', '{"wed_sat":{"open":"17:00","close":"22:00"}}'::jsonb),
  ('service_area', '"Felipe Carrillo Puerto, Quintana Roo"'::jsonb)
on conflict (key) do nothing;
