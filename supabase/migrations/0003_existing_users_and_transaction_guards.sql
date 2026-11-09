-- Repair profiles for users created before the Auth trigger was installed.
insert into public.profiles(id, full_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- Keep financial and inventory records writable only through atomic RPCs.
drop policy if exists org_insert on public.sales;
drop policy if exists org_update on public.sales;
drop policy if exists org_delete on public.sales;
drop policy if exists org_insert on public.sale_items;
drop policy if exists org_update on public.sale_items;
drop policy if exists org_delete on public.sale_items;
drop policy if exists org_insert on public.payments;
drop policy if exists org_update on public.payments;
drop policy if exists org_delete on public.payments;
drop policy if exists org_insert on public.stock_movements;
drop policy if exists org_update on public.stock_movements;
drop policy if exists org_delete on public.stock_movements;
drop policy if exists org_insert on public.products;
drop policy if exists org_update on public.products;
drop policy if exists purchases_insert on public.purchases;
drop policy if exists purchases_update on public.purchases;
drop policy if exists purchases_delete on public.purchases;
drop policy if exists purchase_items_insert on public.purchase_items;
drop policy if exists audit_insert on public.audit_logs;

create or replace function public.create_product(
  p_org_id uuid,
  p_name text,
  p_sku text,
  p_unit text,
  p_selling_price numeric,
  p_cost_price numeric,
  p_initial_stock numeric,
  p_low_stock_threshold numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  if not public.has_org_role(p_org_id,array['owner','admin','cashier','accountant','stock_manager','waiter'])
     and not public.is_platform_admin() then
    raise exception 'Not authorized to create products in this business';
  end if;
  if p_name is null or length(btrim(p_name))=0 then raise exception 'Product name is required'; end if;
  if p_selling_price is null or p_selling_price<0 or p_cost_price is null or p_cost_price<0 then
    raise exception 'Product prices cannot be negative';
  end if;
  if p_initial_stock is null or p_initial_stock<0 then raise exception 'Opening stock cannot be negative'; end if;
  if p_low_stock_threshold is null or p_low_stock_threshold<0 then raise exception 'Low stock threshold cannot be negative'; end if;

  insert into public.products(
    organization_id,name,sku,unit,selling_price,cost_price,stock_quantity,low_stock_threshold
  ) values (
    p_org_id,btrim(p_name),nullif(btrim(coalesce(p_sku,'')), ''),
    coalesce(nullif(btrim(p_unit),''),'piece'),p_selling_price,p_cost_price,p_initial_stock,p_low_stock_threshold
  ) returning id into v_product_id;

  if p_initial_stock>0 then
    insert into public.stock_movements(organization_id,product_id,movement_type,quantity,notes)
    values(p_org_id,v_product_id,'opening',p_initial_stock,'Opening stock');
  end if;
  return v_product_id;
end;
$$;

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
  v_receipt_items jsonb;
begin
  if not public.has_org_role(p_org_id,array['owner','admin','cashier']) and not public.is_platform_admin() then
    raise exception 'You are not authorized to make sales in this business';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Sale must contain at least one item';
  end if;
  if p_discount is null or p_discount < 0 then
    raise exception 'Discount cannot be negative';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where id=p_customer_id and organization_id=p_org_id
  ) then
    raise exception 'Customer does not belong to this business';
  end if;

  -- Validate aggregate quantities so repeated product IDs cannot oversell stock.
  for v_item in
    select jsonb_build_object('product_id',item.product_id,'quantity',sum(item.quantity))
    from jsonb_to_recordset(p_items) as item(product_id uuid,quantity numeric(14,3))
    group by item.product_id
  loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Item quantity must be greater than zero';
    end if;
    select * into v_product from public.products
    where id=(v_item->>'product_id')::uuid and organization_id=p_org_id and is_active=true
    for update;
    if not found then
      raise exception 'A product does not belong to this business or is inactive';
    end if;
    if v_product.stock_quantity < v_qty then
      raise exception 'Insufficient stock for % (available %, requested %)',v_product.name,v_product.stock_quantity,v_qty;
    end if;
  end loop;

  v_count := jsonb_array_length(p_items);
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    select * into v_product from public.products
    where id=(v_item->>'product_id')::uuid and organization_id=p_org_id and is_active=true;
    v_line := round(v_product.selling_price*v_qty,2);
    v_subtotal := v_subtotal+v_line;
  end loop;

  if p_discount > v_subtotal then raise exception 'Discount cannot exceed the sale subtotal'; end if;
  v_total := greatest(0,round(v_subtotal-p_discount,2));
  v_paid := coalesce(p_amount_paid,v_total);
  if v_paid < 0 then raise exception 'Amount received cannot be negative'; end if;
  if v_paid < v_total then raise exception 'Payment is less than the sale total'; end if;

  v_receipt := 'RM-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.sales(organization_id,receipt_number,customer_id,cashier_id,subtotal,discount,total,status)
  values(p_org_id,v_receipt,p_customer_id,auth.uid(),v_subtotal,p_discount,v_total,'completed')
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    select * into v_product from public.products
    where id=(v_item->>'product_id')::uuid and organization_id=p_org_id and is_active=true
    for update;
    v_line := round(v_product.selling_price*v_qty,2);
    insert into public.sale_items(organization_id,sale_id,product_id,product_name,quantity,unit_price,line_total)
    values(p_org_id,v_sale_id,v_product.id,v_product.name,v_qty,v_product.selling_price,v_line);
    update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id;
    insert into public.stock_movements(organization_id,product_id,movement_type,quantity,reference,notes)
    values(p_org_id,v_product.id,'sale',-v_qty,v_receipt,'POS sale');
  end loop;

  insert into public.payments(organization_id,sale_id,amount,method)
  values(p_org_id,v_sale_id,v_total,coalesce(nullif(btrim(p_payment_method),''),'cash'));
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,details)
  values(p_org_id,auth.uid(),'sale.completed','sale',v_sale_id,
    jsonb_build_object('receipt_number',v_receipt,'total',v_total,'items',v_count));

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'name',product_name,'quantity',quantity,'unit_price',unit_price,'line_total',line_total
    )),
    '[]'::jsonb
  ) into v_receipt_items
  from public.sale_items where sale_id=v_sale_id;

  return jsonb_build_object(
    'sale_id',v_sale_id,'receipt_number',v_receipt,'subtotal',v_subtotal,
    'discount',p_discount,'total',v_total,'amount_paid',v_paid,'change',v_paid-v_total,
    'items',v_receipt_items
  );
