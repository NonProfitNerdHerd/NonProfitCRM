do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_admin_role') then
    create type public.platform_admin_role as enum (
      'super_admin',
      'build_team_admin',
      'support_admin',
      'billing_admin',
      'internal_auditor',
      'implementation_specialist'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tenant_status') then
    create type public.tenant_status as enum ('draft', 'active', 'suspended', 'archived');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tenant_onboarding_stage') then
    create type public.tenant_onboarding_stage as enum (
      'new',
      'discovery',
      'implementation',
      'data_migration',
      'training',
      'go_live',
      'active'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'restore_request_status') then
    create type public.restore_request_status as enum (
      'requested',
      'approved',
      'in_progress',
      'completed',
      'failed',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists public.tenant_backup_tiers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  backup_frequency text not null,
  retention_days integer not null check (retention_days >= 1),
  supports_point_in_time_restore boolean not null default false,
  supports_staging_restore boolean not null default true,
  supports_custom_restore_window boolean not null default false,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.tenant_backup_tiers (
  key,
  name,
  description,
  backup_frequency,
  retention_days,
  supports_point_in_time_restore,
  supports_staging_restore,
  supports_custom_restore_window,
  is_custom,
  is_active,
  configuration
)
values
  (
    'basic',
    'Basic',
    'Daily backup with 7-day retention',
    'daily',
    7,
    false,
    true,
    false,
    false,
    true,
    jsonb_build_object('snapshotIntervalHours', 24)
  ),
  (
    'standard',
    'Standard',
    'Daily backup with 30-day retention',
    'daily',
    30,
    false,
    true,
    false,
    false,
    true,
    jsonb_build_object('snapshotIntervalHours', 24)
  ),
  (
    'premium',
    'Premium',
    'Daily snapshots with point-in-time restore support',
    'daily_plus_pitr',
    90,
    true,
    true,
    true,
    false,
    true,
    jsonb_build_object('snapshotIntervalHours', 24, 'pitrWindowHours', 168)
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  backup_frequency = excluded.backup_frequency,
  retention_days = excluded.retention_days,
  supports_point_in_time_restore = excluded.supports_point_in_time_restore,
  supports_staging_restore = excluded.supports_staging_restore,
  supports_custom_restore_window = excluded.supports_custom_restore_window,
  is_active = excluded.is_active,
  configuration = excluded.configuration,
  updated_at = timezone('utc', now());

create table if not exists public.tenants (
  id uuid primary key references public.organizations(id) on delete cascade,
  organization_name text not null,
  slug text not null unique,
  status public.tenant_status not null default 'active',
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  billing_placeholder jsonb not null default '{}'::jsonb,
  plan_package text not null default 'standard',
  enabled_modules text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_activity_at timestamptz,
  internal_notes text,
  implementation_owner_user_id uuid references auth.users(id) on delete set null,
  onboarding_stage public.tenant_onboarding_stage not null default 'new',
  backup_tier_id uuid references public.tenant_backup_tiers(id) on delete set null,
  backup_frequency text,
  backup_retention_days integer,
  backup_metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_tenants_status on public.tenants (status, created_at desc);
create index if not exists idx_tenants_plan on public.tenants (plan_package, status);
create index if not exists idx_tenants_onboarding on public.tenants (onboarding_stage, status);

create table if not exists public.tenant_module_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_key text not null,
  is_enabled boolean not null default true,
  source text not null default 'plan',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, module_key)
);

create index if not exists idx_tenant_module_entitlements_tenant
  on public.tenant_module_entitlements (tenant_id, is_enabled, module_key);

create table if not exists public.tenant_backup_metadata (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  backup_tier_id uuid not null references public.tenant_backup_tiers(id) on delete restrict,
  backup_frequency text not null,
  retention_days integer not null check (retention_days >= 1),
  storage_namespace text not null,
  last_backup_at timestamptz,
  last_backup_status text not null default 'unknown',
  last_backup_reference text,
  last_snapshot_at timestamptz,
  total_snapshots integer not null default 0,
  next_backup_due_at timestamptz,
  last_restore_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tenant_backup_metadata_due
  on public.tenant_backup_metadata (next_backup_due_at, backup_tier_id);

create table if not exists public.tenant_backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  snapshot_reference text not null unique,
  snapshot_type text not null default 'logical' check (snapshot_type in ('logical', 'full', 'pitr_marker')),
  captured_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  status text not null default 'ready' check (status in ('queued', 'processing', 'ready', 'expired', 'failed')),
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tenant_backup_snapshots_tenant_captured
  on public.tenant_backup_snapshots (tenant_id, captured_at desc);

create table if not exists public.tenant_restore_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  backup_snapshot_id uuid references public.tenant_backup_snapshots(id) on delete set null,
  backup_point_in_time timestamptz,
  requested_by uuid not null references auth.users(id) on delete restrict,
  executed_by uuid references auth.users(id) on delete set null,
  reason text not null,
  restore_target text not null default 'staging_tenant'
    check (restore_target in ('production', 'staging_tenant', 'staging_workspace')),
  staging_tenant_id uuid references public.tenants(id) on delete set null,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'critical')),
  status public.restore_request_status not null default 'requested',
  confirmation_acknowledged_at timestamptz,
  precheck_summary jsonb not null default '{}'::jsonb,
  execution_log jsonb not null default '{}'::jsonb,
  post_restore_verification jsonb not null default '{}'::jsonb,
  restore_audit_log_id uuid,
  requested_at timestamptz not null default timezone('utc', now()),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tenant_restore_requests_tenant_status
  on public.tenant_restore_requests (tenant_id, status, requested_at desc);
create index if not exists idx_tenant_restore_requests_status
  on public.tenant_restore_requests (status, requested_at desc);

create table if not exists public.tenant_restore_history (
  id uuid primary key default gen_random_uuid(),
  restore_request_id uuid not null unique references public.tenant_restore_requests(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  executed_by uuid references auth.users(id) on delete set null,
  snapshot_reference text,
  backup_point_in_time timestamptz,
  restore_target text not null,
  reason text,
  outcome text not null,
  started_at timestamptz,
  completed_at timestamptz,
  restore_audit_log_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tenant_restore_history_tenant
  on public.tenant_restore_history (tenant_id, created_at desc);

create table if not exists public.tenant_storage_backup_state (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  storage_prefix text not null,
  last_file_backup_at timestamptz,
  last_file_restore_at timestamptz,
  backup_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tenant_provisioning_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'active', 'failed', 'cancelled')),
  organization_name text,
  slug text,
  primary_contact_name text,
  primary_contact_email text,
  first_tenant_admin_email text,
  selected_modules text[] not null default '{}'::text[],
  applied_template text,
  selected_plan text,
  selected_backup_tier_key text,
  branding jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  provisioning_log jsonb not null default '[]'::jsonb,
  activated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tenant_provisioning_runs_status
  on public.tenant_provisioning_runs (status, created_at desc);

create table if not exists public.platform_admin_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.platform_admin_role not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, role)
);

