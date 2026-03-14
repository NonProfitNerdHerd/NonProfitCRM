-- Ensure key create permissions exist.
insert into public.permissions (key, name, description, category)
values
  ('can_create_projects', 'Create Projects', 'Create CRM projects', 'projects'),
  ('can_create_campaigns', 'Create Campaigns', 'Create and manage campaigns', 'campaigns')
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

-- Ensure administrator templates always include every permission.
insert into public.role_template_permissions (role_template_id, permission_id)
select rt.id, p.id
from public.role_templates rt
cross join public.permissions p
where rt.key = 'administrator'
on conflict (role_template_id, permission_id) do nothing;

-- Ensure campaign creation permission is mapped for expected campaign creator roles.
insert into public.role_template_permissions (role_template_id, permission_id)
select rt.id, p.id
from public.role_templates rt
join public.permissions p on p.key = 'can_create_campaigns'
where rt.key in ('administrator', 'executive_staff', 'executive_leader', 'staff_member')
on conflict (role_template_id, permission_id) do nothing;

-- Make campaign creation resilient to role-template drift.
create or replace function app.can_create_campaigns(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app.has_permission(org_id, 'can_create_campaigns')
    or coalesce(app.user_role_key(org_id), '') in ('administrator', 'executive_staff', 'executive_leader', 'staff_member');
$$;

create or replace function public.can_create_campaigns(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.can_create_campaigns(org_id);
$$;

-- Resolve IJRebout user identity.
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
  select distinct om.user_id, om.organization_id
  from public.organization_memberships om
  join target_users tu on tu.user_id = om.user_id
  union
  select p.id as user_id, p.default_organization_id as organization_id
  from public.profiles p
  join target_users tu on tu.user_id = p.id
  where p.default_organization_id is not null
  union
  select tu.user_id, fallback_org.id as organization_id
  from target_users tu
  cross join lateral (
    select o.id
    from public.organizations o
    order by o.created_at asc
    limit 1
  ) fallback_org
  where not exists (
    select 1
    from public.organization_memberships om2
    where om2.user_id = tu.user_id
  )
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

-- Persist administrator assignment in additional role mappings as well.
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
  select distinct om.user_id, om.organization_id
  from public.organization_memberships om
  join target_users tu on tu.user_id = om.user_id
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
)
insert into public.organization_user_role_assignments (
  organization_id,
  user_id,
  role_template_id
)
select
  rar.organization_id,
  rar.user_id,
  rar.role_template_id
from resolved_admin_roles rar
where rar.role_template_id is not null
on conflict (organization_id, user_id, role_template_id) do nothing;

update public.profiles p
set
  is_active = true,
  updated_at = timezone('utc', now())
where lower(coalesce(p.username, '')) = 'ijrebout'
   or lower(coalesce(p.display_name, '')) = 'ijrebout'
   or lower(coalesce(p.email, '')) in ('ijrebout', 'ijrebout@example.org');
