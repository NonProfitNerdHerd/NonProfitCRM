create or replace function app.can_access_volunteer_coordination(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app.has_permission(org_id, 'can_view_volunteer_coordination')
    or app.has_permission(org_id, 'can_manage_volunteer_coordination');
$$;

create or replace function app.can_manage_volunteer_coordination(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.has_permission(org_id, 'can_manage_volunteer_coordination');
$$;

create or replace function app.can_view_volunteer_sensitive(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app.has_permission(org_id, 'can_view_volunteer_sensitive')
    or app.has_permission(org_id, 'can_manage_volunteer_sensitive');
$$;

create or replace function app.can_manage_volunteer_sensitive(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.has_permission(org_id, 'can_manage_volunteer_sensitive');
$$;

create or replace function public.can_access_volunteer_coordination(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.can_access_volunteer_coordination(org_id);
$$;

insert into public.permissions (key, name, description, category)
values
  (
    'can_view_volunteer_coordination',
    'View Volunteer Coordination',
    'View volunteer profiles, events, assignments, and reporting data.',
    'volunteer'
  ),
  (
    'can_manage_volunteer_coordination',
    'Manage Volunteer Coordination',
    'Create and manage volunteer profiles, events, roles, assignments, and hours.',
    'volunteer'
  ),
  (
    'can_view_volunteer_sensitive',
    'View Volunteer Sensitive Records',
    'View sensitive volunteer concerns, incidents, compliance, and minor/guardian controls.',
    'volunteer'
  ),
  (
    'can_manage_volunteer_sensitive',
    'Manage Volunteer Sensitive Records',
    'Create and manage sensitive volunteer concerns, incidents, and compliance controls.',
    'volunteer'
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

with role_permission_map as (
  select role_key, permission_key
  from (
    values
      ('administrator', 'can_view_volunteer_coordination'),
      ('administrator', 'can_manage_volunteer_coordination'),
      ('administrator', 'can_view_volunteer_sensitive'),
      ('administrator', 'can_manage_volunteer_sensitive'),
      ('data_administrator', 'can_view_volunteer_coordination'),
      ('data_administrator', 'can_manage_volunteer_coordination'),
      ('data_administrator', 'can_view_volunteer_sensitive'),
      ('data_administrator', 'can_manage_volunteer_sensitive'),
      ('data_steward', 'can_view_volunteer_coordination'),
      ('data_steward', 'can_manage_volunteer_coordination'),
      ('data_steward', 'can_view_volunteer_sensitive'),
      ('data_steward', 'can_manage_volunteer_sensitive'),
      ('executive_staff', 'can_view_volunteer_coordination'),
      ('executive_staff', 'can_manage_volunteer_coordination'),
      ('staff_pii', 'can_view_volunteer_coordination'),
      ('staff_pii', 'can_manage_volunteer_coordination'),
      ('staff_pii', 'can_view_volunteer_sensitive'),
      ('staff_non_pii', 'can_view_volunteer_coordination'),
      ('staff_non_pii', 'can_manage_volunteer_coordination'),
      ('data_entry', 'can_view_volunteer_coordination')
  ) as t(role_key, permission_key)
),
resolved as (
  select rt.id as role_template_id, p.id as permission_id
  from role_permission_map rpm
  join public.role_templates rt
    on rt.organization_id is null
   and rt.key = rpm.role_key
  join public.permissions p
    on p.key = rpm.permission_key
)
insert into public.role_template_permissions (role_template_id, permission_id)
select role_template_id, permission_id
from resolved
on conflict (role_template_id, permission_id) do nothing;

create table if not exists public.volunteer_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  volunteer_status text not null default 'prospective',
  volunteer_type text not null default 'individual',
  availability_preferences jsonb not null default '{}'::jsonb,
  interests text[] not null default '{}'::text[],
  skills text[] not null default '{}'::text[],
  certifications text[] not null default '{}'::text[],
  accommodations text,
  physical_limitations text,
  transportation_eligible boolean not null default false,
  driver_eligible boolean not null default false,
  license_verified boolean not null default false,
  license_expiration_date date,
  insurance_verified boolean not null default false,
  insurance_expiration_date date,
  vehicle_capacity_note text,
  emergency_contact_name text,
  emergency_contact_phone text,
  internal_notes text,
  internal_concerns text,
  reliability_score numeric(5, 2) not null default 100,
  reliability_indicator text not null default 'high',
  burnout_flag boolean not null default false,
  caution_flag boolean not null default false,
  soft_blacklist_flag boolean not null default false,
  do_not_schedule_until date,
  last_activity_at timestamptz,
  lifetime_hours numeric(12, 2) not null default 0,
  ytd_hours numeric(12, 2) not null default 0,
  guardian_consent_status text not null default 'not_required',
  waiver_signed boolean not null default false,
  minor_requires_guardian_present boolean not null default false,
  background_check_status text not null default 'pending',
  background_check_expires_at date,
  orientation_completed_at date,
  confidentiality_acknowledged_at date,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, contact_id),
  constraint volunteer_profiles_status_check
    check (volunteer_status in ('active', 'inactive', 'prospective', 'do_not_schedule', 'soft_blacklisted', 'archived')),
  constraint volunteer_profiles_type_check
    check (volunteer_type in ('individual', 'minor', 'family_member_volunteer', 'group_volunteer_participant', 'team_leader')),
  constraint volunteer_profiles_reliability_indicator_check
    check (reliability_indicator in ('high', 'medium', 'low')),
  constraint volunteer_profiles_guardian_status_check
    check (guardian_consent_status in ('not_required', 'pending', 'approved', 'denied', 'expired')),
  constraint volunteer_profiles_background_status_check
    check (background_check_status in ('pending', 'clear', 'failed', 'expired', 'not_required'))
);

create table if not exists public.volunteer_profile_guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  volunteer_profile_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  guardian_contact_id uuid not null references public.contacts(id) on delete cascade,
  relationship_type text not null default 'guardian',
  consent_status text not null default 'pending',
  waiver_signed boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (volunteer_profile_id, guardian_contact_id),
  constraint volunteer_profile_guardians_consent_status_check
    check (consent_status in ('pending', 'approved', 'denied', 'expired'))
);

create table if not exists public.volunteer_families (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  family_name text not null,
  must_serve_together boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.volunteer_family_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  family_id uuid not null references public.volunteer_families(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role_in_family text,
  is_primary_contact boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (family_id, contact_id)
);

create table if not exists public.volunteer_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_name text not null,
  group_type text not null default 'community',
  group_status text not null default 'active',
  coordinator_contact_id uuid references public.contacts(id) on delete set null,
  estimated_attendance integer not null default 0,
  confirmed_attendance integer not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_groups_status_check check (group_status in ('active', 'inactive', 'archived'))
);

create table if not exists public.volunteer_group_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.volunteer_groups(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  display_name text,
  is_placeholder boolean not null default false,
  participation_status text not null default 'estimated',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_group_members_status_check
    check (participation_status in ('estimated', 'confirmed', 'attended', 'cancelled'))
);

create table if not exists public.volunteer_event_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  series_name text not null,
  recurrence_pattern text not null default 'weekly',
  recurrence_interval integer not null default 1,
  recurrence_days_of_week integer[] not null default '{}'::integer[],
  recurrence_day_of_month integer,
  starts_on date not null default current_date,
  ends_on date,
  ends_after_occurrences integer,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_event_series_pattern_check
    check (recurrence_pattern in ('daily', 'weekly', 'biweekly', 'monthly', 'custom'))
);

create table if not exists public.volunteer_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  series_id uuid references public.volunteer_event_series(id) on delete set null,
  event_name text not null,
  event_type text,
  program_department text,
  event_status text not null default 'draft',
  event_description text,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  location text,
  coordinator_user_id uuid references auth.users(id) on delete set null,
  visibility text not null default 'internal',
  capacity_total integer not null default 0,
  capacity_filled integer not null default 0,
  notes text,
  attachment_urls text[] not null default '{}'::text[],
  meal_options text[] not null default '{}'::text[],
  tshirt_options text[] not null default '{}'::text[],
  family_friendly boolean not null default false,
  group_allowed boolean not null default false,
  minor_allowed boolean not null default false,
  is_series_override boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_events_status_check check (event_status in ('draft', 'recruiting', 'full', 'completed', 'cancelled')),
  constraint volunteer_events_visibility_check check (visibility in ('public', 'private', 'internal')),
  constraint volunteer_events_time_check check (end_time > start_time)
);

create table if not exists public.volunteer_event_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.volunteer_events(id) on delete cascade,
  parent_role_id uuid references public.volunteer_event_roles(id) on delete set null,
  role_name text not null,
  role_description text,
  shift_start time,
  shift_end time,
  number_needed integer not null default 1,
  number_filled integer not null default 0,
  waitlist_enabled boolean not null default true,
  substitute_enabled boolean not null default true,
  is_lead_role boolean not null default false,
  required_skills text[] not null default '{}'::text[],
  required_tags text[] not null default '{}'::text[],
  required_certifications text[] not null default '{}'::text[],
  required_training text[] not null default '{}'::text[],
  background_check_required boolean not null default false,
  driver_eligibility_required boolean not null default false,
  minor_allowed boolean not null default true,
  family_member_allowed boolean not null default true,
  group_participant_allowed boolean not null default true,
  physical_requirements text,
  meal_eligible boolean not null default false,
  tshirt_eligible boolean not null default false,
  check_in_location text,
  supervisor_contact_id uuid references public.contacts(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_event_roles_time_check
    check (shift_end is null or shift_start is null or shift_end > shift_start)
);

create table if not exists public.volunteer_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  volunteer_profile_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  event_id uuid not null references public.volunteer_events(id) on delete cascade,
  role_id uuid references public.volunteer_event_roles(id) on delete set null,
  family_id uuid references public.volunteer_families(id) on delete set null,
  group_id uuid references public.volunteer_groups(id) on delete set null,
  assignment_status text not null default 'invited',
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc', now()),
  scheduled_hours numeric(8, 2),
  actual_hours numeric(8, 2),
  check_in_at timestamptz,
  check_out_at timestamptz,
  approval_status text not null default 'pending',
  is_late_arrival boolean not null default false,
  is_early_departure boolean not null default false,
  late_cancelled boolean not null default false,
  notes text,
  no_show_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_assignments_status_check
    check (assignment_status in ('invited', 'interested', 'pending_approval', 'confirmed', 'waitlisted', 'substitute', 'cancelled', 'declined', 'no_show', 'completed')),
  constraint volunteer_assignments_approval_check
    check (approval_status in ('pending', 'approved', 'rejected'))
);

