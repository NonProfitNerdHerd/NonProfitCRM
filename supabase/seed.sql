insert into public.permissions (key, name, description, category)
values
  ('can_view_contacts', 'View Contacts', 'Read contact records', 'contacts'),
  ('can_create_contacts', 'Create Contacts', 'Create contact records', 'contacts'),
  ('can_edit_contacts', 'Edit Contacts', 'Update contact records', 'contacts'),
  ('can_delete_contacts', 'Delete Contacts', 'Delete contact records', 'contacts'),
  ('can_view_pii', 'View PII', 'View protected PII fields and records', 'security'),
  ('can_view_sensitive_notes', 'View Sensitive Notes', 'Read restricted note records', 'notes'),
  ('can_view_sensitive_tasks', 'View Sensitive Tasks', 'Read restricted task records', 'tasks'),
  ('can_create_notes', 'Create Notes', 'Create notes', 'notes'),
  ('can_edit_notes', 'Edit Notes', 'Edit notes', 'notes'),
  ('can_delete_notes', 'Delete Notes', 'Delete notes', 'notes'),
  ('can_create_tasks', 'Create Tasks', 'Create tasks', 'tasks'),
  ('can_edit_tasks', 'Edit Tasks', 'Edit tasks', 'tasks'),
  ('can_delete_tasks', 'Delete Tasks', 'Delete tasks', 'tasks'),
  ('can_view_donations', 'View Donations', 'Read donation transactions', 'donations'),
  ('can_create_donations', 'Create Donations', 'Create donations', 'donations'),
  ('can_edit_donations', 'Edit Donations', 'Edit donations', 'donations'),
  ('can_manage_memberships', 'Manage Memberships', 'Manage membership types and records', 'memberships'),
  ('can_view_communications', 'View Communications', 'Read communication and notifications', 'communications'),
  ('can_manage_communications', 'Manage Communications', 'Create and manage communication entries', 'communications'),
  ('can_manage_imports', 'Manage Imports', 'Run imports and mapping workflows', 'imports'),
  ('can_run_reports', 'Run Reports', 'Execute reports', 'reports'),
  ('can_build_reports', 'Build Reports', 'Create and edit saved reports', 'reports'),
  ('can_export_csv', 'Export CSV', 'Export report data as CSV', 'reports'),
  ('can_export_excel', 'Export Excel', 'Export report data as Excel', 'reports'),
  ('can_manage_users', 'Manage Users', 'Manage organization users and role assignments', 'admin'),
  ('can_manage_org_settings', 'Manage Org Settings', 'Manage organization settings', 'admin'),
  ('can_view_audit_log', 'View Audit Log', 'Read audit log events', 'admin'),
  ('can_view_dashboard', 'View Dashboard', 'Access staff dashboard', 'core'),
  ('can_view_financial_summaries', 'View Financial Summaries', 'View aggregate financial summaries', 'donations'),
  ('can_view_member_records', 'View Member Records', 'View membership records', 'memberships'),
  ('can_manage_role_templates', 'Manage Role Templates', 'Manage role templates and permissions', 'admin')
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

insert into public.role_templates (organization_id, key, name, description, is_system_template)
values
  (null, 'volunteer', 'Volunteer', 'Limited access for volunteer workflows', true),
  (null, 'data_entry', 'Data Entry', 'Operational data-entry access', true),
  (null, 'staff_non_pii', 'Staff Non-PII Access', 'Staff access without PII visibility', true),
  (null, 'staff_pii', 'Staff PII Access', 'Staff access including protected PII', true),
  (null, 'administrator', 'Administrator', 'Administrative access with governance controls', true),
  (null, 'executive_staff', 'Executive Staff', 'Leadership role with reporting and financial views', true)
on conflict (key) where organization_id is null
do update set
  name = excluded.name,
  description = excluded.description,
  is_system_template = excluded.is_system_template;