create index if not exists idx_platform_admin_memberships_user_active
  on public.platform_admin_memberships (user_id, is_active);

create table if not exists public.platform_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role public.platform_admin_role not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  impersonated_user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  reason text not null,
  banner_message text not null default 'Platform admin impersonation is active.',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role public.platform_admin_role,
  action_type text not null,
  target_entity_type text not null,
  target_entity_id uuid,
  tenant_id uuid references public.tenants(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_platform_audit_log_created
  on public.platform_audit_log (created_at desc);
create index if not exists idx_platform_audit_log_tenant
  on public.platform_audit_log (tenant_id, created_at desc);
create index if not exists idx_platform_audit_log_action
  on public.platform_audit_log (action_type, created_at desc);

create or replace function app.platform_role_rank(input_role text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(input_role, ''))
    when 'super_admin' then 100
    when 'build_team_admin' then 90
    when 'support_admin' then 80
    when 'billing_admin' then 70
    when 'internal_auditor' then 60
    when 'implementation_specialist' then 50
    else 0
  end;
$$;

create or replace function app.user_platform_roles(target_user_id uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(m.role::text order by app.platform_role_rank(m.role::text) desc),
    '{}'::text[]
  )
  from public.platform_admin_memberships m
  where m.user_id = coalesce(target_user_id, auth.uid())
    and m.is_active = true;
$$;

grant execute on function app.user_platform_roles(uuid) to authenticated;

create or replace function app.is_platform_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admin_memberships m
    where m.user_id = coalesce(target_user_id, auth.uid())
      and m.is_active = true
  );