create table if not exists public.volunteer_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.volunteer_events(id) on delete cascade,
  role_id uuid not null references public.volunteer_event_roles(id) on delete cascade,
  volunteer_profile_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  waitlist_order integer not null default 1,
  entry_status text not null default 'waiting',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, role_id, volunteer_profile_id),
  constraint volunteer_waitlist_entries_status_check
    check (entry_status in ('waiting', 'promoted', 'removed'))
);

create table if not exists public.volunteer_substitute_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.volunteer_events(id) on delete cascade,
  role_id uuid references public.volunteer_event_roles(id) on delete set null,
  volunteer_profile_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  availability_status text not null default 'available',
  priority_order integer not null default 1,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, role_id, volunteer_profile_id),
  constraint volunteer_substitute_entries_status_check
    check (availability_status in ('available', 'unavailable', 'assigned'))
);

create table if not exists public.volunteer_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  volunteer_profile_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  event_id uuid references public.volunteer_events(id) on delete set null,
  role_id uuid references public.volunteer_event_roles(id) on delete set null,
  assignment_id uuid references public.volunteer_assignments(id) on delete set null,
  service_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  scheduled_hours numeric(8, 2),
  actual_hours numeric(8, 2) not null default 0,
  attendance_status text not null default 'completed',
  source text not null default 'manual',
  import_row_id uuid,
  notes text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_hours_attendance_status_check
    check (attendance_status in ('completed', 'no_show', 'late', 'early_departure', 'cancelled'))
);

