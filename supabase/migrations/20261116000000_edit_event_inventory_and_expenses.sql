alter table public.event_inventory_loads
  add column updated_by uuid references public.profiles (id) on delete set null,
  add column updated_by_name text not null default '',
  add column updated_at timestamptz;

alter table public.event_expenses
  add column updated_by uuid references public.profiles (id) on delete set null,
  add column updated_by_name text not null default '';

create table public.event_finance_edits (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  entity_type text not null check (entity_type in ('inventory_load', 'expense')),
  entity_id uuid not null,
  edited_by uuid references public.profiles (id) on delete set null,
  edited_by_name text not null default '',
  edited_at timestamptz not null default now(),
  summary text not null default '',
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb
);

create index event_finance_edits_event_idx
  on public.event_finance_edits (event_id, edited_at desc);
create index event_finance_edits_entity_idx
  on public.event_finance_edits (entity_type, entity_id, edited_at desc);

alter table public.event_finance_edits enable row level security;

create policy event_finance_edits_select_active_users
on public.event_finance_edits
for select
to authenticated
using (private.is_active_user());

revoke all on public.event_finance_edits from anon, authenticated;
grant select on public.event_finance_edits to authenticated;

create or replace view public.v_event_inventory_loads
with (security_invoker = true)
as
select
  l.id,
  l.client_id,
  l.event_id,
  e.folio as event_folio,
  e.name as event_name,
  l.total_cost,
  l.category,
  l.payment_method,
  l.reference,
  l.notes,
  l.event_expense_id,
  l.created_by,
  pr.full_name as created_by_name,
  l.created_at,
  x.spent_at,
  l.updated_by,
  l.updated_by_name,
  l.updated_at
from public.event_inventory_loads l
join public.events e on e.id = l.event_id
left join public.event_expenses x on x.id = l.event_expense_id
left join public.profiles pr on pr.id = l.created_by;

revoke all on public.v_event_inventory_loads from anon, authenticated;
grant select on public.v_event_inventory_loads to authenticated;

create or replace view public.v_event_expenses
with (security_invoker = true)
as
select
  x.id,
  x.client_id,
  x.event_id,
  e.folio as event_folio,
  e.name as event_name,
  x.category,
  x.description,
  x.amount,
  x.payment_method,
  x.reference,
  x.spent_at,
  x.notes,
  x.created_by,
  pr.full_name as created_by_name,
  x.created_at,
  x.updated_at,
  x.updated_by,
  x.updated_by_name,
  l.id as inventory_load_id
from public.event_expenses x
join public.events e on e.id = x.event_id
left join public.profiles pr on pr.id = x.created_by
left join lateral (
  select id
  from public.event_inventory_loads
  where event_expense_id = x.id
  limit 1
) l on true;

revoke all on public.v_event_expenses from anon, authenticated;
grant select on public.v_event_expenses to authenticated;

create or replace view public.v_event_finance_edits
with (security_invoker = true)
as
select
  f.id,
  f.event_id,
  e.folio as event_folio,
  e.name as event_name,
  f.entity_type,
  f.entity_id,
  f.edited_by,
  f.edited_by_name,
  f.edited_at,
  f.summary,
  f.before_data,
  f.after_data
from public.event_finance_edits f
join public.events e on e.id = f.event_id;

revoke all on public.v_event_finance_edits from anon, authenticated;
grant select on public.v_event_finance_edits to authenticated;

