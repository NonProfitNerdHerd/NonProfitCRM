-- Grant platform control-plane access to IJRebout.
-- This keeps existing tenant admin role mappings intact and adds explicit platform membership.

with target_users as (
  select p.id as user_id
  from public.profiles p
  where lower(coalesce(p.username, '')) = 'ijrebout'
     or lower(coalesce(p.display_name, '')) = 'ijrebout'
     or lower(coalesce(p.email, '')) in (
       'ijrebout',
       'ijrebout@example.org',
       'ijrebout@nonprofitcrm.local'
     )
  union
  select au.id as user_id
  from auth.users au
  where lower(coalesce(au.email, '')) in (
    'ijrebout',
    'ijrebout@example.org',
    'ijrebout@nonprofitcrm.local'
  )
)
insert into public.platform_admin_memberships (
  user_id,
  role,
  is_active
)
select
  tu.user_id,
  'super_admin'::public.platform_admin_role,
  true
from target_users tu
on conflict (user_id, role)
do update set
  is_active = true,
  updated_at = timezone('utc', now());
