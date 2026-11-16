create or replace view public.v_events
with (security_invoker = true)
as
select
  e.id,
  e.folio,
  e.name,
  e.venue,
  e.event_date,
  e.start_time,
  e.end_time,
  e.status,
  e.promotion_enabled,
  e.bundle_qty,
  e.bundle_price,
  e.opening_cash,
  e.notes,
  e.created_by,
  pr.full_name as created_by_name,
  e.created_at,
  e.updated_at,
  s.sales_count,
  d.drinks_count,
  s.gross_sales,
  s.discount_total,
  s.sales_total,
  x.expenses_total,
  x.expenses_count,
  round(s.sales_total - x.expenses_total, 2) as profit,
  case
    when s.sales_total > 0 then
      round((s.sales_total - x.expenses_total) / s.sales_total * 100, 1)
    else null
  end as margin_percent,
  f.supply_expenses_total,
  f.other_expenses_total,
  round(inv.inventory_current_value, 2) as inventory_current_value,
  round(inv.inventory_transferred_value, 2) as inventory_transferred_value,
  round(inv.inventory_current_value + inv.inventory_transferred_value, 2)
    as inventory_leftover_value,
  inv.negative_stock_count,
  round(inv.negative_stock_value, 2) as negative_stock_value,
  round(
    s.sales_total - x.expenses_total
      + inv.inventory_current_value
      + inv.inventory_transferred_value,
    2
  ) as result_total,
  case
    when s.sales_total > 0 then
      round(
        (
          s.sales_total - x.expenses_total
            + inv.inventory_current_value
            + inv.inventory_transferred_value
        )
        / s.sales_total
        * 100,
        1
      )
    else null
  end as result_margin_percent,
  s.promotion_sales_count,
  s.regular_sales_count
from public.events e
left join public.profiles pr on pr.id = e.created_by
left join lateral (
  select
    count(*)::integer as sales_count,
    count(*) filter (where es.promotion_applied)::integer as promotion_sales_count,
    count(*) filter (where not es.promotion_applied)::integer as regular_sales_count,
    coalesce(sum(es.gross_total), 0) as gross_sales,
    coalesce(sum(es.discount_total), 0) as discount_total,
    coalesce(sum(es.total), 0) as sales_total
  from public.event_sales es
  where es.event_id = e.id
) s on true
left join lateral (
  select coalesce(sum(esi.quantity), 0)::integer as drinks_count
  from public.event_sales es
  join public.event_sale_items esi on esi.event_sale_id = es.id
  where es.event_id = e.id
) d on true
left join lateral (
  select
    coalesce(sum(ex.amount), 0) as expenses_total,
    count(*)::integer as expenses_count
  from public.event_expenses ex
  where ex.event_id = e.id
) x on true
left join lateral (
  select
    coalesce(sum(
      case
        when exists (
          select 1
          from public.event_inventory_loads l
          where l.event_expense_id = ex.id
        ) then ex.amount
        else 0
      end
    ), 0) as supply_expenses_total,
    coalesce(sum(
      case
        when exists (
          select 1
          from public.event_inventory_loads l
          where l.event_expense_id = ex.id
        ) then 0
        else ex.amount
      end
    ), 0) as other_expenses_total
  from public.event_expenses ex
  where ex.event_id = e.id
) f on true
left join lateral (
  select
    coalesce(sum(s.stock_value), 0) as inventory_current_value,
    coalesce(sum(s.transferred_base * s.avg_unit_cost), 0)
      as inventory_transferred_value,
    count(*) filter (where s.current_qty_base < 0)::integer as negative_stock_count,
    coalesce(sum(
      case
        when s.current_qty_base < 0 then s.stock_value
        else 0
      end
    ), 0) as negative_stock_value
  from public.v_event_inventory_stock s
  where s.event_id = e.id
) inv on true;

revoke all on public.v_events from anon, authenticated;
grant select on public.v_events to authenticated;