create or replace function public.update_event_inventory_load(
  p_load_id uuid,
  p_event_id uuid,
  p_items jsonb,
  p_category text,
  p_payment_method text,
  p_reference text,
  p_notes text,
  p_spent_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_folio text;
  v_load public.event_inventory_loads;
  v_expense_id uuid;
  v_expense_event_id uuid;
  v_old_spent_at timestamptz;
  v_spent_at timestamptz;
  v_reference text;
  v_notes text;
  v_total numeric;
  v_old_items jsonb;
  v_new_items jsonb;
  v_before jsonb;
  v_after jsonb;
  v_negative_item text;
begin
  if not private.is_active_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_load_id is null or p_event_id is null then
    raise exception 'La carga y el evento son obligatorios' using errcode = '22023';
  end if;

  select folio into v_event_folio
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Evento no encontrado' using errcode = '22023';
  end if;

  select * into v_load
  from public.event_inventory_loads
  where id = p_load_id
    and event_id = p_event_id
  for update;

  if not found then
    raise exception 'Carga no encontrada' using errcode = '22023';
  end if;

  v_expense_id := v_load.event_expense_id;

  if v_expense_id is not null then
    select event_id, spent_at
    into v_expense_event_id, v_old_spent_at
    from public.event_expenses
    where id = v_expense_id
    for update;

    if not found then
      raise exception 'Gasto de la carga no encontrado' using errcode = '22023';
    end if;

    if v_expense_event_id <> p_event_id then
      raise exception 'El gasto de la carga no pertenece al evento' using errcode = '22023';
    end if;
  end if;

  if p_category not in ('supplies', 'ice', 'transport', 'staff', 'permits', 'rent', 'other') then
    raise exception 'Categoría de gasto inválida' using errcode = '22023';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'other') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;

  v_reference := btrim(coalesce(p_reference, ''));
  v_notes := btrim(coalesce(p_notes, ''));
  v_spent_at := coalesce(p_spent_at, v_old_spent_at, now());

  if length(v_reference) > 100 then
    raise exception 'La referencia es demasiado larga' using errcode = '22023';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'La carga debe incluir al menos un insumo' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'La carga tiene demasiados insumos' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    left join public.inventory_items i
      on i.id = nullif(item->>'item_id', '')::uuid
    where i.id is null
      or (item->>'qty_purchase') is null
      or (item->>'qty_purchase')::numeric <= 0
      or (item->>'total_cost') is null
      or (item->>'total_cost')::numeric < 0
      or (
        item ? 'purchase_factor'
        and btrim(coalesce(item->>'purchase_factor', '')) <> ''
        and (item->>'purchase_factor')::numeric <= 0
      )
  ) then
    raise exception 'Insumo o cantidad inválida en la carga' using errcode = '22023';
  end if;

  select coalesce(sum((item->>'total_cost')::numeric), 0)
  into v_total
  from jsonb_array_elements(p_items) as item;

  if v_total <= 0 then
    raise exception 'El costo de la carga debe ser mayor a cero' using errcode = '22023';
  end if;

  drop table if exists pg_temp.edit_load_items;

  create temp table pg_temp.edit_load_items on commit drop as
  select
    i.id as item_id,
    i.name as item_name,
    round(
      (e->>'qty_purchase')::numeric
      * coalesce(
        nullif(btrim(coalesce(e->>'purchase_factor', '')), '')::numeric,
        i.purchase_factor
      ),
      4
    ) as qty_base,
    round((e->>'total_cost')::numeric, 2) as total_cost
  from jsonb_array_elements(p_items) as e
  join public.inventory_items i on i.id = (e->>'item_id')::uuid;

  if exists (select 1 from pg_temp.edit_load_items where qty_base <= 0) then
    raise exception 'La cantidad convertida debe ser mayor a cero' using errcode = '22023';
  end if;

  select coalesce(sum(total_cost), 0) into v_total from pg_temp.edit_load_items;

  if v_total <= 0 then
    raise exception 'El costo de la carga debe ser mayor a cero' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', m.item_id,
      'item_name', i.name,
      'qty_base', m.qty_base,
      'total_cost', m.total_cost
    )
    order by i.name
  ), '[]'::jsonb)
  into v_old_items
  from public.event_inventory_movements m
  join public.inventory_items i on i.id = m.item_id
  where m.load_id = p_load_id
    and m.movement_type = 'purchase';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', item_id,
      'item_name', item_name,
      'qty_base', qty_base,
      'total_cost', total_cost
    )
    order by item_name
  ), '[]'::jsonb)
  into v_new_items
  from pg_temp.edit_load_items;

  v_before := jsonb_build_object(
    'load_id', v_load.id,
    'total_cost', v_load.total_cost,
    'category', v_load.category,
    'payment_method', v_load.payment_method,
    'reference', v_load.reference,
    'notes', v_load.notes,
    'spent_at', v_old_spent_at,
    'items', v_old_items
  );

  delete from public.event_inventory_movements
  where load_id = p_load_id
    and movement_type = 'purchase';

  insert into public.event_inventory_movements (
    event_id,
    load_id,
    item_id,
    movement_type,
    qty_base,
    unit_cost,
    total_cost,
    notes,
    occurred_at,
    created_by
  )
  select
    p_event_id,
    p_load_id,
    t.item_id,
    'purchase',
    t.qty_base,
    round(t.total_cost / nullif(t.qty_base, 0), 6),
    t.total_cost,
    v_notes,
    v_spent_at,
    auth.uid()
  from pg_temp.edit_load_items t;

  select i.name into v_negative_item
  from (
    select item_id, sum(qty_base) as qty
    from public.event_inventory_movements
    where event_id = p_event_id
    group by item_id
  ) s
  join public.inventory_items i on i.id = s.item_id
  where s.qty < 0
  limit 1;

  if v_negative_item is not null then
    raise exception 'La edición dejaría stock negativo de %', v_negative_item
      using errcode = '22023';
  end if;

  update public.event_inventory_loads
  set
    total_cost = round(v_total, 2),
    category = p_category,
    payment_method = p_payment_method,
    reference = v_reference,
    notes = v_notes,
    updated_by = auth.uid(),
    updated_by_name = coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    updated_at = now()
  where id = p_load_id;

  if v_expense_id is null then
    insert into public.event_expenses (
      client_id,
      event_id,
      category,
      description,
      amount,
      payment_method,
      reference,
      spent_at,
      notes,
      created_by,
      updated_by,
      updated_by_name
    )
    values (
      gen_random_uuid(),
      p_event_id,
      p_category,
      'Carga de inventario · ' || v_event_folio,
      round(v_total, 2),
      p_payment_method,
      v_reference,
      v_spent_at,
      v_notes,
      coalesce(v_load.created_by, auth.uid()),
      auth.uid(),
      coalesce((select full_name from public.profiles where id = auth.uid()), '')
    )
    returning id into v_expense_id;

    update public.event_inventory_loads
    set event_expense_id = v_expense_id
    where id = p_load_id;
  else
    update public.event_expenses
    set
      category = p_category,
      amount = round(v_total, 2),
      payment_method = p_payment_method,
      reference = v_reference,
      spent_at = v_spent_at,
      notes = v_notes,
      updated_by = auth.uid(),
      updated_by_name = coalesce((select full_name from public.profiles where id = auth.uid()), ''),
      updated_at = now()
    where id = v_expense_id;
  end if;

  v_after := jsonb_build_object(
    'load_id', p_load_id,
    'total_cost', round(v_total, 2),
    'category', p_category,
    'payment_method', p_payment_method,
    'reference', v_reference,
    'notes', v_notes,
    'spent_at', v_spent_at,
    'items', v_new_items
  );

  insert into public.event_finance_edits (
    event_id,
    entity_type,
    entity_id,
    edited_by,
    edited_by_name,
    summary,
    before_data,
    after_data
  )
  values (
    p_event_id,
    'inventory_load',
    p_load_id,
    auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    format('Carga de inventario · total %s → %s', v_load.total_cost, round(v_total, 2)),
    v_before,
    v_after
  );

  drop table if exists pg_temp.edit_load_items;

  return p_load_id;