create table if not exists public.volunteer_hour_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.volunteer_events(id) on delete cascade,
  import_status text not null default 'staged',
  source_filename text not null,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default timezone('utc', now()),
  rows_staged integer not null default 0,
  rows_committed integer not null default 0,
  rows_skipped integer not null default 0,
  rows_error integer not null default 0,
  mapping_configuration jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_hour_imports_status_check
    check (import_status in ('staged', 'committed', 'cancelled'))
);

create table if not exists public.volunteer_hour_import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_id uuid not null references public.volunteer_hour_imports(id) on delete cascade,
  row_index integer not null,
  raw_row jsonb not null default '{}'::jsonb,
  matched_contact_id uuid references public.contacts(id) on delete set null,
  matched_volunteer_profile_id uuid references public.volunteer_profiles(id) on delete set null,
  matched_assignment_id uuid references public.volunteer_assignments(id) on delete set null,
  role_name text,
  service_date date,
  check_in_at timestamptz,
  check_out_at timestamptz,
  hours numeric(8, 2),
  attendance_status text,
  notes text,
  stage_status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_hour_import_rows_stage_status_check
    check (stage_status in ('pending', 'matched', 'unmatched', 'error', 'skipped', 'committed'))
);

create table if not exists public.volunteer_compliance_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  volunteer_profile_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  compliance_type text not null,
  compliance_status text not null default 'pending',
  completed_at date,
  expires_at date,
  verified_by uuid references auth.users(id) on delete set null,
  required_for_roles text[] not null default '{}'::text[],
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_compliance_items_status_check
    check (compliance_status in ('pending', 'completed', 'expired', 'exempt', 'rejected'))
);

