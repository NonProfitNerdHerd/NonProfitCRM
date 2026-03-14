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
  ('can_create_campaigns', 'Create Campaigns', 'Create and manage campaigns', 'campaigns'),
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
    'can_create_campaigns',
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
    'can_create_campaigns',
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
    'can_create_campaigns',
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
    'can_create_campaigns',
    'can_manage_memberships',
    'can_view_member_records',
    'can_view_communications',
    'can_run_reports',
    'can_export_csv',
    'can_export_excel',
    'can_view_audit_log',
    'can_view_financial_summaries'
  ])
  union all
  select 'executive_leader', unnest(array[
    'can_view_dashboard',
    'can_view_contacts',
    'can_view_donations',
    'can_create_campaigns',
    'can_manage_memberships',
    'can_view_member_records',
    'can_run_reports',
    'can_export_csv',
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
  insert into public.membership_types (
    organization_id,
    key,
    name,
    description,
    default_duration_months,
    membership_length,
    length_unit,
    status,
    benefits
  )
  select
    org.organization_id,
    t.key,
    t.name,
    t.description,
    t.default_duration_months,
    t.membership_length,
    t.length_unit,
    t.status,
    t.benefits::jsonb
  from org
  cross join (
    values
      ('individual', 'Individual Membership', 'Standard annual membership', 12, 12, 'months', 'active', '["newsletter","event discounts"]'),
      ('household', 'Household Membership', 'Family-level annual membership', 12, 12, 'months', 'active', '["newsletter","family events"]')
  ) as t(key, name, description, default_duration_months, membership_length, length_unit, status, benefits)
  on conflict (organization_id, key) do nothing
  returning id, organization_id
),
campaign_seed as (
  insert into public.campaigns (organization_id, name, description, status, start_date)
  select
    org.organization_id,
    c.name,
    c.description,
    c.status::public.campaign_status,
    c.start_date::date
  from org
  cross join (
    values
      ('Annual Fund', 'Primary annual giving campaign', 'Active', current_date - interval '30 days'),
      ('Community Grants', 'Restricted grants and sponsorship campaign', 'Active', current_date - interval '15 days')
  ) as c(name, description, status, start_date)
  on conflict (organization_id, name) do update
  set
    description = excluded.description,
    status = excluded.status,
    start_date = excluded.start_date
  returning id, organization_id, name
)
insert into public.donations (
  organization_id,
  contact_id,
  campaign_id,
  amount,
  currency,
  donation_date,
  status,
  payment_type,
  check_number,
  transaction_id,
  source,
  source_platform,
  external_transaction_id,
  campaign,
  is_recurring,
  memo
)
select
  cs.organization_id,
  cs.id,
  camp.id,
  150.00,
  'USD',
  current_date - interval '10 day',
  'posted',
  'Card',
  null,
  concat('TXN-', left(cs.id::text, 8)),
  'import',
  'kindful',
  concat('KIND-', left(cs.id::text, 8)),
  'Annual Fund',
  false,
  'Seeded donation'
from contact_seed cs
join campaign_seed camp
  on camp.organization_id = cs.organization_id
 and camp.name = 'Annual Fund'
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

insert into public.permissions (key, name, description, category)
values
  ('can_create_projects', 'Create Projects', 'Create CRM projects', 'projects')
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

insert into public.role_templates (organization_id, key, name, description, is_system_template)
values
  (null, 'executive_leader', 'Executive Leader', 'Leadership role with project creation rights', true)
on conflict (key) where organization_id is null
do update set
  name = excluded.name,
  description = excluded.description,
  is_system_template = excluded.is_system_template;

insert into public.role_template_permissions (role_template_id, permission_id)
select rt.id, p.id
from public.role_templates rt
join public.permissions p on p.key = 'can_create_projects'
where rt.organization_id is null
  and rt.key in ('administrator', 'executive_staff', 'executive_leader')
on conflict (role_template_id, permission_id) do nothing;

insert into public.role_template_permissions (role_template_id, permission_id)
select rt.id, p.id
from public.role_templates rt
join public.permissions p on p.key = 'can_create_campaigns'
where rt.organization_id is null
  and rt.key in (
    'administrator',
    'executive_staff',
    'executive_leader',
    'staff_non_pii',
    'staff_pii',
    'data_entry'
  )
on conflict (role_template_id, permission_id) do nothing;

with org as (
  select id as organization_id
  from public.organizations
  where slug = 'demo-community-foundation'
),
contacts as (
  select c.id, c.organization_id, c.first_name, c.last_name, c.email, c.phone
  from public.contacts c
  join org on org.organization_id = c.organization_id
),
crm_org_seed as (
  insert into public.crm_organizations (organization_id, name, description)
  select org.organization_id, v.name, v.description
  from org
  cross join (
    values
      ('Hope Partners', 'Regional nonprofit partner organization'),
      ('Northside Outreach', 'Community outreach organization')
  ) as v(name, description)
  on conflict (organization_id, name) do update set description = excluded.description
  returning id, organization_id, name
),
project_seed as (
  insert into public.projects (organization_id, name, description, status)
  select org.organization_id, 'Spring Donor Renewal', '30-day renewal outreach effort', 'active'
  from org
  on conflict (organization_id, name) do update set description = excluded.description
  returning id, organization_id
),
email_seed as (
  insert into public.contact_emails (organization_id, contact_id, email, label, is_primary)
  select c.organization_id, c.id, c.email, 'primary', true
  from contacts c
  where c.email is not null
  on conflict (organization_id, contact_id, email) do nothing
),
phone_seed as (
  insert into public.contact_phones (organization_id, contact_id, phone, label, is_primary)
  select c.organization_id, c.id, c.phone, 'primary', true
  from contacts c
  where c.phone is not null
  on conflict (organization_id, contact_id, phone) do nothing
),
relationship_seed as (
  insert into public.contact_relationships (organization_id, contact_id, related_contact_id, relationship_type, relationship_label)
  select c1.organization_id, c1.id, c2.id, 'spouse', 'Spouse'
  from contacts c1
  join contacts c2 on c1.organization_id = c2.organization_id and c1.id <> c2.id
  order by c1.id, c2.id
  limit 1
  on conflict (organization_id, contact_id, related_contact_id, relationship_type) do nothing
),
org_link_seed as (
  insert into public.contact_organization_links (organization_id, contact_id, crm_organization_id, relationship_type)
  select c.organization_id, c.id, co.id, 'member'
  from contacts c
  join crm_org_seed co on co.organization_id = c.organization_id
  on conflict (organization_id, contact_id, crm_organization_id) do nothing
),
task_seed as (
  insert into public.tasks (
    organization_id,
    title,
    description,
    due_date,
    status,
    priority,
    contact_id,
    project_id,
    crm_organization_id
  )
  select
    c.organization_id,
    concat('Follow up with ', c.first_name, ' ', c.last_name),
    'Discuss renewal and giving plan',
    current_date + interval '7 days',
    'todo',
    'high',
    c.id,
    p.id,
    co.id
  from contacts c
  join project_seed p on p.organization_id = c.organization_id
  join crm_org_seed co on co.organization_id = c.organization_id
  where co.name = 'Hope Partners'
  limit 1
  returning id, organization_id, contact_id, project_id
),
subtask_seed as (
  insert into public.tasks (
    organization_id,
    title,
    description,
    due_date,
    status,
    priority,
    contact_id,
    project_id,
    parent_task_id
  )
  select
    ts.organization_id,
    'Prepare call notes',
    'Review past donations and latest interactions',
    current_date + interval '2 days',
    'in_progress',
    'medium',
    ts.contact_id,
    ts.project_id,
    ts.id
  from task_seed ts
  returning id, organization_id, contact_id
),
note_seed as (
  insert into public.notes (
    organization_id,
    contact_id,
    note_type,
    body
  )
  select
    c.organization_id,
    c.id,
    'call',
    'Discussed campaign goals and interest in recurring support.'
  from contacts c
  limit 1
  returning id, organization_id, contact_id
),
donation_seed as (
  insert into public.donations (
    organization_id,
    contact_id,
    campaign_id,
    amount,
    currency,
    donation_date,
    status,
    payment_type,
    check_number,
    transaction_id,
    source,
    source_platform,
    memo
  )
  select
    c.organization_id,
    c.id,
    camp.id,
    275.00,
    'USD',
    current_date - interval '3 days',
    'posted',
    'Check',
    'CHK-2026-9001',
    null,
    'manual',
    'staff_entry',
    'Spring campaign support'
  from contacts c
  join public.campaigns camp
    on camp.organization_id = c.organization_id
   and camp.name = 'Annual Fund'
  limit 1
  on conflict do nothing
  returning id, organization_id, contact_id
)
insert into public.activity_log (
  organization_id,
  entity_type,
  entity_id,
  related_contact_id,
  action_type,
  action_summary,
  performed_by_user_id
)
select organization_id, 'task', id, contact_id, 'created', 'Created task from seed data', null from task_seed
union all
select organization_id, 'subtask', id, contact_id, 'created', 'Created subtask from seed data', null from subtask_seed
union all
select organization_id, 'note', id, contact_id, 'created', 'Created note from seed data', null from note_seed
union all
select organization_id, 'donation', id, contact_id, 'created', 'Created donation from seed data', null from donation_seed;

with org as (
  select id as organization_id
  from public.organizations
  where slug = 'demo-community-foundation'
),
project_ref as (
  select p.id, p.organization_id
  from public.projects p
  join org on org.organization_id = p.organization_id
  where p.name = 'Spring Donor Renewal'
  limit 1
),
members as (
  select om.organization_id, om.user_id
  from public.organization_memberships om
  join org on org.organization_id = om.organization_id
  where om.is_active = true
),
project_staff_seed as (
  insert into public.project_staff (organization_id, project_id, user_id, role_on_project)
  select
    m.organization_id,
    pr.id,
    m.user_id,
    case when row_number() over (order by m.user_id) = 1 then 'Project Manager' else 'Team Member' end
  from members m
  join project_ref pr on pr.organization_id = m.organization_id
  on conflict (project_id, user_id) do update
  set role_on_project = excluded.role_on_project
  returning id, organization_id, project_id, user_id
),
stakeholder_seed as (
  insert into public.project_stakeholders (
    organization_id,
    project_id,
    stakeholder_name,
    stakeholder_role_title,
    stakeholder_organization,
    stakeholder_type,
    influence_level,
    interest_level,
    support_level,
    engagement_strategy,
    communication_needs,
    owner_user_id,
    contact_info
  )
  select
    pr.organization_id,
    pr.id,
    s.stakeholder_name,
    s.stakeholder_role_title,
    s.stakeholder_organization,
    s.stakeholder_type,
    s.influence_level,
    s.interest_level,
    s.support_level,
    s.engagement_strategy,
    s.communication_needs,
    (select user_id from members limit 1),
    s.contact_info
  from project_ref pr
  cross join (
    values
      ('Patricia Gomez', 'Board Liaison', 'Hope Partners', 'External', 'High', 'High', 'Supportive', 'Weekly alignment call', 'Monthly board packet', 'patricia@hopepartners.org'),
      ('Jordan Lee', 'Finance Director', 'Demo Community Foundation', 'Internal', 'Medium', 'High', 'Neutral', 'Bi-weekly finance review', 'Provide dashboard snapshots', 'jordan.lee@example.org')
  ) as s(stakeholder_name, stakeholder_role_title, stakeholder_organization, stakeholder_type, influence_level, interest_level, support_level, engagement_strategy, communication_needs, contact_info)
  returning id, organization_id, project_id
),
task_ref as (
  select t.id, t.organization_id
  from public.tasks t
  join project_ref pr on pr.id = t.project_id
  where t.parent_task_id is null
  order by t.created_at asc
  limit 1
),
task_comment_seed as (
  insert into public.task_comments (organization_id, task_id, author_user_id, comment_body)
  select
    tr.organization_id,
    tr.id,
    ps.user_id,
    'Initial project kickoff comment. @IJRebout please review donor outreach sequence.'
  from task_ref tr
  join project_staff_seed ps on ps.project_id in (select id from project_ref)
  limit 1
  returning id, organization_id, task_id
)
insert into public.notifications (
  organization_id,
  recipient_user_id,
  title,
  body,
  status,
  visibility_classification,
  created_by,
  notification_type,
  related_entity_type,
  related_entity_id,
  action_url
)
select
  ps.organization_id,
  ps.user_id,
  'project_assignment',
  'You were added to project Spring Donor Renewal.',
  'unread',
  'staff_public',
  null,
  'project_assignment',
  'project',
  ps.project_id,
  concat('/staff/projects/', ps.project_id::text)
from project_staff_seed ps
on conflict do nothing;

with org as (
  select id as organization_id
  from public.organizations
  where slug = 'demo-community-foundation'
),
contacts as (
  select c.id, c.organization_id
  from public.contacts c
  join org on org.organization_id = c.organization_id
),
membership_type as (
  select mt.id, mt.organization_id
  from public.membership_types mt
  join org on org.organization_id = mt.organization_id
  where mt.key = 'individual'
  limit 1
)
insert into public.memberships (
  organization_id,
  contact_id,
  membership_type_id,
  status,
  level,
  start_date,
  end_date,
  renewal_date
)
select
  c.organization_id,
  c.id,
  mt.id,
  'active',
  'Standard',
  current_date - interval '30 days',
  current_date + interval '335 days',
  current_date + interval '335 days'
from contacts c
join membership_type mt on mt.organization_id = c.organization_id
on conflict do nothing;