end;
$$;

revoke all on function public.update_event_inventory_load(
  uuid,
  uuid,
  jsonb,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon;
grant execute on function public.update_event_inventory_load(
  uuid,
  uuid,
  jsonb,
  text,
  text,
  text,
  text,
  timestamptz
) to authenticated;

create or replace function public.update_event_expense(
  p_id uuid,
  p_event_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_payment_method text,
  p_reference text,
  p_spent_at timestamptz,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.event_expenses;
  v_description text;
  v_reference text;
  v_notes text;
  v_spent_at timestamptz;
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_active_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_id is null or p_event_id is null then
    raise exception 'El gasto y el evento son obligatorios' using errcode = '22023';
  end if;

  select * into v_expense
  from public.event_expenses
  where id = p_id
  for update;

  if not found then
    raise exception 'Gasto no encontrado' using errcode = '22023';
  end if;

  if v_expense.event_id <> p_event_id then
    raise exception 'El gasto no pertenece al evento' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.event_inventory_loads
    where event_expense_id = p_id
  ) then
    raise exception 'Este gasto está ligado a una carga de inventario del evento'
      using errcode = '22023';
  end if;

  if p_category not in ('supplies', 'ice', 'transport', 'staff', 'permits', 'rent', 'other') then
    raise exception 'Categoría de gasto inválida' using errcode = '22023';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'other') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;

  v_description := btrim(coalesce(p_description, ''));
  v_reference := btrim(coalesce(p_reference, ''));
  v_notes := btrim(coalesce(p_notes, ''));
  v_spent_at := coalesce(p_spent_at, v_expense.spent_at, now());

  if length(v_description) < 2 then
    raise exception 'La descripción del gasto es obligatoria' using errcode = '22023';
  end if;

  if length(v_description) > 200 then
    raise exception 'La descripción del gasto es demasiado larga' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del gasto es inválido' using errcode = '22023';
  end if;

  if length(v_reference) > 100 then
    raise exception 'La referencia es demasiado larga' using errcode = '22023';
  end if;

  if length(v_notes) > 1000 then
    raise exception 'Las notas son demasiado largas' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'expense_id', v_expense.id,
    'category', v_expense.category,
    'description', v_expense.description,
    'amount', v_expense.amount,
    'payment_method', v_expense.payment_method,
    'reference', v_expense.reference,
    'spent_at', v_expense.spent_at,
    'notes', v_expense.notes
  );

  update public.event_expenses
  set
    category = p_category,
    description = v_description,
    amount = round(p_amount, 2),
    payment_method = p_payment_method,
    reference = v_reference,
    spent_at = v_spent_at,
    notes = v_notes,
    updated_by = auth.uid(),
    updated_by_name = coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    updated_at = now()
  where id = p_id;

  v_after := jsonb_build_object(
    'expense_id', p_id,
    'category', p_category,
    'description', v_description,
    'amount', round(p_amount, 2),
    'payment_method', p_payment_method,
    'reference', v_reference,
    'spent_at', v_spent_at,
    'notes', v_notes
  );

  insert into public.event_finance_edits (
    event_id,
    entity_type,
    entity_id,
    edited_by,
    edited_by_name,
    summary,
    before_data,
    after_data
  )
  values (
    p_event_id,
    'expense',
    p_id,
    auth.uid(),
    coalesce((select full_name from public.profiles where id = auth.uid()), ''),
    format('Gasto · %s · monto %s → %s', v_description, v_expense.amount, round(p_amount, 2)),
    v_before,
    v_after
  );

  return p_id;
end;
$$;

revoke all on function public.update_event_expense(
  uuid,
  uuid,
  text,
  text,
  numeric,
  text,
  text,
  timestamptz,
  text
) from public, anon;
grant execute on function public.update_event_expense(
  uuid,
  uuid,
  text,
  text,
  numeric,
  text,
  text,
  timestamptz,
  text
) to authenticated;