create table if not exists public.volunteer_concerns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  volunteer_profile_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  concern_category text not null,
  concern_type text not null,
  severity text not null default 'medium',
  concern_date date not null default current_date,
  review_status text not null default 'open',
  action_level text not null default 'caution_only',
  role_restrictions text[] not null default '{}'::text[],
  event_restrictions text[] not null default '{}'::text[],
  notes text,
  internal_review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_concerns_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint volunteer_concerns_review_status_check
    check (review_status in ('open', 'under_review', 'resolved', 'archived')),
  constraint volunteer_concerns_action_level_check
    check (action_level in ('caution_only', 'role_restricted', 'event_restricted', 'temporarily_do_not_schedule', 'soft_blacklisted'))
);

create table if not exists public.volunteer_burnout_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  volunteer_profile_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  flag_type text not null default 'manual',
  status text not null default 'active',
  pause_days integer,
  pause_until date,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_burnout_flags_type_check check (flag_type in ('manual', 'automatic')),
  constraint volunteer_burnout_flags_status_check check (status in ('active', 'paused', 'resolved'))
);

create table if not exists public.volunteer_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.volunteer_events(id) on delete set null,
  role_id uuid references public.volunteer_event_roles(id) on delete set null,
  assignment_id uuid references public.volunteer_assignments(id) on delete set null,
  incident_at timestamptz not null default timezone('utc', now()),
  incident_category text not null,
  severity text not null default 'medium',
  description text not null,
  witnesses text,
  action_taken text,
  follow_up_required boolean not null default false,
  follow_up_notes text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  internal_only boolean not null default true,
  attachment_urls text[] not null default '{}'::text[],
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_incidents_severity_check
    check (severity in ('low', 'medium', 'high', 'critical'))
);