end;
$$;

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
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Purchase requires items';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers where id=p_supplier_id and organization_id=p_org_id
  ) then
    raise exception 'Supplier does not belong to this business';
  end if;

  insert into public.purchases(organization_id,supplier_id,reference,created_by,status)
  values(p_org_id,p_supplier_id,p_reference,auth.uid(),'received') returning id into v_purchase;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    if v_qty is null or v_cost is null or v_qty<=0 or v_cost<0 then
      raise exception 'Invalid purchase quantity or cost';
    end if;
    select * into v_product from public.products
    where id=(v_item->>'product_id')::uuid and organization_id=p_org_id for update;
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

revoke all on function public.bootstrap_organization(text,text,text,text,text,uuid,boolean) from public, anon;
revoke all on function public.seed_demo_data(uuid) from public, anon;
revoke all on function public.create_product(uuid,text,text,text,numeric,numeric,numeric,numeric) from public, anon;
revoke all on function public.complete_sale(uuid,jsonb,text,numeric,uuid,numeric) from public, anon;
revoke all on function public.adjust_stock(uuid,uuid,numeric,text,text) from public, anon;
revoke all on function public.receive_purchase(uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.bootstrap_organization(text,text,text,text,text,uuid,boolean) to authenticated, service_role;
grant execute on function public.seed_demo_data(uuid) to authenticated, service_role;
grant execute on function public.create_product(uuid,text,text,text,numeric,numeric,numeric,numeric) to authenticated, service_role;
grant execute on function public.complete_sale(uuid,jsonb,text,numeric,uuid,numeric) to authenticated, service_role;
grant execute on function public.adjust_stock(uuid,uuid,numeric,text,text) to authenticated, service_role;
grant execute on function public.receive_purchase(uuid,uuid,jsonb,text) to authenticated, service_role;