$$;

grant execute on function app.is_platform_admin(uuid) to authenticated;

create or replace function app.has_platform_role(
  required_roles text[],
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admin_memberships m
    where m.user_id = coalesce(target_user_id, auth.uid())
      and m.is_active = true
      and m.role::text = any(required_roles)
  );
$$;

grant execute on function app.has_platform_role(text[], uuid) to authenticated;

create or replace function app.can_initiate_tenant_restore(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin'], target_user_id);
$$;

grant execute on function app.can_initiate_tenant_restore(uuid) to authenticated;

create or replace function app.tenant_storage_path(input_tenant_id uuid, object_name text default '')
returns text
language sql
immutable
as $$
  select concat(
    'tenants/',
    coalesce(input_tenant_id::text, 'unknown'),
    '/',
    trim(leading '/' from coalesce(object_name, ''))
  );
$$;

create or replace function app.log_platform_audit_event(
  action_type text,
  target_entity_type text,
  target_entity_id uuid default null,
  tenant_id uuid default null,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  role_value public.platform_admin_role;
  event_id uuid;
begin
  if not app.is_platform_admin(auth.uid()) then
    raise exception 'Insufficient permissions for platform audit event.'
      using errcode = '42501';
  end if;

  select m.role
    into role_value
    from public.platform_admin_memberships m
   where m.user_id = auth.uid()
     and m.is_active = true
   order by app.platform_role_rank(m.role::text) desc
   limit 1;

  insert into public.platform_audit_log (
    actor_user_id,
    actor_role,
    action_type,
    target_entity_type,
    target_entity_id,
    tenant_id,
    metadata
  )
  values (
    auth.uid(),
    role_value,
    coalesce(nullif(trim(action_type), ''), 'platform_action'),
    coalesce(nullif(trim(target_entity_type), ''), 'unknown'),
    target_entity_id,
    tenant_id,
    coalesce(metadata, '{}'::jsonb)
  )
  returning id into event_id;

  return event_id;
end;
$$;

grant execute on function app.log_platform_audit_event(text, text, uuid, uuid, jsonb) to authenticated;

create or replace function app.apply_tenant_backup_tier_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tier record;
begin
  if new.backup_tier_id is null then
    return new;
  end if;

  select id, backup_frequency, retention_days
    into tier
    from public.tenant_backup_tiers
   where id = new.backup_tier_id;

  if tier.id is null then
    raise exception 'Backup tier does not exist.'
      using errcode = '23503';
  end if;

  new.backup_frequency := tier.backup_frequency;
  new.backup_retention_days := tier.retention_days;
  return new;
end;
$$;

drop trigger if exists trg_tenants_backup_defaults on public.tenants;
create trigger trg_tenants_backup_defaults
before insert or update of backup_tier_id on public.tenants
for each row execute function app.apply_tenant_backup_tier_defaults();

create or replace function app.sync_tenant_backup_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.backup_tier_id is null then
    return new;
  end if;

  insert into public.tenant_backup_metadata (
    tenant_id,
    backup_tier_id,
    backup_frequency,
    retention_days,
    storage_namespace,
    next_backup_due_at,
    updated_at
  )
  values (
    new.id,
    new.backup_tier_id,
    coalesce(new.backup_frequency, 'daily'),
    coalesce(new.backup_retention_days, 30),
    app.tenant_storage_path(new.id, ''),
    timezone('utc', now()) + interval '1 day',
    timezone('utc', now())
  )
  on conflict (tenant_id) do update
    set backup_tier_id = excluded.backup_tier_id,
        backup_frequency = excluded.backup_frequency,
        retention_days = excluded.retention_days,
        storage_namespace = excluded.storage_namespace,
        updated_at = timezone('utc', now());

  insert into public.tenant_storage_backup_state (tenant_id, storage_prefix, updated_at)
  values (new.id, app.tenant_storage_path(new.id, ''), timezone('utc', now()))
  on conflict (tenant_id) do update
    set storage_prefix = excluded.storage_prefix,
        updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists trg_tenants_backup_metadata on public.tenants;
create trigger trg_tenants_backup_metadata
after insert or update of backup_tier_id on public.tenants
for each row execute function app.sync_tenant_backup_metadata();

create or replace function app.sync_tenant_record_from_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_tier record;
begin
  select id, backup_frequency, retention_days
    into default_tier
    from public.tenant_backup_tiers
   where key = 'standard'
     and is_active = true
   order by updated_at desc
   limit 1;

  insert into public.tenants (
    id,
    organization_name,
    slug,
    status,
    plan_package,
    enabled_modules,
    onboarding_stage,
    backup_tier_id,
    backup_frequency,
    backup_retention_days,
    last_activity_at,
    updated_at
  )
  values (
    new.id,
    new.name,
    new.slug,
    case when new.is_active then 'active'::public.tenant_status else 'suspended'::public.tenant_status end,
    'standard',
    array['contacts', 'financial', 'projects', 'memberships', 'reports']::text[],
    'active',
    default_tier.id,
    default_tier.backup_frequency,
    default_tier.retention_days,
    new.updated_at,
    timezone('utc', now())
  )
  on conflict (id) do update
    set organization_name = excluded.organization_name,
        slug = excluded.slug,
        status = excluded.status,
        last_activity_at = excluded.last_activity_at,
        updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists trg_organizations_sync_tenant on public.organizations;
create trigger trg_organizations_sync_tenant
after insert or update of name, slug, is_active on public.organizations
for each row execute function app.sync_tenant_record_from_organization();

insert into public.tenants (
  id,
  organization_name,
  slug,
  status,
  plan_package,
  enabled_modules,
  onboarding_stage,
  backup_tier_id,
  backup_frequency,
  backup_retention_days,
  last_activity_at
)
select
  o.id,
  o.name,
  o.slug,
  case when o.is_active then 'active'::public.tenant_status else 'suspended'::public.tenant_status end,
  'standard',
  array['contacts', 'financial', 'projects', 'memberships', 'reports']::text[],
  'active'::public.tenant_onboarding_stage,
  tier.id,
  tier.backup_frequency,
  tier.retention_days,
  o.updated_at
from public.organizations o
cross join lateral (
  select id, backup_frequency, retention_days
  from public.tenant_backup_tiers
  where key = 'standard'
  order by updated_at desc
  limit 1
) tier
on conflict (id) do update
set
  organization_name = excluded.organization_name,
  slug = excluded.slug,
  status = excluded.status,
  backup_tier_id = coalesce(public.tenants.backup_tier_id, excluded.backup_tier_id),
  backup_frequency = coalesce(public.tenants.backup_frequency, excluded.backup_frequency),
  backup_retention_days = coalesce(public.tenants.backup_retention_days, excluded.backup_retention_days),
  last_activity_at = greatest(public.tenants.last_activity_at, excluded.last_activity_at),
  updated_at = timezone('utc', now());

insert into public.tenant_backup_metadata (
  tenant_id,
  backup_tier_id,
  backup_frequency,
  retention_days,
  storage_namespace,
  next_backup_due_at
)
select
  t.id,
  t.backup_tier_id,
  coalesce(t.backup_frequency, 'daily'),
  coalesce(t.backup_retention_days, 30),
  app.tenant_storage_path(t.id, ''),
  timezone('utc', now()) + interval '1 day'
from public.tenants t
where t.backup_tier_id is not null
on conflict (tenant_id) do update
set
  backup_tier_id = excluded.backup_tier_id,
  backup_frequency = excluded.backup_frequency,
  retention_days = excluded.retention_days,
  storage_namespace = excluded.storage_namespace,
  updated_at = timezone('utc', now());

insert into public.tenant_storage_backup_state (tenant_id, storage_prefix)
select t.id, app.tenant_storage_path(t.id, '')
from public.tenants t
on conflict (tenant_id) do nothing;

create or replace function app.sync_tenant_id_from_organization_id()
returns trigger
language plpgsql
as $$
begin
  new.tenant_id := new.organization_id;
  return new;
end;
$$;

do $$
declare
  row record;
  has_tenant_id boolean;
  has_constraint boolean;
  has_index boolean;
  has_fk boolean;
  has_trigger boolean;
  constraint_name text;
  fk_name text;
  idx_name text;
  trg_name text;
begin
  for row in
    select c.table_name, c.is_nullable
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'organization_id'
  loop
    select exists (
      select 1
      from information_schema.columns tc
      where tc.table_schema = 'public'
        and tc.table_name = row.table_name
        and tc.column_name = 'tenant_id'
    )
    into has_tenant_id;

    if not has_tenant_id then
      execute format('alter table public.%I add column tenant_id uuid', row.table_name);
    end if;

    execute format('update public.%I set tenant_id = organization_id where tenant_id is null', row.table_name);

    if row.is_nullable = 'NO' then
      execute format('alter table public.%I alter column tenant_id set not null', row.table_name);
    end if;

    constraint_name := left(row.table_name || '_tenant_matches_org_chk', 63);
    select exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = row.table_name
        and c.conname = constraint_name
    )
    into has_constraint;

    if not has_constraint then
      execute format(
        'alter table public.%I add constraint %I check (tenant_id is not distinct from organization_id)',
        row.table_name,
        constraint_name
      );
    end if;

    idx_name := left('idx_' || row.table_name || '_tenant_id', 63);
    select exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = row.table_name
        and indexname = idx_name
    )
    into has_index;

    if not has_index then
      execute format('create index %I on public.%I (tenant_id)', idx_name, row.table_name);
    end if;

    fk_name := left(row.table_name || '_tenant_id_fkey', 63);
    select exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = row.table_name
        and c.conname = fk_name
    )
    into has_fk;

    if not has_fk then
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id) references public.tenants(id) on delete cascade',
        row.table_name,
        fk_name
      );
    end if;

    trg_name := left('trg_' || row.table_name || '_sync_tenant_id', 63);
    select exists (
      select 1
      from pg_trigger tg
      join pg_class t on t.oid = tg.tgrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = row.table_name
        and tg.tgname = trg_name
        and not tg.tgisinternal
    )
    into has_trigger;

    if not has_trigger then
      execute format(
        'create trigger %I before insert or update of organization_id on public.%I for each row execute function app.sync_tenant_id_from_organization_id()',
        trg_name,
        row.table_name
      );
    end if;
  end loop;
