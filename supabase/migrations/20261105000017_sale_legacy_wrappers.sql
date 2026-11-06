create or replace function public.preview_sale(p_items jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.preview_sale(p_items, '{}'::uuid[]);
$$;

revoke all on function public.preview_sale(jsonb) from public, anon;
grant execute on function public.preview_sale(jsonb) to authenticated;

create or replace function public.create_sale(
  p_items jsonb,
  p_payment_method text,
  p_payment_reference text,
  p_tip numeric,
  p_notes text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select public.create_sale(
    p_items,
    '{}'::uuid[],
    p_payment_method,
    p_payment_reference,
    p_tip,
    p_notes
  );
$$;

revoke all on function public.create_sale(jsonb, text, text, numeric, text)
  from public, anon;
grant execute on function public.create_sale(jsonb, text, text, numeric, text)
  to authenticated;
