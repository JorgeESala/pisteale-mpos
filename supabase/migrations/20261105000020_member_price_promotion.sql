alter table public.promotions
  add column line_targeted boolean not null default false,
  add column max_per_order integer check (max_per_order is null or max_per_order > 0);

alter table public.order_promotions
  add column line_targeted boolean not null default false;

insert into public.promotions (
  name,
  bundle_qty,
  fixed_price,
  applies_to,
  applies_to_tier,
  automatic,
  active,
  sort_order,
  line_targeted,
  max_per_order
)
select
  'Precio socio',
  1,
  90,
  'any',
  'normal',
  false,
  true,
  20,
  true,
  1
where not exists (
  select 1 from public.promotions where name = 'Precio socio'
);

create or replace view public.v_order_promotions
with (security_invoker = true)
as
select
  op.id,
  op.order_id,
  o.folio,
  o.sold_at,
  op.promotion_id,
  op.promotion_name,
  op.automatic,
  op.bundle_qty,
  op.applications,
  op.gross_amount,
  op.discount_amount,
  op.created_at,
  op.line_targeted
from public.order_promotions op
join public.orders o on o.id = op.order_id;

revoke all on public.v_order_promotions from anon, authenticated;
grant select on public.v_order_promotions to authenticated;

create or replace function public.upsert_promotion(
  p_id uuid,
  p_name text,
  p_bundle_qty integer,
  p_fixed_price numeric,
  p_applies_to text,
  p_applies_to_tier text,
  p_include_category_ids uuid[],
  p_exclude_category_ids uuid[],
  p_automatic boolean,
  p_active boolean,
  p_sort_order integer,
  p_line_targeted boolean,
  p_max_per_order integer
)
returns public.promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_promotion public.promotions;
begin
  perform private.require_admin();

  if v_name is null or length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Nombre de promoción inválido' using errcode = '22023';
  end if;

  if p_bundle_qty is null or p_bundle_qty <= 0 then
    raise exception 'Cantidad de la promoción inválida' using errcode = '22023';
  end if;

  if p_fixed_price is null or p_fixed_price < 0 then
    raise exception 'Precio de la promoción inválido' using errcode = '22023';
  end if;

  if p_applies_to not in ('any', 'alcoholic', 'non_alcoholic') then
    raise exception 'Aplicación de promoción inválida' using errcode = '22023';
  end if;

  if p_applies_to_tier not in ('any', 'normal', 'premium') then
    raise exception 'Tier de promoción inválido' using errcode = '22023';
  end if;

  if coalesce(p_line_targeted, false) and p_bundle_qty <> 1 then
    raise exception 'Una promoción por línea debe ser de una bebida' using errcode = '22023';
  end if;

  if p_max_per_order is not null and p_max_per_order <= 0 then
    raise exception 'Máximo por ticket inválido' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.promotions (
      name,
      bundle_qty,
      fixed_price,
      applies_to,
      applies_to_tier,
      include_category_ids,
      exclude_category_ids,
      automatic,
      active,
      sort_order,
      line_targeted,
      max_per_order,
      created_by
    )
    values (
      v_name,
      p_bundle_qty,
      round(p_fixed_price, 2),
      p_applies_to,
      p_applies_to_tier,
      coalesce(p_include_category_ids, '{}'::uuid[]),
      coalesce(p_exclude_category_ids, '{}'::uuid[]),
      coalesce(p_automatic, false),
      coalesce(p_active, true),
      coalesce(p_sort_order, 0),
      coalesce(p_line_targeted, false),
      p_max_per_order,
      auth.uid()
    )
    returning * into v_promotion;
  else
    update public.promotions
    set
      name = v_name,
      bundle_qty = p_bundle_qty,
      fixed_price = round(p_fixed_price, 2),
      applies_to = p_applies_to,
      applies_to_tier = p_applies_to_tier,
      include_category_ids = coalesce(p_include_category_ids, '{}'::uuid[]),
      exclude_category_ids = coalesce(p_exclude_category_ids, '{}'::uuid[]),
      automatic = coalesce(p_automatic, false),
      active = coalesce(p_active, true),
      sort_order = coalesce(p_sort_order, 0),
      line_targeted = coalesce(p_line_targeted, false),
      max_per_order = p_max_per_order
    where id = p_id
    returning * into v_promotion;

    if v_promotion.id is null then
      raise exception 'Promoción no encontrada' using errcode = 'P0002';
    end if;
  end if;

  return v_promotion;
exception
  when unique_violation then
    raise exception 'Ya existe una promoción con ese nombre' using errcode = '23505';
end;
$$;

revoke all on function public.upsert_promotion(
  uuid, text, integer, numeric, text, text, uuid[], uuid[], boolean, boolean, integer, boolean, integer
) from public, anon;
grant execute on function public.upsert_promotion(
  uuid, text, integer, numeric, text, text, uuid[], uuid[], boolean, boolean, integer, boolean, integer
) to authenticated;