end
$$;

create or replace function app.capture_restore_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_ref text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status not in ('completed', 'failed') then
    return new;
  end if;

  if old.status = new.status and new.status in ('completed', 'failed') then
    return new;
  end if;

  select snapshot_reference
    into snapshot_ref
    from public.tenant_backup_snapshots s
   where s.id = new.backup_snapshot_id;

  insert into public.tenant_restore_history (
    restore_request_id,
    tenant_id,
    requested_by,
    executed_by,
    snapshot_reference,
    backup_point_in_time,
    restore_target,
    reason,
    outcome,
    started_at,
    completed_at,
    restore_audit_log_id,
    metadata
  )
  values (
    new.id,
    new.tenant_id,
    new.requested_by,
    new.executed_by,
    snapshot_ref,
    new.backup_point_in_time,
    new.restore_target,
    new.reason,
    new.status::text,
    new.started_at,
    new.completed_at,
    new.restore_audit_log_id,
    jsonb_build_object('riskLevel', new.risk_level, 'executionLog', new.execution_log)
  )
  on conflict (restore_request_id) do update
    set outcome = excluded.outcome,
        executed_by = excluded.executed_by,
        completed_at = excluded.completed_at,
        metadata = excluded.metadata;

  return new;
end;
$$;

drop trigger if exists trg_tenant_restore_capture_history on public.tenant_restore_requests;
create trigger trg_tenant_restore_capture_history
after update on public.tenant_restore_requests
for each row execute function app.capture_restore_history();

