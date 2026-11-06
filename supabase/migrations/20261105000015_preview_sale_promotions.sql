drop function if exists public.preview_sale(jsonb);

create or replace function public.preview_sale(
  p_items jsonb,
  p_promotion_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warnings jsonb;
  v_promotions jsonb;
begin
  perform private.require_operator();

  v_warnings := private.sale_warnings(p_items);
  v_promotions := private.sale_promotions(p_items, p_promotion_ids);

  return jsonb_build_object(
    'warnings', v_warnings,
    'gross_total', v_promotions->'gross_total',
    'discount_total', v_promotions->'discount_total',
    'subtotal', v_promotions->'subtotal',
    'promotions', v_promotions->'promotions'
  );
end;
$$;

revoke all on function public.preview_sale(jsonb, uuid[]) from public, anon;
grant execute on function public.preview_sale(jsonb, uuid[]) to authenticated;
