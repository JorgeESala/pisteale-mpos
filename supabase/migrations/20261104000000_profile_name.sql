create or replace function public.update_my_profile(p_full_name text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_full_name);
  updated_profile public.profiles;
begin
  if v_name is null or length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  update public.profiles
  set full_name = v_name
  where id = auth.uid()
    and active = true
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Perfil no encontrado o inactivo' using errcode = '42501';
  end if;

  return updated_profile;
end;
$$;

create or replace function public.admin_update_profile_name(
  p_user_id uuid,
  p_full_name text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_full_name);
  updated_profile public.profiles;
begin
  perform private.require_admin();

  if v_name is null or length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  update public.profiles
  set full_name = v_name
  where id = p_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Perfil no encontrado' using errcode = 'P0001';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.update_my_profile(text) from public, anon;
grant execute on function public.update_my_profile(text) to authenticated;

revoke all on function public.admin_update_profile_name(uuid, text) from public, anon;
grant execute on function public.admin_update_profile_name(uuid, text) to authenticated;