create or replace function public.platform_request_tenant_restore(
  input_tenant_id uuid,
  input_backup_snapshot_id uuid,
  input_reason text,
  input_restore_target text default 'staging_tenant',
  input_staging_tenant_id uuid default null,
  input_backup_point_in_time timestamptz default null,
  input_risk_level text default 'medium'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
  audit_id uuid;
begin
  if not app.can_initiate_tenant_restore(auth.uid()) then
    raise exception 'Insufficient permissions to create restore request.'
      using errcode = '42501';
  end if;

  insert into public.tenant_restore_requests (
    tenant_id,
    backup_snapshot_id,
    backup_point_in_time,
    requested_by,
    reason,
    restore_target,
    staging_tenant_id,
    risk_level,
    status
  )
  values (
    input_tenant_id,
    input_backup_snapshot_id,
    input_backup_point_in_time,
    auth.uid(),
    nullif(trim(coalesce(input_reason, '')), ''),
    coalesce(nullif(trim(input_restore_target), ''), 'staging_tenant'),
    input_staging_tenant_id,
    coalesce(nullif(trim(input_risk_level), ''), 'medium'),
    'requested'
  )
  returning id into request_id;

  audit_id := app.log_platform_audit_event(
    'tenant_restore_requested',
    'tenant_restore_requests',
    request_id,
    input_tenant_id,
    jsonb_build_object(
      'restoreTarget', input_restore_target,
      'riskLevel', input_risk_level,
      'stagingTenantId', input_staging_tenant_id
    )
  );

  update public.tenant_restore_requests
     set restore_audit_log_id = audit_id
   where id = request_id;

  return request_id;
end;
$$;

grant execute on function public.platform_request_tenant_restore(uuid, uuid, text, text, uuid, timestamptz, text) to authenticated;

create or replace function public.platform_set_restore_request_status(
  input_restore_request_id uuid,
  input_status public.restore_request_status,
  input_execution_log jsonb default '{}'::jsonb,
  input_post_restore_verification jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row record;
  audit_id uuid;
begin
  if not app.can_initiate_tenant_restore(auth.uid()) then
    raise exception 'Insufficient permissions to update restore request status.'
      using errcode = '42501';
  end if;

  select *
    into request_row
    from public.tenant_restore_requests
   where id = input_restore_request_id;

  if request_row.id is null then
    raise exception 'Restore request not found.'
      using errcode = 'P0002';
  end if;

  update public.tenant_restore_requests
     set status = input_status,
         executed_by = case when input_status in ('in_progress', 'completed', 'failed') then auth.uid() else executed_by end,
         approved_at = case when input_status = 'approved' then coalesce(approved_at, timezone('utc', now())) else approved_at end,
         started_at = case when input_status = 'in_progress' then coalesce(started_at, timezone('utc', now())) else started_at end,
         completed_at = case when input_status in ('completed', 'failed', 'cancelled') then timezone('utc', now()) else completed_at end,
         execution_log = coalesce(input_execution_log, '{}'::jsonb),
         post_restore_verification = coalesce(input_post_restore_verification, '{}'::jsonb),
         updated_at = timezone('utc', now())
   where id = input_restore_request_id;

  if input_status in ('completed', 'failed') then
    update public.tenant_backup_metadata
       set last_restore_at = timezone('utc', now()),
           updated_at = timezone('utc', now())
     where tenant_id = request_row.tenant_id;
  end if;

  audit_id := app.log_platform_audit_event(
    'tenant_restore_status_updated',
    'tenant_restore_requests',
    input_restore_request_id,
    request_row.tenant_id,
    jsonb_build_object('status', input_status::text)
  );

  update public.tenant_restore_requests
     set restore_audit_log_id = coalesce(restore_audit_log_id, audit_id)
   where id = input_restore_request_id;
end;
$$;

grant execute on function public.platform_set_restore_request_status(uuid, public.restore_request_status, jsonb, jsonb) to authenticated;

alter table public.tenant_backup_tiers enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_module_entitlements enable row level security;
alter table public.tenant_backup_metadata enable row level security;
alter table public.tenant_backup_snapshots enable row level security;
alter table public.tenant_restore_requests enable row level security;
alter table public.tenant_restore_history enable row level security;
alter table public.tenant_storage_backup_state enable row level security;
alter table public.tenant_provisioning_runs enable row level security;
alter table public.platform_admin_memberships enable row level security;
alter table public.platform_impersonation_sessions enable row level security;
alter table public.platform_audit_log enable row level security;

drop policy if exists platform_admin_memberships_select on public.platform_admin_memberships;
create policy platform_admin_memberships_select on public.platform_admin_memberships
  for select
  using (user_id = auth.uid() or app.is_platform_admin());

drop policy if exists platform_admin_memberships_manage on public.platform_admin_memberships;
create policy platform_admin_memberships_manage on public.platform_admin_memberships
  for all
  using (app.has_platform_role(array['super_admin', 'build_team_admin']))
  with check (app.has_platform_role(array['super_admin', 'build_team_admin']));

drop policy if exists tenants_select_platform on public.tenants;
create policy tenants_select_platform on public.tenants
  for select
  using (app.is_platform_admin());

drop policy if exists tenants_insert_platform on public.tenants;
create policy tenants_insert_platform on public.tenants
  for insert
  with check (app.has_platform_role(array['super_admin', 'build_team_admin', 'implementation_specialist']));

drop policy if exists tenants_update_platform on public.tenants;
create policy tenants_update_platform on public.tenants
  for update
  using (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin', 'implementation_specialist', 'billing_admin']))
  with check (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin', 'implementation_specialist', 'billing_admin']));

drop policy if exists tenants_delete_platform on public.tenants;
create policy tenants_delete_platform on public.tenants
  for delete
  using (app.has_platform_role(array['super_admin', 'build_team_admin']));

drop policy if exists tenant_backup_tiers_select on public.tenant_backup_tiers;
create policy tenant_backup_tiers_select on public.tenant_backup_tiers
  for select
  using (app.is_platform_admin());

drop policy if exists tenant_backup_tiers_manage on public.tenant_backup_tiers;
create policy tenant_backup_tiers_manage on public.tenant_backup_tiers
  for all
  using (app.has_platform_role(array['super_admin', 'build_team_admin', 'billing_admin']))
  with check (app.has_platform_role(array['super_admin', 'build_team_admin', 'billing_admin']));

drop policy if exists tenant_module_entitlements_select on public.tenant_module_entitlements;
create policy tenant_module_entitlements_select on public.tenant_module_entitlements
  for select
  using (app.is_platform_admin());

drop policy if exists tenant_module_entitlements_manage on public.tenant_module_entitlements;
create policy tenant_module_entitlements_manage on public.tenant_module_entitlements
  for all
  using (app.has_platform_role(array['super_admin', 'build_team_admin', 'billing_admin', 'implementation_specialist']))
  with check (app.has_platform_role(array['super_admin', 'build_team_admin', 'billing_admin', 'implementation_specialist']));

drop policy if exists tenant_backup_metadata_select on public.tenant_backup_metadata;
create policy tenant_backup_metadata_select on public.tenant_backup_metadata
  for select
  using (app.is_platform_admin());

drop policy if exists tenant_backup_metadata_manage on public.tenant_backup_metadata;
create policy tenant_backup_metadata_manage on public.tenant_backup_metadata
  for all
  using (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin']))
  with check (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin']));

drop policy if exists tenant_backup_snapshots_select on public.tenant_backup_snapshots;
create policy tenant_backup_snapshots_select on public.tenant_backup_snapshots
  for select
  using (app.is_platform_admin());

drop policy if exists tenant_backup_snapshots_manage on public.tenant_backup_snapshots;
create policy tenant_backup_snapshots_manage on public.tenant_backup_snapshots
  for all
  using (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin']))
  with check (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin']));

drop policy if exists tenant_restore_requests_select on public.tenant_restore_requests;
create policy tenant_restore_requests_select on public.tenant_restore_requests
  for select
  using (app.is_platform_admin());

drop policy if exists tenant_restore_requests_insert on public.tenant_restore_requests;
create policy tenant_restore_requests_insert on public.tenant_restore_requests
  for insert
  with check (app.can_initiate_tenant_restore());

drop policy if exists tenant_restore_requests_update on public.tenant_restore_requests;
create policy tenant_restore_requests_update on public.tenant_restore_requests
  for update
  using (app.can_initiate_tenant_restore())
  with check (app.can_initiate_tenant_restore());

drop policy if exists tenant_restore_history_select on public.tenant_restore_history;
create policy tenant_restore_history_select on public.tenant_restore_history
  for select
  using (app.is_platform_admin());

drop policy if exists tenant_restore_history_insert on public.tenant_restore_history;
create policy tenant_restore_history_insert on public.tenant_restore_history
  for insert
  with check (app.can_initiate_tenant_restore());

drop policy if exists tenant_storage_backup_state_select on public.tenant_storage_backup_state;
create policy tenant_storage_backup_state_select on public.tenant_storage_backup_state
  for select
  using (app.is_platform_admin());

drop policy if exists tenant_storage_backup_state_manage on public.tenant_storage_backup_state;
create policy tenant_storage_backup_state_manage on public.tenant_storage_backup_state
  for all
  using (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin']))
  with check (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin']));

drop policy if exists tenant_provisioning_runs_select on public.tenant_provisioning_runs;
create policy tenant_provisioning_runs_select on public.tenant_provisioning_runs
  for select
  using (app.is_platform_admin());

drop policy if exists tenant_provisioning_runs_manage on public.tenant_provisioning_runs;
create policy tenant_provisioning_runs_manage on public.tenant_provisioning_runs
  for all
  using (app.has_platform_role(array['super_admin', 'build_team_admin', 'implementation_specialist', 'support_admin']))
  with check (app.has_platform_role(array['super_admin', 'build_team_admin', 'implementation_specialist', 'support_admin']));

drop policy if exists platform_impersonation_sessions_select on public.platform_impersonation_sessions;
create policy platform_impersonation_sessions_select on public.platform_impersonation_sessions
  for select
  using (app.is_platform_admin());

drop policy if exists platform_impersonation_sessions_manage on public.platform_impersonation_sessions;
create policy platform_impersonation_sessions_manage on public.platform_impersonation_sessions
  for all
  using (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin']))
  with check (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin']));

drop policy if exists platform_audit_log_select on public.platform_audit_log;
create policy platform_audit_log_select on public.platform_audit_log
  for select
  using (app.has_platform_role(array['super_admin', 'build_team_admin', 'support_admin', 'billing_admin', 'internal_auditor', 'implementation_specialist']));

drop policy if exists platform_audit_log_insert on public.platform_audit_log;
create policy platform_audit_log_insert on public.platform_audit_log
  for insert
  with check (app.is_platform_admin());

