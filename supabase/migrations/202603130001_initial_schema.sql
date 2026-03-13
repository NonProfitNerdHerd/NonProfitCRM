create extension if not exists pgcrypto;

create schema if not exists app;

create type public.visibility_classification as enum (
  'staff_public',
  'staff_restricted',
  'pii_protected',
  'portal_visible',
  'internal_only'
);

create type public.contact_relationship_type as enum (
  'spouse',
  'partner',
  'child',
  'parent',
  'emergency_contact',
  'household_member',
  'other'
);

create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'completed', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.membership_status as enum ('active', 'inactive', 'lapsed', 'cancelled');
create type public.donation_status as enum ('pending', 'posted', 'refunded', 'failed');
create type public.import_status as enum (
  'uploaded',
  'mapped',
  'validated',
  'processing',
  'completed',
  'failed'
);
create type public.notification_status as enum ('unread', 'read', 'archived');
create type public.communication_channel as enum ('email', 'sms', 'letter', 'internal_notification');
create type public.report_export_format as enum ('csv', 'excel');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  default_organization_id uuid references public.organizations(id),
  is_portal_user boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.role_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  is_system_template boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, key)
);

create unique index role_templates_global_key_uniq
  on public.role_templates (key)
  where organization_id is null;

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.role_template_permissions (
  id uuid primary key default gen_random_uuid(),
  role_template_id uuid not null references public.role_templates(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (role_template_id, permission_id)
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_template_id uuid not null references public.role_templates(id),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  household_name text not null,
  primary_contact_id uuid,
  shared_address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_platform text not null,
  source_type text not null default 'csv',
  target_domain text not null,
  original_file_name text not null,
  status public.import_status not null default 'uploaded',
  source_metadata jsonb not null default '{}'::jsonb,
  duplicate_strategy text,
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  successful_rows integer not null default 0,
  failed_rows integer not null default 0,
  error_summary text,
  created_by uuid references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  portal_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  email text,
  phone text,
  alternate_phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  country text,
  birthdate date,
  organization_name text,
  donor_status text not null default 'prospect',
  member_status text not null default 'none',
  communication_preferences jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  external_source text,
  external_source_id text,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, portal_user_id),
  unique (organization_id, external_source, external_source_id)
);

alter table public.households
  add constraint households_primary_contact_fk
  foreign key (primary_contact_id) references public.contacts(id) on delete set null;

create table public.contact_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  related_contact_id uuid not null references public.contacts(id) on delete cascade,
  relationship_type public.contact_relationship_type not null,
  relationship_label text,
  start_date date,
  end_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, contact_id, related_contact_id, relationship_type)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  entity_type text,
  entity_id uuid,
  note_type text not null default 'general',
  body text not null,
  contains_pii boolean not null default false,
  visibility_classification public.visibility_classification not null default 'staff_public',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  donation_id uuid,
  membership_id uuid,
  title text not null,
  description text,
  due_date date,
  assigned_to uuid references auth.users(id),
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  completed_at timestamptz,
  contains_pii boolean not null default false,
  visibility_classification public.visibility_classification not null default 'staff_public',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  donation_date date not null,
  status public.donation_status not null default 'posted',
  payment_method text,
  source text,
  source_platform text,
  external_transaction_id text,
  fund text,
  campaign text,
  appeal text,
  receipt_number text,
  is_recurring boolean not null default false,
  recurring_schedule jsonb,
  notes text,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  imported_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, source_platform, external_transaction_id)
);

create table public.membership_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  default_duration_months integer,
  benefits jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, key)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  membership_type_id uuid references public.membership_types(id) on delete set null,
  status public.membership_status not null default 'active',
  level text,
  start_date date not null,
  end_date date,
  renewal_date date,
  source_donation_id uuid references public.donations(id) on delete set null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.tasks
  add constraint tasks_donation_fk
  foreign key (donation_id) references public.donations(id) on delete set null;

alter table public.tasks
  add constraint tasks_membership_fk
  foreign key (membership_id) references public.memberships(id) on delete set null;

