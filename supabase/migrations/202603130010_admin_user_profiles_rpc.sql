create or replace function public.admin_org_user_profiles(org_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  display_name text,
  email text,
  username text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.first_name,
    p.last_name,
    p.display_name,
    p.email,
    p.username,
    p.is_active
  from public.profiles p
  join public.organization_memberships om
    on om.user_id = p.id
   and om.organization_id = org_id
  where app.has_permission(org_id, 'can_manage_users')
  order by coalesce(nullif(trim(p.display_name), ''), p.email, p.id::text) asc;
$$;

grant execute on function public.admin_org_user_profiles(uuid) to authenticated;
