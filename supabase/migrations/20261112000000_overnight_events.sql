create or replace function public.create_event(
  p_name text,
  p_venue text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_promotion_enabled boolean,
  p_bundle_qty integer,
  p_bundle_price numeric,
  p_opening_cash numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_venue text;
  v_notes text;
begin
  perform private.require_operator();

  v_name := btrim(coalesce(p_name, ''));
  v_venue := btrim(coalesce(p_venue, ''));
  v_notes := btrim(coalesce(p_notes, ''));

  if length(v_name) < 2 then
    raise exception 'El nombre del evento es obligatorio' using errcode = '22023';
  end if;

  if length(v_name) > 120 then
    raise exception 'El nombre del evento es demasiado largo' using errcode = '22023';
  end if;

  if length(v_venue) > 200 then
    raise exception 'La sede es demasiado larga' using errcode = '22023';
  end if;

  if p_event_date is null then
    raise exception 'La fecha del evento es obligatoria' using errcode = '22023';
  end if;

  if p_bundle_qty is null or p_bundle_qty < 2 then
    raise exception 'La cantidad de la promoción es inválida' using errcode = '22023';
  end if;

  if p_bundle_price is null or p_bundle_price < 0 then
    raise exception 'El precio de la promoción es inválido' using errcode = '22023';
  end if;

  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'El fondo de caja es inválido' using errcode = '22023';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  insert into public.events (
    folio,
    name,
    venue,
    event_date,
    start_time,
    end_time,
    status,
    promotion_enabled,
    bundle_qty,
    bundle_price,
    opening_cash,
    notes,
    created_by
  )
  values (
    public.next_folio('event'),
    v_name,
    v_venue,
    p_event_date,
    p_start_time,
    p_end_time,
    'open',
    coalesce(p_promotion_enabled, true),
    p_bundle_qty,
    round(p_bundle_price, 2),
    round(p_opening_cash, 2),
    v_notes,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_event(
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) from public, anon;
grant execute on function public.create_event(
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) to authenticated;

create or replace function public.update_event(
  p_id uuid,
  p_name text,
  p_venue text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_promotion_enabled boolean,
  p_bundle_qty integer,
  p_bundle_price numeric,
  p_opening_cash numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_venue text;
  v_notes text;
begin
  perform private.require_operator();

  if p_id is null then
    raise exception 'El evento es obligatorio' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  v_venue := btrim(coalesce(p_venue, ''));
  v_notes := btrim(coalesce(p_notes, ''));

  if length(v_name) < 2 then
    raise exception 'El nombre del evento es obligatorio' using errcode = '22023';
  end if;

  if length(v_name) > 120 then
    raise exception 'El nombre del evento es demasiado largo' using errcode = '22023';
  end if;

  if length(v_venue) > 200 then
    raise exception 'La sede es demasiado larga' using errcode = '22023';
  end if;

  if p_event_date is null then
    raise exception 'La fecha del evento es obligatoria' using errcode = '22023';
  end if;

  if p_bundle_qty is null or p_bundle_qty < 2 then
    raise exception 'La cantidad de la promoción es inválida' using errcode = '22023';
  end if;

  if p_bundle_price is null or p_bundle_price < 0 then
    raise exception 'El precio de la promoción es inválido' using errcode = '22023';
  end if;

  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'El fondo de caja es inválido' using errcode = '22023';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  update public.events
  set
    name = v_name,
    venue = v_venue,
    event_date = p_event_date,
    start_time = p_start_time,
    end_time = p_end_time,
    promotion_enabled = coalesce(p_promotion_enabled, true),
    bundle_qty = p_bundle_qty,
    bundle_price = round(p_bundle_price, 2),
    opening_cash = round(p_opening_cash, 2),
    notes = v_notes,
    updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  return p_id;
end;
$$;

revoke all on function public.update_event(
  uuid,
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) from public, anon;
grant execute on function public.update_event(
  uuid,
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) to authenticated;

comment on column public.events.end_time is
  'Hora de fin. Si es menor o igual a start_time, el evento termina al día siguiente.';

comment on function public.create_event(
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) is
  'Permite eventos que cruzan medianoche: end_time <= start_time significa que termina al día siguiente.';

comment on function public.update_event(
  uuid,
  text,
  text,
  date,
  time,
  time,
  boolean,
  integer,
  numeric,
  numeric,
  text
) is
  'Permite eventos que cruzan medianoche: end_time <= start_time significa que termina al día siguiente.';