create table if not exists public.volunteer_incident_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references public.volunteer_incidents(id) on delete cascade,
  volunteer_profile_id uuid references public.volunteer_profiles(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  involvement_type text not null default 'subject',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_incident_people_involvement_type_check
    check (involvement_type in ('subject', 'witness', 'reporter', 'other'))
);

create index if not exists idx_volunteer_profiles_org_status
  on public.volunteer_profiles (organization_id, volunteer_status, volunteer_type);
create index if not exists idx_volunteer_profiles_contact
  on public.volunteer_profiles (organization_id, contact_id);
create index if not exists idx_volunteer_profiles_flags
  on public.volunteer_profiles (organization_id, burnout_flag, caution_flag, soft_blacklist_flag);
create index if not exists idx_volunteer_profile_guardians_profile
  on public.volunteer_profile_guardians (organization_id, volunteer_profile_id);
create index if not exists idx_volunteer_families_org
  on public.volunteer_families (organization_id, family_name);
create index if not exists idx_volunteer_family_members_family
  on public.volunteer_family_members (organization_id, family_id, contact_id);
create index if not exists idx_volunteer_groups_org
  on public.volunteer_groups (organization_id, group_status, group_name);
create index if not exists idx_volunteer_group_members_group
  on public.volunteer_group_members (organization_id, group_id);
create index if not exists idx_volunteer_event_series_org
  on public.volunteer_event_series (organization_id, is_active, starts_on);
create index if not exists idx_volunteer_events_org_date
  on public.volunteer_events (organization_id, event_date, event_status);
create index if not exists idx_volunteer_events_series
  on public.volunteer_events (organization_id, series_id, event_date);
create index if not exists idx_volunteer_event_roles_event
  on public.volunteer_event_roles (organization_id, event_id);
create index if not exists idx_volunteer_assignments_event_status
  on public.volunteer_assignments (organization_id, event_id, assignment_status);
create index if not exists idx_volunteer_assignments_volunteer
  on public.volunteer_assignments (organization_id, volunteer_profile_id, assignment_status);
create index if not exists idx_volunteer_waitlist_event_role
  on public.volunteer_waitlist_entries (organization_id, event_id, role_id, waitlist_order);
create index if not exists idx_volunteer_substitute_event_role
  on public.volunteer_substitute_entries (organization_id, event_id, role_id, priority_order);
create index if not exists idx_volunteer_hours_profile_date
  on public.volunteer_hours (organization_id, volunteer_profile_id, service_date desc);
create index if not exists idx_volunteer_hours_event
  on public.volunteer_hours (organization_id, event_id, service_date desc);
create index if not exists idx_volunteer_hour_imports_event
  on public.volunteer_hour_imports (organization_id, event_id, import_status, imported_at desc);
create index if not exists idx_volunteer_hour_import_rows_import
  on public.volunteer_hour_import_rows (organization_id, import_id, stage_status, row_index);
create index if not exists idx_volunteer_compliance_items_profile
  on public.volunteer_compliance_items (organization_id, volunteer_profile_id, compliance_status, expires_at);
create index if not exists idx_volunteer_concerns_profile
  on public.volunteer_concerns (organization_id, volunteer_profile_id, review_status, severity, concern_date desc);
create index if not exists idx_volunteer_burnout_flags_profile
  on public.volunteer_burnout_flags (organization_id, volunteer_profile_id, status, pause_until);
create index if not exists idx_volunteer_incidents_event
  on public.volunteer_incidents (organization_id, event_id, incident_at desc);
create index if not exists idx_volunteer_incidents_category
  on public.volunteer_incidents (organization_id, incident_category, severity, resolved);
create index if not exists idx_volunteer_incident_people_incident
  on public.volunteer_incident_people (organization_id, incident_id);

