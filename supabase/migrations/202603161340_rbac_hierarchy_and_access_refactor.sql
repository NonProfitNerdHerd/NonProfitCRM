insert into public.permissions (key, name, description, category)
values
  (
    'can_mass_delete_records',
    'Mass Delete Records',
    'Perform mass-delete operations for contacts, donations, and other data sets',
    'security'
  ),
  (
    'can_manage_integrations',
    'Manage Integrations',
    'Configure integration connections, sync jobs, and credentials',
    'administration'
  ),
  (
    'can_create_projects',
    'Create Projects',
    'Create CRM projects',
    'projects'
  ),
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
    'administrator',
    'Administrator',
    'Full system access. Can manage users, roles, integrations, and all operational modules.',
    true
  ),
  (
    null,
    'data_steward',
    'Data Steward',
    'Enhanced data stewardship with integration setup and controlled delete access.',
    true
  ),
  (
    null,
    'data_administrator',
    'Data Administrator',
    'High-privilege data operations role with integration management and mass-delete capabilities.',
    true
  ),
  (
    null,
    'executive_staff',
    'Executive Staff',
    'Leadership role with reporting, campaign management, and financial visibility.',
    true
  ),
  (
    null,
    'staff_pii',
    'Staff PII Access',
    'Staff role with access to protected PII fields.',
    true
  ),
  (
    null,
    'staff_non_pii',
    'Staff Non-PII Access',
    'Staff role without access to protected PII fields.',
    true
  ),
  (
    null,
    'data_entry',
    'Data Entry',
    'Data entry role for creating contacts/donations and editing only owned contacts.',
    true
  ),
  (
    null,
    'volunteer',
    'Volunteer',
    'Minimal limited-access volunteer role.',
    true
  )
on conflict (key) where organization_id is null
do update set
  name = excluded.name,
  description = excluded.description,
  is_system_template = excluded.is_system_template;

-- Normalize legacy executive_leader role assignments to executive_staff.
with ids as (
  select
    (select id from public.role_templates where organization_id is null and key = 'executive_leader' limit 1) as legacy_role_id,
    (select id from public.role_templates where organization_id is null and key = 'executive_staff' limit 1) as replacement_role_id
)
update public.organization_memberships m
set role_template_id = ids.replacement_role_id
from ids
where ids.legacy_role_id is not null
  and ids.replacement_role_id is not null
  and m.role_template_id = ids.legacy_role_id;

with ids as (
  select
    (select id from public.role_templates where organization_id is null and key = 'executive_leader' limit 1) as legacy_role_id,
    (select id from public.role_templates where organization_id is null and key = 'executive_staff' limit 1) as replacement_role_id
)
update public.organization_user_role_assignments a
set role_template_id = ids.replacement_role_id
from ids
where ids.legacy_role_id is not null
  and ids.replacement_role_id is not null
  and a.role_template_id = ids.legacy_role_id
  and not exists (
    select 1
    from public.organization_user_role_assignments existing
    where existing.organization_id = a.organization_id
      and existing.user_id = a.user_id
      and existing.role_template_id = ids.replacement_role_id
  );

with ids as (
  select
    (select id from public.role_templates where organization_id is null and key = 'executive_leader' limit 1) as legacy_role_id
)
delete from public.organization_user_role_assignments a
using ids
where ids.legacy_role_id is not null
  and a.role_template_id = ids.legacy_role_id;

with target_roles as (
  select id
  from public.role_templates
  where organization_id is null
    and key in (
      'administrator',
      'data_steward',
      'data_administrator',
      'executive_staff',
      'staff_pii',
      'staff_non_pii',
      'data_entry',
      'volunteer'
    )
)
delete from public.role_template_permissions rtp
using target_roles tr
where rtp.role_template_id = tr.id;

with template_permission_map as (
  select 'administrator'::text as role_key, unnest(array[
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
    'can_view_users',
    'can_view_roles',
    'can_manage_users',
    'can_manage_org_settings',
    'can_manage_role_templates',
    'can_manage_integrations',
    'can_mass_delete_records',
    'can_view_audit_log',
    'can_view_financial_summaries',
    'can_create_projects'
  ]) as permission_key
  union all
  select 'data_steward', unnest(array[
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
  ])
  union all
  select 'data_administrator', unnest(array[
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
  ])
  union all
  select 'executive_staff', unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_view_pii',
    'can_view_sensitive_notes',
    'can_view_sensitive_tasks',
    'can_view_donations',
    'can_create_campaigns',
    'can_manage_memberships',
    'can_view_member_records',
    'can_view_communications',
    'can_run_reports',
    'can_export_csv',
    'can_export_excel',
    'can_view_audit_log',
    'can_view_financial_summaries',
    'can_create_projects'
  ])
  union all
  select 'staff_pii', unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_create_contacts',
    'can_edit_contacts',
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
    'can_run_reports',
    'can_build_reports',
    'can_export_csv',
    'can_export_excel',
    'can_view_financial_summaries',
    'can_create_projects'
  ])
  union all
  select 'staff_non_pii', unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_create_contacts',
    'can_edit_contacts',
    'can_create_tasks',
    'can_view_donations',
    'can_create_donations',
    'can_edit_donations',
    'can_create_campaigns',
    'can_manage_memberships',
    'can_view_member_records',
    'can_view_communications',
    'can_manage_communications',
    'can_run_reports',
    'can_build_reports',
    'can_export_csv',
    'can_create_projects'
  ])
  union all
  select 'data_entry', unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_create_contacts',
    'can_edit_contacts',
    'can_view_donations',
    'can_create_donations'
  ])
  union all
  select 'volunteer', unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_view_communications'
  ])
),
resolved as (
  select
    rt.id as role_template_id,
    p.id as permission_id
  from template_permission_map map
  join public.role_templates rt
    on rt.key = map.role_key
   and rt.organization_id is null
  join public.permissions p
    on p.key = map.permission_key
)
insert into public.role_template_permissions (role_template_id, permission_id)
select role_template_id, permission_id
from resolved
on conflict (role_template_id, permission_id) do nothing;

create or replace function app.can_create_projects(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.has_permission(org_id, 'can_create_projects');
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

grant execute on function public.can_create_projects(uuid) to authenticated;

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update
  using (
    app.has_active_membership(organization_id)
    and (
      (
        app.has_permission(organization_id, 'can_edit_contacts')
        and coalesce(app.user_role_key(organization_id), '') <> 'data_entry'
      )
      or (
        app.has_permission(organization_id, 'can_edit_contacts')
        and coalesce(app.user_role_key(organization_id), '') = 'data_entry'
        and created_by = auth.uid()
      )
      or portal_user_id = auth.uid()
    )
  )
  with check (
    app.has_active_membership(organization_id)
    and (
      (
        app.has_permission(organization_id, 'can_edit_contacts')
        and coalesce(app.user_role_key(organization_id), '') <> 'data_entry'
      )
      or (
        app.has_permission(organization_id, 'can_edit_contacts')
        and coalesce(app.user_role_key(organization_id), '') = 'data_entry'
        and created_by = auth.uid()
      )
      or portal_user_id = auth.uid()
    )
  );
