alter table public.profiles
  drop constraint if exists profiles_platform_role_check;

alter table public.profiles
  add constraint profiles_platform_role_check
  check (platform_role in ('user', 'platform_admin', 'developer'));

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.platform_role in ('platform_admin', 'developer')
  );
$$;