create table public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  source_field text not null,
  target_field text not null,
  transform_rule text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (import_job_id, source_field, target_field)
);

create table public.communication_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  channel public.communication_channel not null,
  subject text,
  summary text,
  body text,
  contains_pii boolean not null default false,
  visibility_classification public.visibility_classification not null default 'staff_public',
  sent_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  status public.notification_status not null default 'unread',
  contains_pii boolean not null default false,
  visibility_classification public.visibility_classification not null default 'portal_visible',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.report_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  domain_key text not null,
  field_key text not null,
  label text not null,
  description text,
  data_type text not null,
  source_table text not null,
  source_column text,
  source_expression text,
  is_default_visible boolean not null default true,
  is_filterable boolean not null default true,
  is_sortable boolean not null default true,
  is_exportable boolean not null default true,
  is_pii boolean not null default false,
  visibility_classification public.visibility_classification,
  required_permission_key text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, domain_key, field_key)
);

create unique index report_fields_global_key_uniq
  on public.report_fields (domain_key, field_key)
  where organization_id is null;

create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  domain_key text not null,
  selected_fields jsonb not null default '[]'::jsonb,
  filters jsonb not null default '[]'::jsonb,
  sort_config jsonb not null default '{}'::jsonb,
  visibility_scope text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  saved_report_id uuid references public.saved_reports(id) on delete set null,
  domain_key text not null,
  executed_by uuid not null references auth.users(id),
  export_format public.report_export_format,
  row_count integer not null default 0,
  included_pii boolean not null default false,
  execution_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  target_entity_type text not null,
  target_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_memberships_org_contact on public.organization_memberships (organization_id, user_id) where is_active = true;
create index idx_contacts_org_name on public.contacts (organization_id, last_name, first_name);
create index idx_contacts_org_external on public.contacts (organization_id, external_source, external_source_id);
create index idx_contacts_org_portal on public.contacts (organization_id, portal_user_id);
create index idx_households_org on public.households (organization_id);
create index idx_relationships_org_contact on public.contact_relationships (organization_id, contact_id);
create index idx_notes_org_contact on public.notes (organization_id, contact_id, created_at desc);
create index idx_tasks_org_due on public.tasks (organization_id, due_date, status);
create index idx_donations_org_date on public.donations (organization_id, donation_date desc);
create index idx_donations_org_contact on public.donations (organization_id, contact_id);
create index idx_donations_org_external on public.donations (organization_id, source_platform, external_transaction_id);
create index idx_memberships_org_status on public.memberships (organization_id, status, renewal_date);
create index idx_import_jobs_org_status on public.import_jobs (organization_id, status, created_at desc);
create index idx_comms_org_contact on public.communication_log (organization_id, contact_id, sent_at desc);
create index idx_notifications_org_recipient on public.notifications (organization_id, recipient_user_id, created_at desc);
create index idx_saved_reports_org_domain on public.saved_reports (organization_id, domain_key);
create index idx_report_runs_org_created on public.report_runs (organization_id, created_at desc);
create index idx_audit_log_org_created on public.audit_log (organization_id, created_at desc);

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger trg_org_updated_at before update on public.organizations for each row execute function app.set_updated_at();
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function app.set_updated_at();
create trigger trg_role_templates_updated_at before update on public.role_templates for each row execute function app.set_updated_at();
create trigger trg_memberships_updated_at before update on public.organization_memberships for each row execute function app.set_updated_at();
create trigger trg_households_updated_at before update on public.households for each row execute function app.set_updated_at();
create trigger trg_contacts_updated_at before update on public.contacts for each row execute function app.set_updated_at();
create trigger trg_relationships_updated_at before update on public.contact_relationships for each row execute function app.set_updated_at();
create trigger trg_notes_updated_at before update on public.notes for each row execute function app.set_updated_at();
create trigger trg_tasks_updated_at before update on public.tasks for each row execute function app.set_updated_at();
create trigger trg_donations_updated_at before update on public.donations for each row execute function app.set_updated_at();
create trigger trg_membership_types_updated_at before update on public.membership_types for each row execute function app.set_updated_at();
create trigger trg_membership_records_updated_at before update on public.memberships for each row execute function app.set_updated_at();
create trigger trg_import_jobs_updated_at before update on public.import_jobs for each row execute function app.set_updated_at();
create trigger trg_notifications_updated_at before update on public.notifications for each row execute function app.set_updated_at();
create trigger trg_report_fields_updated_at before update on public.report_fields for each row execute function app.set_updated_at();
create trigger trg_saved_reports_updated_at before update on public.saved_reports for each row execute function app.set_updated_at();

