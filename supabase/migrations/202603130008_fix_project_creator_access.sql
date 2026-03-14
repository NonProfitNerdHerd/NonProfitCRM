-- Ensure key permissions exist (in case seed did not run on a given environment).
insert into public.permissions (key, name, description, category)
values
  ('can_create_projects', 'Create Projects', 'Create CRM projects', 'projects'),
  ('can_create_campaigns', 'Create Campaigns', 'Create and manage campaigns', 'campaigns')
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

-- Ensure Administrator / Executive templates include project creation permission.
insert into public.role_template_permissions (role_template_id, permission_id)
select rt.id, p.id
from public.role_templates rt
join public.permissions p on p.key = 'can_create_projects'
where rt.key in ('administrator', 'executive_staff', 'executive_leader')
on conflict (role_template_id, permission_id) do nothing;

-- Make project creation resilient: permission-based first, then explicit role fallback.
create or replace function app.can_create_projects(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app.has_permission(org_id, 'can_create_projects')
    or coalesce(app.user_role_key(org_id), '') in ('administrator', 'executive_staff', 'executive_leader');
$$;

create or replace function public.can_create_projects(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.can_create_projects(org_id);
$$;

-- One-time targeted repair: force IJRebout to an active Administrator membership.
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
resolved_org as (
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
resolved_admin as (
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
  from resolved_org ro
  where ro.organization_id is not null
)
insert into public.organization_memberships (
  organization_id,
  user_id,
  role_template_id,
  is_active
)
select
  ra.organization_id,
  ra.user_id,
  ra.role_template_id,
  true
from resolved_admin ra
where ra.role_template_id is not null
on conflict (organization_id, user_id)
do update set
  role_template_id = excluded.role_template_id,
  is_active = true,
  updated_at = timezone('utc', now());
