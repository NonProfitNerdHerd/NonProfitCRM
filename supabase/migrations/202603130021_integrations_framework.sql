insert into public.permissions (key, name, description, category)
values
  (
    'can_manage_integrations',
    'Manage Integrations',
    'Configure and run administrator integration connections and sync jobs',
    'administration'
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

insert into public.role_template_permissions (role_template_id, permission_id)
select rt.id, p.id
from public.role_templates rt
join public.permissions p on p.key = 'can_manage_integrations'
where rt.key = 'administrator'
on conflict (role_template_id, permission_id) do nothing;

create table if not exists public.integration_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider_key text not null unique,
  description text,
  category text not null default 'general',
  is_active boolean not null default true,
  supports_manual_sync boolean not null default true,
  supports_scheduled_sync boolean not null default true,
  supports_test_connection boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_definition_id uuid not null references public.integration_definitions(id) on delete cascade,
  name text not null,
  base_url text,
  auth_type text not null default 'api_key_header',
  api_key_reference text,
  is_enabled boolean not null default false,
  connection_status text not null default 'not_tested',
  last_connection_test_date timestamptz,
  last_connection_test_result text,
  timeout_ms integer not null default 30000,
  retry_settings jsonb not null default '{"maxRetries": 3, "backoffMs": 1000}'::jsonb,
  debug_logging_enabled boolean not null default false,
  configuration_json jsonb not null default '{}'::jsonb,
  sync_settings_json jsonb not null default '{}'::jsonb,
  field_mapping_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, integration_definition_id)
);

create table if not exists public.integration_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  job_type text not null,
  sync_scope text not null,
  started_date timestamptz not null default timezone('utc', now()),
  completed_date timestamptz,
  status text not null default 'queued',
  records_processed integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_failed integer not null default 0,
  last_successful_cursor text,
  last_successful_sync_date timestamptz,
  error_summary text,
  triggered_by uuid references auth.users(id) on delete set null,
  triggered_by_type text not null default 'manual',
  duration_ms integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.integration_sync_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sync_job_id uuid not null references public.integration_sync_jobs(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  entity_type text not null,
  source_record_id text,
  crm_record_id uuid,
  action_taken text,
  status text not null default 'processed',
  message text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  logged_date timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.integration_error_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sync_job_id uuid references public.integration_sync_jobs(id) on delete set null,
  entity_type text not null,
  source_record_id text,
  payload_json jsonb not null default '{}'::jsonb,
  error_message text not null,
  retry_count integer not null default 0,
  status text not null default 'open',
  next_retry_date timestamptz,
  last_retry_date timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.contact_external_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source_system text not null,
  external_record_id text not null,
  external_record_type text,
  last_source_modified_date timestamptz,
  last_synced_date timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, source_system, external_record_id)
);

create table if not exists public.donation_external_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  donation_id uuid not null references public.donations(id) on delete cascade,
  source_system text not null,
  external_record_id text not null,
  external_record_type text,
  external_contact_id text,
  last_source_modified_date timestamptz,
  last_synced_date timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, source_system, external_record_id)
);

create index if not exists idx_integration_connections_org_enabled
  on public.integration_connections (organization_id, is_enabled);
create index if not exists idx_integration_jobs_org_started
  on public.integration_sync_jobs (organization_id, started_date desc);
create index if not exists idx_integration_logs_org_job
  on public.integration_sync_logs (organization_id, sync_job_id);
create index if not exists idx_integration_errors_org_status
  on public.integration_error_queue (organization_id, status, next_retry_date);
create index if not exists idx_contact_external_refs_org_source
  on public.contact_external_references (organization_id, source_system, external_record_id);
create index if not exists idx_donation_external_refs_org_source
  on public.donation_external_references (organization_id, source_system, external_record_id);

create trigger trg_integration_definitions_updated_at
before update on public.integration_definitions
for each row execute function app.set_updated_at();

create trigger trg_integration_connections_updated_at
before update on public.integration_connections
for each row execute function app.set_updated_at();

create trigger trg_integration_sync_jobs_updated_at
before update on public.integration_sync_jobs
for each row execute function app.set_updated_at();

create trigger trg_integration_sync_logs_updated_at
before update on public.integration_sync_logs
for each row execute function app.set_updated_at();

create trigger trg_integration_error_queue_updated_at
before update on public.integration_error_queue
for each row execute function app.set_updated_at();

create trigger trg_contact_external_references_updated_at
before update on public.contact_external_references
for each row execute function app.set_updated_at();

create trigger trg_donation_external_references_updated_at
before update on public.donation_external_references
for each row execute function app.set_updated_at();

alter table public.integration_definitions enable row level security;
alter table public.integration_connections enable row level security;
alter table public.integration_sync_jobs enable row level security;
alter table public.integration_sync_logs enable row level security;
alter table public.integration_error_queue enable row level security;
alter table public.contact_external_references enable row level security;
alter table public.donation_external_references enable row level security;

create policy integration_definitions_read on public.integration_definitions
  for select
  using (auth.role() = 'authenticated');

create policy integration_connections_manage on public.integration_connections
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

create policy integration_sync_jobs_manage on public.integration_sync_jobs
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

create policy integration_sync_logs_manage on public.integration_sync_logs
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

create policy integration_error_queue_manage on public.integration_error_queue
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

create policy contact_external_references_manage on public.contact_external_references
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

create policy donation_external_references_manage on public.donation_external_references
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

grant select, insert, update, delete on public.integration_connections to authenticated;
grant select, insert, update, delete on public.integration_sync_jobs to authenticated;
grant select, insert, update, delete on public.integration_sync_logs to authenticated;
grant select, insert, update, delete on public.integration_error_queue to authenticated;
grant select, insert, update, delete on public.contact_external_references to authenticated;
grant select, insert, update, delete on public.donation_external_references to authenticated;
grant select on public.integration_definitions to authenticated;

insert into public.integration_definitions (
  name,
  provider_key,
  description,
  category,
  is_active,
  supports_manual_sync,
  supports_scheduled_sync,
  supports_test_connection
)
values
  (
    'Webconnex',
    'webconnex',
    'Webconnex API synchronization for contacts and donations/transactions.',
    'donations',
    true,
    true,
    true,
    true
  )
on conflict (provider_key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_active = excluded.is_active,
  supports_manual_sync = excluded.supports_manual_sync,
  supports_scheduled_sync = excluded.supports_scheduled_sync,
  supports_test_connection = excluded.supports_test_connection,
  updated_at = timezone('utc', now());