create or replace function app.has_active_membership(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.is_active = true
  );
$$;

create or replace function app.has_permission(org_id uuid, permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    join public.role_templates rt on rt.id = om.role_template_id
    join public.role_template_permissions rtp on rtp.role_template_id = rt.id
    join public.permissions p on p.id = rtp.permission_id
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and p.key = permission_key
  );
$$;

create or replace function public.has_permission(org_id uuid, permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.has_permission(org_id, permission_key);
$$;

create or replace function public.user_permissions(org_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.key), '{}'::text[])
  from public.organization_memberships om
  join public.role_templates rt on rt.id = om.role_template_id
  join public.role_template_permissions rtp on rtp.role_template_id = rt.id
  join public.permissions p on p.id = rtp.permission_id
  where om.organization_id = org_id
    and om.user_id = auth.uid()
    and om.is_active = true;
$$;

create or replace function app.current_contact_id(org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.contacts c
  where c.organization_id = org_id
    and c.portal_user_id = auth.uid()
  limit 1;
$$;

create or replace view public.contacts_safe_view
with (security_invoker = true)
as
select
  c.id,
  c.organization_id,
  c.household_id,
  c.portal_user_id,
  c.first_name,
  c.last_name,
  c.preferred_name,
  case
    when app.has_permission(c.organization_id, 'can_view_pii') or c.portal_user_id = auth.uid()
      then c.email
    else null
  end as email,
  case
    when app.has_permission(c.organization_id, 'can_view_pii') or c.portal_user_id = auth.uid()
      then c.phone
    else null
  end as phone,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.alternate_phone
    else null
  end as alternate_phone,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.address_line_1
    else null
  end as address_line_1,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.address_line_2
    else null
  end as address_line_2,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.city
    else null
  end as city,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.state
    else null
  end as state,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.postal_code
    else null
  end as postal_code,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.country
    else null
  end as country,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.birthdate
    else null
  end as birthdate,
  c.organization_name,
  c.donor_status,
  c.member_status,
  c.communication_preferences,
  c.tags,
  c.external_source,
  c.external_source_id,
  c.import_job_id,
  c.created_by,
  c.updated_by,
  c.created_at,
  c.updated_at
from public.contacts c;

create or replace view public.notes_safe_view
with (security_invoker = true)
as
select
  n.id,
  n.organization_id,
  n.contact_id,
  n.entity_type,
  n.entity_id,
  n.note_type,
  case
    when n.contains_pii and not app.has_permission(n.organization_id, 'can_view_pii')
      then '[REDACTED]'
    else n.body
  end as body,
  n.contains_pii,
  n.visibility_classification,
  n.created_by,
  n.created_at,
  n.updated_at
from public.notes n;

create or replace view public.tasks_safe_view
with (security_invoker = true)
as
select
  t.id,
  t.organization_id,
  t.contact_id,
  t.donation_id,
  t.membership_id,
  t.title,
  case
    when t.contains_pii and not app.has_permission(t.organization_id, 'can_view_pii')
      then '[REDACTED]'
    else t.description
  end as description,
  t.due_date,
  t.assigned_to,
  t.status,
  t.priority,
  t.completed_at,
  t.contains_pii,
  t.visibility_classification,
  t.created_by,
  t.created_at,
  t.updated_at
from public.tasks t;
