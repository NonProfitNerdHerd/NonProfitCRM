insert into public.permissions (key, name, description, category)
values
  (
    'can_view_users',
    'View Users',
    'View organization users and role assignments',
    'admin'
  ),
  (
    'can_view_roles',
    'View Roles',
    'View role templates and capability matrix',
    'admin'
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

insert into public.role_templates (organization_id, key, name, description, is_system_template)
values
  (
    null,
    'data_steward',
    'Data Steward',
    'Enhanced data stewardship with integration setup and controlled delete access.',
    true
  )
on conflict (key) where organization_id is null
do update set
  name = excluded.name,
  description = excluded.description,
  is_system_template = excluded.is_system_template;

with target_roles as (
  select id
  from public.role_templates
  where organization_id is null
    and key in ('administrator', 'data_administrator', 'data_steward')
),
target_permissions as (
  select id
  from public.permissions
  where key in ('can_view_users', 'can_view_roles')
)
insert into public.role_template_permissions (role_template_id, permission_id)
select tr.id, tp.id
from target_roles tr
cross join target_permissions tp
on conflict (role_template_id, permission_id) do nothing;

with steward as (
  select id
  from public.role_templates
  where organization_id is null
    and key = 'data_steward'
),
permission_map as (
  select unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_create_contacts',
    'can_edit_contacts',
    'can_delete_contacts',
    'can_view_pii',
    'can_view_sensitive_notes',
    'can_view_sensitive_tasks',
    'can_create_notes',
    'can_edit_notes',
    'can_delete_notes',
    'can_create_tasks',
    'can_edit_tasks',
    'can_delete_tasks',
    'can_view_donations',
    'can_create_donations',
    'can_edit_donations',
    'can_create_campaigns',
    'can_manage_memberships',
    'can_view_member_records',
    'can_view_communications',
    'can_manage_communications',
    'can_manage_imports',
    'can_run_reports',
    'can_build_reports',
    'can_export_csv',
    'can_export_excel',
    'can_manage_integrations',
    'can_mass_delete_records',
    'can_view_users',
    'can_view_roles',
    'can_view_audit_log',
    'can_view_financial_summaries',
    'can_create_projects'
  ]) as permission_key
),
resolved as (
  select s.id as role_template_id, p.id as permission_id
  from steward s
  join permission_map pm on true
  join public.permissions p on p.key = pm.permission_key
)
insert into public.role_template_permissions (role_template_id, permission_id)
select role_template_id, permission_id
from resolved
on conflict (role_template_id, permission_id) do nothing;
