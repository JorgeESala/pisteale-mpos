create or replace view public.v_orders
with (security_invoker = true)
as
select
  o.id,
  o.folio,
  o.sold_at,
  (o.sold_at at time zone 'America/Cancun')::date as sale_date,
  o.status,
  o.subtotal,
  o.tip_total,
  o.total,
  o.cost_total,
  case when o.cost_total is null then null else round(o.subtotal - o.cost_total, 2) end as margin,
  (
    select count(*)::integer
    from public.order_items oi
    where oi.order_id = o.id
  ) as item_count,
  (
    select string_agg(distinct pay.method, ', ')
    from public.payments pay
    where pay.order_id = o.id
  ) as payment_methods,
  (
    select coalesce(sum(pay.amount), 0)
    from public.payments pay
    where pay.order_id = o.id
  ) as payment_total,
  jsonb_array_length(o.inventory_warnings) as warning_count,
  o.created_by,
  pr.full_name as created_by_name,
  o.notes,
  o.created_at,
  o.updated_at,
  o.inventory_warnings
from public.orders o
left join public.profiles pr on pr.id = o.created_by;

revoke all on public.v_orders from anon, authenticated;
grant select on public.v_orders to authenticated;
