-- RAREMEDIA POS: multi-business foundation
-- Run this migration in the Supabase SQL Editor or with Supabase CLI.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  platform_role text not null default 'user' check (platform_role in ('user','platform_admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text not null default 'Other',
  phone text,
  address text,
  currency text not null default 'RWF',
  logo_url text,
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','cashier','accountant','stock_manager','waiter','auditor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  sku text,
  barcode text,
  unit text not null default 'piece',
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  stock_quantity numeric(14,3) not null default 0,
  low_stock_threshold numeric(14,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  output_product_id uuid references public.products(id) on delete set null,
  instructions text,
  created_at timestamptz not null default now()
);

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0)
);

create table if not exists public.business_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  capacity integer not null default 4,
  status text not null default 'available' check (status in ('available','occupied','reserved','inactive')),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening','purchase','sale','adjustment','waste','return')),
  quantity numeric(14,3) not null,
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_number text,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_id uuid references auth.users(id) on delete set null,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'completed' check (status in ('draft','completed','voided','refunded')),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  line_total numeric(14,2) not null
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  amount numeric(14,2) not null check (amount >= 0),
  method text not null default 'cash',
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  category text,
  amount numeric(14,2) not null check (amount >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_org_users_user on public.organization_users(user_id);
create index if not exists idx_products_org on public.products(organization_id);
create index if not exists idx_sales_org_date on public.sales(organization_id, created_at desc);
create index if not exists idx_stock_org_date on public.stock_movements(organization_id, created_at desc);

-- Profile row is created automatically after a new Auth user is registered/invited.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_raremedia on auth.users;
create trigger on_auth_user_created_raremedia
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles(id, full_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.platform_role = 'platform_admin'
  );
$$;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_users ou
    join public.organizations o on o.id = ou.organization_id
    where ou.organization_id = p_org_id
      and ou.user_id = auth.uid()
      and ou.is_active = true
      and o.status = 'active'
  );
$$;

create or replace function public.has_org_role(p_org_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_users ou
    where ou.organization_id = p_org_id and ou.user_id = auth.uid()
      and ou.is_active = true and ou.role = any(p_roles)
  );
$$;