with template_permission_map as (
  select 'volunteer'::text as role_key, unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_create_notes',
    'can_create_tasks',
    'can_view_communications'
  ]) as permission_key
  union all
  select 'data_entry', unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_create_contacts',
    'can_edit_contacts',
    'can_create_notes',
    'can_edit_notes',
    'can_create_tasks',
    'can_edit_tasks',
    'can_view_donations',
    'can_create_donations',
    'can_manage_imports'
  ])
  union all
  select 'staff_non_pii', unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_create_contacts',
    'can_edit_contacts',
    'can_view_donations',
    'can_create_donations',
    'can_edit_donations',
    'can_manage_memberships',
    'can_view_member_records',
    'can_view_communications',
    'can_manage_communications',
    'can_run_reports',
    'can_build_reports',
    'can_export_csv'
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
    'can_manage_memberships',
    'can_view_member_records',
    'can_view_communications',
    'can_manage_communications',
    'can_run_reports',
    'can_build_reports',
    'can_export_csv',
    'can_export_excel',
    'can_view_financial_summaries'
  ])
  union all
  select 'administrator', unnest(array[
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
    'can_manage_memberships',
    'can_view_member_records',
    'can_view_communications',
    'can_manage_communications',
    'can_manage_imports',
    'can_run_reports',
    'can_build_reports',
    'can_export_csv',
    'can_export_excel',
    'can_manage_users',
    'can_manage_org_settings',
    'can_view_audit_log',
    'can_view_financial_summaries',
    'can_manage_role_templates'
  ])
  union all
  select 'executive_staff', unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_view_pii',
    'can_view_sensitive_notes',
    'can_view_sensitive_tasks',
    'can_view_donations',
    'can_manage_memberships',
    'can_view_member_records',
    'can_view_communications',
    'can_run_reports',
    'can_export_csv',
    'can_export_excel',
    'can_view_audit_log',
    'can_view_financial_summaries'
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

insert into public.organizations (name, slug)
values ('Demo Community Foundation', 'demo-community-foundation')
on conflict (slug) do update set name = excluded.name;

with org as (
  select id as organization_id
  from public.organizations
  where slug = 'demo-community-foundation'
),
contact_seed as (
  insert into public.contacts (
    organization_id,
    first_name,
    last_name,
    preferred_name,
    email,
    phone,
    donor_status,
    member_status,
    communication_preferences,
    tags,
    external_source,
    external_source_id
  )
  select
    org.organization_id,
    c.first_name,
    c.last_name,
    c.preferred_name,
    c.email,
    c.phone,
    c.donor_status,
    c.member_status,
    c.communication_preferences::jsonb,
    c.tags::text[],
    c.external_source,
    c.external_source_id
  from org
  cross join (
    values
      ('Avery', 'Jordan', 'Avery', 'avery@example.org', '555-1000', 'active', 'active', '{"contact_by_email": true, "contact_by_sms": false}', array['major_donor', 'board'], 'kindful', 'K-1001'),
      ('Riley', 'Nguyen', null, 'riley@example.org', '555-1001', 'prospect', 'none', '{"contact_by_email": true, "contact_by_sms": true}', array['new_donor'], 'webconnex', 'W-2010')
  ) as c(first_name, last_name, preferred_name, email, phone, donor_status, member_status, communication_preferences, tags, external_source, external_source_id)
  on conflict (organization_id, external_source, external_source_id) do nothing
  returning id, organization_id
),
type_seed as (
  insert into public.membership_types (organization_id, key, name, description, default_duration_months, benefits)
  select
    org.organization_id,
    t.key,
    t.name,
    t.description,
    t.default_duration_months,
    t.benefits::jsonb
  from org
  cross join (
    values
      ('individual', 'Individual Membership', 'Standard annual membership', 12, '["newsletter","event discounts"]'),
      ('household', 'Household Membership', 'Family-level annual membership', 12, '["newsletter","family events"]')
  ) as t(key, name, description, default_duration_months, benefits)
  on conflict (organization_id, key) do nothing
  returning id, organization_id
)
insert into public.donations (
  organization_id,
  contact_id,
  amount,
  currency,
  donation_date,
  status,
  source,
  source_platform,
  external_transaction_id,
  campaign,
  is_recurring
)
select
  cs.organization_id,
  cs.id,
  150.00,
  'USD',
  current_date - interval '10 day',
  'posted',
  'import',
  'kindful',
  concat('TXN-', left(cs.id::text, 8)),
  'Annual Fund',
  false
from contact_seed cs
on conflict (organization_id, source_platform, external_transaction_id) do nothing;

