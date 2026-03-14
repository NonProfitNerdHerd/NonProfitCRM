-- Ensure Administrator templates always include all permissions.
insert into public.role_template_permissions (role_template_id, permission_id)
select rt.id, p.id
from public.role_templates rt
cross join public.permissions p
where rt.key = 'administrator'
on conflict (role_template_id, permission_id) do nothing;

-- Restore full access for IJRebout by forcing active Administrator membership.
with target_users as (
  select p.id as user_id
  from public.profiles p
  where lower(coalesce(p.username, '')) = 'ijrebout'
     or lower(coalesce(p.display_name, '')) = 'ijrebout'
     or lower(coalesce(p.email, '')) in ('ijrebout', 'ijrebout@example.org')
  union
  select au.id as user_id
  from auth.users au
  where lower(coalesce(au.email, '')) in ('ijrebout', 'ijrebout@example.org')
),
resolved_orgs as (
  select
    tu.user_id,
    coalesce(
      p.default_organization_id,
      om.organization_id,
      fallback_org.id
    ) as organization_id
  from target_users tu
  left join public.profiles p
    on p.id = tu.user_id
  left join lateral (
    select organization_id
    from public.organization_memberships om1
    where om1.user_id = tu.user_id
    order by om1.created_at asc
    limit 1
  ) om on true
  left join lateral (
    select o.id
    from public.organizations o
    order by o.created_at asc
    limit 1
  ) fallback_org on true
),
resolved_admin_roles as (
  select
    ro.user_id,
    ro.organization_id,
    (
      select rt.id
      from public.role_templates rt
      where rt.key = 'administrator'
        and (rt.organization_id = ro.organization_id or rt.organization_id is null)
      order by case when rt.organization_id = ro.organization_id then 0 else 1 end
      limit 1
    ) as role_template_id
  from resolved_orgs ro
  where ro.organization_id is not null
)
insert into public.organization_memberships (
  organization_id,
  user_id,
  role_template_id,
  is_active
)
select
  rar.organization_id,
  rar.user_id,
  rar.role_template_id,
  true
from resolved_admin_roles rar
where rar.role_template_id is not null
on conflict (organization_id, user_id)
do update set
  role_template_id = excluded.role_template_id,
  is_active = true,
  updated_at = timezone('utc', now());

update public.profiles p
set
  is_active = true,
  updated_at = timezone('utc', now())
where p.id in (
  select tu.user_id
  from (
    select p1.id as user_id
    from public.profiles p1
    where lower(coalesce(p1.username, '')) = 'ijrebout'
       or lower(coalesce(p1.display_name, '')) = 'ijrebout'
       or lower(coalesce(p1.email, '')) in ('ijrebout', 'ijrebout@example.org')
    union
    select au.id as user_id
    from auth.users au
    where lower(coalesce(au.email, '')) in ('ijrebout', 'ijrebout@example.org')
  ) tu
);