create or replace function app.refresh_volunteer_profile_hours(
  p_organization_id uuid,
  p_volunteer_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lifetime numeric(12, 2);
  v_ytd numeric(12, 2);
  v_last_activity timestamptz;
begin
  select
    coalesce(sum(case when attendance_status = 'completed' then actual_hours else 0 end), 0),
    coalesce(
      sum(
        case
          when attendance_status = 'completed'
            and service_date >= date_trunc('year', timezone('utc', now()))::date
          then actual_hours
          else 0
        end
      ),
      0
    ),
    max(coalesce(check_out_at, check_in_at, service_date::timestamptz))
  into
    v_lifetime,
    v_ytd,
    v_last_activity
  from public.volunteer_hours
  where organization_id = p_organization_id
    and volunteer_profile_id = p_volunteer_profile_id;

  update public.volunteer_profiles
  set
    lifetime_hours = coalesce(v_lifetime, 0),
    ytd_hours = coalesce(v_ytd, 0),
    last_activity_at = v_last_activity,
    updated_at = timezone('utc', now())
  where organization_id = p_organization_id
    and id = p_volunteer_profile_id;
end;
$$;

create or replace function app.refresh_volunteer_profile_reliability(
  p_organization_id uuid,
  p_volunteer_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no_show_count integer;
  v_late_cancel_count integer;
  v_score numeric(5, 2);
  v_indicator text;
begin
  select
    count(*) filter (where assignment_status = 'no_show'),
    count(*) filter (where assignment_status = 'cancelled' and late_cancelled = true)
  into
    v_no_show_count,
    v_late_cancel_count
  from public.volunteer_assignments
  where organization_id = p_organization_id
    and volunteer_profile_id = p_volunteer_profile_id;

  v_score := greatest(0, 100 - (coalesce(v_no_show_count, 0) * 15) - (coalesce(v_late_cancel_count, 0) * 8));
  v_indicator := case
    when v_score >= 80 then 'high'
    when v_score >= 55 then 'medium'
    else 'low'
  end;

  update public.volunteer_profiles
  set
    reliability_score = v_score,
    reliability_indicator = v_indicator,
    updated_at = timezone('utc', now())
  where organization_id = p_organization_id
    and id = p_volunteer_profile_id;
end;
$$;

create or replace function app.trg_refresh_volunteer_profile_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_profile_id uuid;
begin
  v_org_id := coalesce(new.organization_id, old.organization_id);
  v_profile_id := coalesce(new.volunteer_profile_id, old.volunteer_profile_id);

  if v_org_id is not null and v_profile_id is not null then
    perform app.refresh_volunteer_profile_hours(v_org_id, v_profile_id);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function app.trg_refresh_volunteer_profile_reliability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_profile_id uuid;
begin
  v_org_id := coalesce(new.organization_id, old.organization_id);
  v_profile_id := coalesce(new.volunteer_profile_id, old.volunteer_profile_id);

  if v_org_id is not null and v_profile_id is not null then
    perform app.refresh_volunteer_profile_reliability(v_org_id, v_profile_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_volunteer_profiles_updated_at on public.volunteer_profiles;
create trigger trg_volunteer_profiles_updated_at
before update on public.volunteer_profiles
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_profile_guardians_updated_at on public.volunteer_profile_guardians;
create trigger trg_volunteer_profile_guardians_updated_at
before update on public.volunteer_profile_guardians
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_families_updated_at on public.volunteer_families;
create trigger trg_volunteer_families_updated_at
before update on public.volunteer_families
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_family_members_updated_at on public.volunteer_family_members;
create trigger trg_volunteer_family_members_updated_at
before update on public.volunteer_family_members
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_groups_updated_at on public.volunteer_groups;
create trigger trg_volunteer_groups_updated_at
before update on public.volunteer_groups
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_group_members_updated_at on public.volunteer_group_members;
create trigger trg_volunteer_group_members_updated_at
before update on public.volunteer_group_members
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_event_series_updated_at on public.volunteer_event_series;
create trigger trg_volunteer_event_series_updated_at
before update on public.volunteer_event_series
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_events_updated_at on public.volunteer_events;
create trigger trg_volunteer_events_updated_at
before update on public.volunteer_events
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_event_roles_updated_at on public.volunteer_event_roles;
create trigger trg_volunteer_event_roles_updated_at
before update on public.volunteer_event_roles
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_assignments_updated_at on public.volunteer_assignments;
create trigger trg_volunteer_assignments_updated_at
before update on public.volunteer_assignments
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_waitlist_entries_updated_at on public.volunteer_waitlist_entries;
create trigger trg_volunteer_waitlist_entries_updated_at
before update on public.volunteer_waitlist_entries
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_substitute_entries_updated_at on public.volunteer_substitute_entries;
create trigger trg_volunteer_substitute_entries_updated_at
before update on public.volunteer_substitute_entries
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_hours_updated_at on public.volunteer_hours;
create trigger trg_volunteer_hours_updated_at
before update on public.volunteer_hours
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_hour_imports_updated_at on public.volunteer_hour_imports;
create trigger trg_volunteer_hour_imports_updated_at
before update on public.volunteer_hour_imports
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_hour_import_rows_updated_at on public.volunteer_hour_import_rows;
create trigger trg_volunteer_hour_import_rows_updated_at
before update on public.volunteer_hour_import_rows
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_compliance_items_updated_at on public.volunteer_compliance_items;
create trigger trg_volunteer_compliance_items_updated_at
before update on public.volunteer_compliance_items
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_concerns_updated_at on public.volunteer_concerns;
create trigger trg_volunteer_concerns_updated_at
before update on public.volunteer_concerns
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_burnout_flags_updated_at on public.volunteer_burnout_flags;
create trigger trg_volunteer_burnout_flags_updated_at
before update on public.volunteer_burnout_flags
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_incidents_updated_at on public.volunteer_incidents;
create trigger trg_volunteer_incidents_updated_at
before update on public.volunteer_incidents
for each row execute function app.set_updated_at();

drop trigger if exists trg_volunteer_hours_rollup on public.volunteer_hours;
create trigger trg_volunteer_hours_rollup
after insert or update or delete on public.volunteer_hours
for each row execute function app.trg_refresh_volunteer_profile_hours();

drop trigger if exists trg_volunteer_assignments_reliability on public.volunteer_assignments;
create trigger trg_volunteer_assignments_reliability
after insert or update or delete on public.volunteer_assignments
for each row execute function app.trg_refresh_volunteer_profile_reliability();

alter table public.volunteer_profiles enable row level security;
alter table public.volunteer_profile_guardians enable row level security;
alter table public.volunteer_families enable row level security;
alter table public.volunteer_family_members enable row level security;
alter table public.volunteer_groups enable row level security;
alter table public.volunteer_group_members enable row level security;
alter table public.volunteer_event_series enable row level security;
alter table public.volunteer_events enable row level security;
alter table public.volunteer_event_roles enable row level security;
alter table public.volunteer_assignments enable row level security;
alter table public.volunteer_waitlist_entries enable row level security;
alter table public.volunteer_substitute_entries enable row level security;
alter table public.volunteer_hours enable row level security;
alter table public.volunteer_hour_imports enable row level security;
alter table public.volunteer_hour_import_rows enable row level security;
alter table public.volunteer_compliance_items enable row level security;
alter table public.volunteer_concerns enable row level security;
alter table public.volunteer_burnout_flags enable row level security;
alter table public.volunteer_incidents enable row level security;
alter table public.volunteer_incident_people enable row level security;

create or replace function app.apply_volunteer_policy(
  table_name text,
  sensitive boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
  execute format('drop policy if exists %I_manage on public.%I', table_name, table_name);

  if sensitive then
    execute format(
      'create policy %I_select on public.%I for select using (app.has_active_membership(organization_id) and app.can_view_volunteer_sensitive(organization_id))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_manage on public.%I for all using (app.has_active_membership(organization_id) and app.can_manage_volunteer_sensitive(organization_id)) with check (app.has_active_membership(organization_id) and app.can_manage_volunteer_sensitive(organization_id))',
      table_name,
      table_name
    );
  else
    execute format(
      'create policy %I_select on public.%I for select using (app.has_active_membership(organization_id) and app.can_access_volunteer_coordination(organization_id))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_manage on public.%I for all using (app.has_active_membership(organization_id) and app.can_manage_volunteer_coordination(organization_id)) with check (app.has_active_membership(organization_id) and app.can_manage_volunteer_coordination(organization_id))',
      table_name,
      table_name
    );
  end if;
end;
$$;

select app.apply_volunteer_policy('volunteer_profiles', false);
select app.apply_volunteer_policy('volunteer_profile_guardians', true);
select app.apply_volunteer_policy('volunteer_families', false);
select app.apply_volunteer_policy('volunteer_family_members', false);
select app.apply_volunteer_policy('volunteer_groups', false);
select app.apply_volunteer_policy('volunteer_group_members', false);
select app.apply_volunteer_policy('volunteer_event_series', false);
select app.apply_volunteer_policy('volunteer_events', false);
select app.apply_volunteer_policy('volunteer_event_roles', false);
select app.apply_volunteer_policy('volunteer_assignments', false);
select app.apply_volunteer_policy('volunteer_waitlist_entries', false);
select app.apply_volunteer_policy('volunteer_substitute_entries', false);
select app.apply_volunteer_policy('volunteer_hours', false);
select app.apply_volunteer_policy('volunteer_hour_imports', false);
select app.apply_volunteer_policy('volunteer_hour_import_rows', false);
select app.apply_volunteer_policy('volunteer_compliance_items', true);
select app.apply_volunteer_policy('volunteer_concerns', true);
select app.apply_volunteer_policy('volunteer_burnout_flags', true);
select app.apply_volunteer_policy('volunteer_incidents', true);
select app.apply_volunteer_policy('volunteer_incident_people', true);

grant select, insert, update, delete on public.volunteer_profiles to authenticated;
grant select, insert, update, delete on public.volunteer_profile_guardians to authenticated;
grant select, insert, update, delete on public.volunteer_families to authenticated;
grant select, insert, update, delete on public.volunteer_family_members to authenticated;
grant select, insert, update, delete on public.volunteer_groups to authenticated;
grant select, insert, update, delete on public.volunteer_group_members to authenticated;
grant select, insert, update, delete on public.volunteer_event_series to authenticated;
grant select, insert, update, delete on public.volunteer_events to authenticated;
grant select, insert, update, delete on public.volunteer_event_roles to authenticated;
grant select, insert, update, delete on public.volunteer_assignments to authenticated;
grant select, insert, update, delete on public.volunteer_waitlist_entries to authenticated;
grant select, insert, update, delete on public.volunteer_substitute_entries to authenticated;
grant select, insert, update, delete on public.volunteer_hours to authenticated;
grant select, insert, update, delete on public.volunteer_hour_imports to authenticated;
grant select, insert, update, delete on public.volunteer_hour_import_rows to authenticated;
grant select, insert, update, delete on public.volunteer_compliance_items to authenticated;
grant select, insert, update, delete on public.volunteer_concerns to authenticated;
grant select, insert, update, delete on public.volunteer_burnout_flags to authenticated;
grant select, insert, update, delete on public.volunteer_incidents to authenticated;
grant select, insert, update, delete on public.volunteer_incident_people to authenticated;

grant execute on function app.can_access_volunteer_coordination(uuid) to authenticated;
grant execute on function app.can_manage_volunteer_coordination(uuid) to authenticated;
grant execute on function app.can_view_volunteer_sensitive(uuid) to authenticated;
grant execute on function app.can_manage_volunteer_sensitive(uuid) to authenticated;
grant execute on function public.can_access_volunteer_coordination(uuid) to authenticated;