insert into public.report_fields (
  organization_id,
  domain_key,
  field_key,
  label,
  description,
  data_type,
  source_table,
  source_column,
  is_default_visible,
  is_filterable,
  is_sortable,
  is_exportable,
  is_pii,
  visibility_classification,
  required_permission_key
)
values
  (null, 'contacts', 'first_name', 'First Name', 'Given name', 'text', 'contacts_safe_view', 'first_name', true, true, true, true, false, 'staff_public', 'can_view_contacts'),
  (null, 'contacts', 'last_name', 'Last Name', 'Family name', 'text', 'contacts_safe_view', 'last_name', true, true, true, true, false, 'staff_public', 'can_view_contacts'),
  (null, 'contacts', 'email', 'Email', 'Primary email address', 'text', 'contacts_safe_view', 'email', true, true, true, true, true, 'pii_protected', 'can_view_contacts'),
  (null, 'contacts', 'phone', 'Phone', 'Primary phone number', 'text', 'contacts_safe_view', 'phone', false, true, true, true, true, 'pii_protected', 'can_view_contacts'),
  (null, 'contacts', 'donor_status', 'Donor Status', 'Donor lifecycle status', 'text', 'contacts_safe_view', 'donor_status', true, true, true, true, false, 'staff_public', 'can_view_contacts'),
  (null, 'contacts', 'member_status', 'Member Status', 'Membership lifecycle status', 'text', 'contacts_safe_view', 'member_status', true, true, true, true, false, 'staff_public', 'can_view_member_records'),
  (null, 'donations', 'amount', 'Donation Amount', 'Donation amount', 'number', 'donations', 'amount', true, true, true, true, false, 'staff_public', 'can_view_donations'),
  (null, 'donations', 'donation_date', 'Donation Date', 'Donation date', 'date', 'donations', 'donation_date', true, true, true, true, false, 'staff_public', 'can_view_donations'),
  (null, 'donations', 'campaign', 'Campaign', 'Campaign attribution', 'text', 'donations', 'campaign', true, true, true, true, false, 'staff_public', 'can_view_donations'),
  (null, 'memberships', 'status', 'Membership Status', 'Current membership status', 'text', 'memberships', 'status', true, true, true, true, false, 'staff_public', 'can_view_member_records'),
  (null, 'memberships', 'renewal_date', 'Renewal Date', 'Renewal date', 'date', 'memberships', 'renewal_date', true, true, true, true, false, 'staff_public', 'can_view_member_records'),
  (null, 'notes', 'note_type', 'Note Type', 'Note category', 'text', 'notes_safe_view', 'note_type', true, true, true, true, false, 'staff_public', 'can_view_contacts'),
  (null, 'notes', 'body', 'Note Body', 'Note content', 'text', 'notes_safe_view', 'body', true, false, false, false, true, 'staff_restricted', 'can_view_sensitive_notes'),
  (null, 'tasks', 'title', 'Task Title', 'Task title', 'text', 'tasks_safe_view', 'title', true, true, true, true, false, 'staff_public', 'can_view_dashboard'),
  (null, 'tasks', 'status', 'Task Status', 'Task status', 'text', 'tasks_safe_view', 'status', true, true, true, true, false, 'staff_public', 'can_view_dashboard'),
  (null, 'communications', 'subject', 'Communication Subject', 'Communication subject', 'text', 'communication_log', 'subject', true, true, true, true, false, 'portal_visible', 'can_view_communications'),
  (null, 'communications', 'sent_at', 'Sent At', 'Sent timestamp', 'timestamp', 'communication_log', 'sent_at', true, true, true, true, false, 'portal_visible', 'can_view_communications')
on conflict (domain_key, field_key) where organization_id is null
do update set
  label = excluded.label,
  description = excluded.description,
  data_type = excluded.data_type,
  source_table = excluded.source_table,
  source_column = excluded.source_column,
  is_default_visible = excluded.is_default_visible,
  is_filterable = excluded.is_filterable,
  is_sortable = excluded.is_sortable,
  is_exportable = excluded.is_exportable,
  is_pii = excluded.is_pii,
  visibility_classification = excluded.visibility_classification,
  required_permission_key = excluded.required_permission_key;
