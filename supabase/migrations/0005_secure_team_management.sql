drop policy if exists org_users_admin_manage on public.organization_users;
drop policy if exists org_users_platform_manage on public.organization_users;

create policy org_users_platform_manage on public.organization_users
for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());