-- Called by the trusted create-business Edge Function (service role only),
-- or by a signed-in platform administrator.
create or replace function public.bootstrap_organization(
  p_name text,
  p_business_type text,
  p_phone text,
  p_address text,
  p_currency text,
  p_owner_id uuid,
  p_load_demo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is not null and auth.role() <> 'service_role' and not public.is_platform_admin() then
    raise exception 'Only Raremedia platform administrators can create businesses';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Business name is required';
  end if;
  if p_owner_id is null then
    raise exception 'Business owner account is required';
  end if;

  insert into public.organizations(name, business_type, phone, address, currency)
  values (trim(p_name), coalesce(nullif(trim(p_business_type),''),'Other'),
          nullif(trim(p_phone),''), nullif(trim(p_address),''), coalesce(nullif(trim(p_currency),''),'RWF'))
  returning id into v_org_id;

  insert into public.organization_users(organization_id, user_id, role)
  values (v_org_id, p_owner_id, 'owner');

  if p_load_demo then
    perform public.seed_demo_data(v_org_id);
  end if;
  return v_org_id;
end;
$$;

-- Demo catalogue is organization-scoped and idempotent: no-op if products exist.
create or replace function public.seed_demo_data(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drinks uuid;
  v_food uuid;
  v_ingredients uuid;
  v_water uuid;
  v_soda uuid;
  v_coffee uuid;
  v_chicken uuid;
  v_fries uuid;
  v_recipe uuid;
  i integer;
begin
  if auth.uid() is not null and auth.role() <> 'service_role'
     and not public.is_platform_admin() and not public.is_org_member(p_org_id) then
    raise exception 'Not authorized to seed this business';
  end if;
  if exists (select 1 from public.products where organization_id = p_org_id) then
    return;
  end if;

  insert into public.categories(organization_id,name) values
    (p_org_id,'Drinks'),(p_org_id,'Food'),(p_org_id,'Ingredients')
  on conflict (organization_id,name) do nothing;

  select id into v_drinks from public.categories where organization_id=p_org_id and name='Drinks';
  select id into v_food from public.categories where organization_id=p_org_id and name='Food';
  select id into v_ingredients from public.categories where organization_id=p_org_id and name='Ingredients';

  insert into public.products(organization_id,category_id,name,sku,unit,selling_price,cost_price,stock_quantity,low_stock_threshold)
  values
    (p_org_id,v_drinks,'Bottled Water 500ml','DEMO-WATER','bottle',500,250,100,10),
    (p_org_id,v_drinks,'Soda 300ml','DEMO-SODA','bottle',700,400,80,10),
    (p_org_id,v_drinks,'Coffee','DEMO-COFFEE','cup',1000,350,50,8),
    (p_org_id,v_food,'Chicken Plate','DEMO-CHICKEN','plate',5000,2800,20,3),
    (p_org_id,v_food,'Chips','DEMO-CHIPS','portion',2000,900,30,5),
    (p_org_id,v_ingredients,'Cooking Oil 1L','DEMO-OIL','litre',0,3500,25,5),
    (p_org_id,v_ingredients,'Potatoes 1kg','DEMO-POTATO','kg',0,900,60,10),
    (p_org_id,v_ingredients,'Chicken 1kg','DEMO-CHICKEN-RAW','kg',0,4500,20,4)
  on conflict (organization_id,sku) do nothing;

  select id into v_water from public.products where organization_id=p_org_id and sku='DEMO-WATER';
  select id into v_soda from public.products where organization_id=p_org_id and sku='DEMO-SODA';
  select id into v_coffee from public.products where organization_id=p_org_id and sku='DEMO-COFFEE';
  select id into v_chicken from public.products where organization_id=p_org_id and sku='DEMO-CHICKEN-RAW';
  select id into v_fries from public.products where organization_id=p_org_id and sku='DEMO-POTATO';

  insert into public.suppliers(organization_id,name,phone) values
    (p_org_id,'Demo Beverage Supplier','0780000001'),
    (p_org_id,'Demo Food Supplier','0780000002'),
    (p_org_id,'Demo General Supplier','0780000003');

  for i in 1..19 loop
    insert into public.business_tables(organization_id,name,capacity)
    values (p_org_id,'Table '||lpad(i::text,2,'0'),4)
    on conflict (organization_id,name) do nothing;
  end loop;

  insert into public.stock_movements(organization_id,product_id,movement_type,quantity,reference,notes)
  select p_org_id,p.id,'opening',p.stock_quantity,'DEMO-OPENING','Demo opening stock'
  from public.products p
  where p.organization_id=p_org_id and p.stock_quantity > 0;

  insert into public.recipes(organization_id,name,instructions)
  values (p_org_id,'Chicken Plate Recipe','Demo recipe; adjust quantities to match your kitchen.')
  returning id into v_recipe;
  insert into public.recipe_items(organization_id,recipe_id,product_id,quantity)
  values (p_org_id,v_recipe,v_chicken,0.25),(p_org_id,v_recipe,v_fries,0.30);

  insert into public.recipes(organization_id,name,instructions)
  values (p_org_id,'Coffee Recipe','Demo recipe; configure ingredients and quantities for your business.')
  returning id into v_recipe;
  insert into public.recipe_items(organization_id,recipe_id,product_id,quantity)
  values (p_org_id,v_recipe,v_coffee,1);

  -- Intentionally no demo sales, payments or expenses.
end;
$$;

-- Enable RLS on every organization-owned table.
do $$
declare t text;
begin
  foreach t in array array[
    'categories','products','suppliers','recipes','recipe_items','business_tables',
    'stock_movements','customers','sales','sale_items','payments','expenses'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists org_select on public.%I', t);
    execute format('create policy org_select on public.%I for select to authenticated using (public.is_platform_admin() or public.is_org_member(organization_id))', t);
    execute format('drop policy if exists org_insert on public.%I', t);
    execute format('create policy org_insert on public.%I for insert to authenticated with check (public.is_platform_admin() or public.has_org_role(organization_id, array[''owner'',''admin'',''cashier'',''accountant'',''stock_manager'',''waiter'']))', t);
    execute format('drop policy if exists org_update on public.%I', t);
    execute format('create policy org_update on public.%I for update to authenticated using (public.is_platform_admin() or public.has_org_role(organization_id, array[''owner'',''admin'',''accountant'',''stock_manager''])) with check (public.is_platform_admin() or public.has_org_role(organization_id, array[''owner'',''admin'',''accountant'',''stock_manager'']))', t);
    execute format('drop policy if exists org_delete on public.%I', t);
    execute format('create policy org_delete on public.%I for delete to authenticated using (public.is_platform_admin() or public.has_org_role(organization_id, array[''owner'',''admin'']))', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = auth.uid() or public.is_platform_admin());
-- No client-side UPDATE policy is granted on profiles. In particular, users
-- cannot promote themselves to platform_admin by editing platform_role.
-- Profile changes should be exposed later through a narrow, validated RPC.

alter table public.organizations enable row level security;
drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations for select to authenticated
using (public.is_platform_admin() or public.is_org_member(id));
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update to authenticated
using (public.is_platform_admin() or public.has_org_role(id, array['owner','admin']))
with check (public.is_platform_admin() or public.has_org_role(id, array['owner','admin']));

alter table public.organization_users enable row level security;
drop policy if exists org_users_read on public.organization_users;
create policy org_users_read on public.organization_users for select to authenticated
using (user_id = auth.uid() or public.is_platform_admin() or public.has_org_role(organization_id,array['owner','admin']));
drop policy if exists org_users_admin_manage on public.organization_users;
create policy org_users_admin_manage on public.organization_users for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Storage bucket for logos. Public read is intentional for logos displayed on receipts/reports.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('business-logos','business-logos',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Business logo upload by members" on storage.objects;
create policy "Business logo upload by members" on storage.objects for insert to authenticated
with check (bucket_id='business-logos' and (
  public.is_platform_admin() or public.is_org_member((storage.foldername(name))[1]::uuid)
));
drop policy if exists "Business logo update by members" on storage.objects;
create policy "Business logo update by members" on storage.objects for update to authenticated
using (bucket_id='business-logos' and (
  public.is_platform_admin() or public.is_org_member((storage.foldername(name))[1]::uuid)
))
with check (bucket_id='business-logos' and (
  public.is_platform_admin() or public.is_org_member((storage.foldername(name))[1]::uuid)
));
drop policy if exists "Business logos public read" on storage.objects;
create policy "Business logos public read" on storage.objects for select
using (bucket_id='business-logos');

grant execute on function public.seed_demo_data(uuid) to authenticated, service_role;
grant execute on function public.bootstrap_organization(text,text,text,text,text,uuid,boolean) to service_role, authenticated;
revoke all on function public.seed_demo_data(uuid) from public, anon;
revoke all on function public.bootstrap_organization(text,text,text,text,text,uuid,boolean) from public, anon;
