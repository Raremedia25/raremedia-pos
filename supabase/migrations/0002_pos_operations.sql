-- RAREMEDIA POS operational layer: checkout, stock, purchases and tenant-safe roles.
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  reference text,
  subtotal numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'received' check (status in ('draft','received','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_purchases_org_date on public.purchases(organization_id,created_at desc);
create index if not exists idx_expenses_org_date on public.expenses(organization_id,created_at desc);

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases for select to authenticated
using (public.is_platform_admin() or public.is_org_member(organization_id));
drop policy if exists purchases_insert on public.purchases;
create policy purchases_insert on public.purchases for insert to authenticated
with check (public.is_platform_admin() or public.has_org_role(organization_id,array['owner','admin','accountant','stock_manager']));
drop policy if exists purchases_update on public.purchases;
create policy purchases_update on public.purchases for update to authenticated
using (public.is_platform_admin() or public.has_org_role(organization_id,array['owner','admin','accountant','stock_manager']))
with check (public.is_platform_admin() or public.has_org_role(organization_id,array['owner','admin','accountant','stock_manager']));
drop policy if exists purchases_delete on public.purchases;
create policy purchases_delete on public.purchases for delete to authenticated
using (public.is_platform_admin() or public.has_org_role(organization_id,array['owner','admin']));

drop policy if exists purchase_items_select on public.purchase_items;
create policy purchase_items_select on public.purchase_items for select to authenticated
using (public.is_platform_admin() or public.is_org_member(organization_id));
drop policy if exists purchase_items_insert on public.purchase_items;
create policy purchase_items_insert on public.purchase_items for insert to authenticated
with check (public.is_platform_admin() or public.has_org_role(organization_id,array['owner','admin','accountant','stock_manager']));

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated
using (public.is_platform_admin() or public.has_org_role(organization_id,array['owner','admin','auditor']));
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert to authenticated
with check (public.is_platform_admin() or public.is_org_member(organization_id));

-- Restrict organization_users management to platform admins or organization owners/admins.
drop policy if exists org_users_admin_manage on public.organization_users;
create policy org_users_admin_manage on public.organization_users for all to authenticated
using (public.is_platform_admin() or public.has_org_role(organization_id,array['owner','admin']))
with check (public.is_platform_admin() or public.has_org_role(organization_id,array['owner','admin']));

-- The checkout is atomic: sale, lines, payment, stock decrements and audit event commit together.
create or replace function public.complete_sale(
  p_org_id uuid,
  p_items jsonb,
  p_payment_method text default 'cash',
  p_amount_paid numeric default null,
  p_customer_id uuid default null,
  p_discount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_receipt text;
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_paid numeric(14,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty numeric(14,3);
  v_line numeric(14,2);
  v_count integer := 0;
begin
  if not public.has_org_role(p_org_id,array['owner','admin','cashier']) and not public.is_platform_admin() then
    raise exception 'You are not authorized to make sales in this business';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Sale must contain at least one item';
  end if;
  if p_discount < 0 then raise exception 'Discount cannot be negative'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    select * into v_product from public.products
      where id=(v_item->>'product_id')::uuid and organization_id=p_org_id and is_active=true
      for update;
    if not found then raise exception 'A product does not belong to this business or is inactive'; end if;
    if v_product.stock_quantity < v_qty then
      raise exception 'Insufficient stock for % (available %, requested %)',v_product.name,v_product.stock_quantity,v_qty;
    end if;
    v_line := round(v_product.selling_price*v_qty,2);
    v_subtotal := v_subtotal + v_line;
    v_count := v_count + 1;
  end loop;

  v_total := greatest(0,round(v_subtotal-p_discount,2));
  v_paid := coalesce(p_amount_paid,v_total);
  if v_paid < v_total then raise exception 'Payment is less than the sale total'; end if;

  v_receipt := 'RM-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.sales(organization_id,receipt_number,customer_id,cashier_id,subtotal,discount,total,status)
  values(p_org_id,v_receipt,p_customer_id,auth.uid(),v_subtotal,p_discount,v_total,'completed')
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    select * into v_product from public.products
      where id=(v_item->>'product_id')::uuid and organization_id=p_org_id for update;
    v_line := round(v_product.selling_price*v_qty,2);
    insert into public.sale_items(organization_id,sale_id,product_id,product_name,quantity,unit_price,line_total)
    values(p_org_id,v_sale_id,v_product.id,v_product.name,v_qty,v_product.selling_price,v_line);
    update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id;
    insert into public.stock_movements(organization_id,product_id,movement_type,quantity,reference,notes)
    values(p_org_id,v_product.id,'sale',-v_qty,v_receipt,'POS sale');
  end loop;

  insert into public.payments(organization_id,sale_id,amount,method)
  values(p_org_id,v_sale_id,v_total,coalesce(nullif(p_payment_method,''),'cash'));

  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
  values(p_org_id,auth.uid(),'sale.completed','sale',v_sale_id,
    jsonb_build_object('receipt_number',v_receipt,'total',v_total,'items',v_count));

  return jsonb_build_object('sale_id',v_sale_id,'receipt_number',v_receipt,'subtotal',v_subtotal,'discount',p_discount,'total',v_total,'amount_paid',v_paid,'change',v_paid-v_total);
end;
$$;

-- Stock adjustment RPC: only stock-authorized roles can change quantities.
create or replace function public.adjust_stock(
  p_org_id uuid,p_product_id uuid,p_quantity numeric,p_reason text default 'adjustment',p_notes text default null
)
returns void language plpgsql security definer set search_path=public
as $$
declare v_product public.products%rowtype;
begin
  if not public.has_org_role(p_org_id,array['owner','admin','stock_manager']) and not public.is_platform_admin() then
    raise exception 'Not authorized to adjust stock';
  end if;
  if p_quantity=0 then raise exception 'Adjustment quantity cannot be zero'; end if;
  select * into v_product from public.products where id=p_product_id and organization_id=p_org_id for update;
  if not found then raise exception 'Product not found in this business'; end if;
  if v_product.stock_quantity+p_quantity < 0 then raise exception 'Stock cannot become negative'; end if;
  update public.products set stock_quantity=stock_quantity+p_quantity where id=p_product_id;
  insert into public.stock_movements(organization_id,product_id,movement_type,quantity,reference,notes)
  values(p_org_id,p_product_id,'adjustment',p_quantity,p_reason,p_notes);
end;
$$;

-- Receive purchase and update stock in one transaction.
create or replace function public.receive_purchase(
  p_org_id uuid,p_supplier_id uuid,p_items jsonb,p_reference text default null
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare
  v_purchase uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty numeric(14,3);
  v_cost numeric(14,2);
  v_total numeric(14,2):=0;
begin
  if not public.has_org_role(p_org_id,array['owner','admin','accountant','stock_manager']) and not public.is_platform_admin() then
    raise exception 'Not authorized to receive purchases';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Purchase requires items'; end if;

  insert into public.purchases(organization_id,supplier_id,reference,created_by,status)
  values(p_org_id,p_supplier_id,p_reference,auth.uid(),'received') returning id into v_purchase;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    if v_qty<=0 or v_cost<0 then raise exception 'Invalid purchase quantity or cost'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and organization_id=p_org_id for update;
    if not found then raise exception 'Purchase item product is not in this business'; end if;
    insert into public.purchase_items(organization_id,purchase_id,product_id,quantity,unit_cost,line_total)
    values(p_org_id,v_purchase,v_product.id,v_qty,v_cost,round(v_qty*v_cost,2));
    update public.products set stock_quantity=stock_quantity+v_qty,cost_price=v_cost where id=v_product.id;
    insert into public.stock_movements(organization_id,product_id,movement_type,quantity,reference,notes)
    values(p_org_id,v_product.id,'purchase',v_qty,coalesce(p_reference,v_purchase::text),'Stock received');
    v_total := v_total+round(v_qty*v_cost,2);
  end loop;
  update public.purchases set subtotal=v_total,total=v_total where id=v_purchase;
  return v_purchase;
end;
$$;

grant execute on function public.complete_sale(uuid,jsonb,text,numeric,uuid,numeric) to authenticated;
grant execute on function public.adjust_stock(uuid,uuid,numeric,text,text) to authenticated;
grant execute on function public.receive_purchase(uuid,uuid,jsonb,text) to authenticated;
