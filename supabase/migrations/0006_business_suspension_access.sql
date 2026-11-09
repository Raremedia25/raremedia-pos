create or replace function public.has_org_role(p_org_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.organization_users ou
    join public.organizations o on o.id = ou.organization_id
    where ou.organization_id = p_org_id
      and ou.user_id = auth.uid()
      and ou.is_active = true
      and ou.role = any(p_roles)
      and o.status = 'active'
  );
$$;

drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations for select to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1 from public.organization_users ou
    where ou.organization_id = organizations.id
      and ou.user_id = auth.uid()
      and ou.is_active = true
  )
);

create or replace function public.guard_organization_status_change()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.status is distinct from old.status and not public.is_platform_admin() then
    raise exception 'Only Raremedia platform administrators can change business status';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_status_platform_admin_only on public.organizations;
create trigger organization_status_platform_admin_only
before update of status on public.organizations
for each row execute function public.guard_organization_status_change();
