alter table public.integration_sync_jobs
  add column if not exists sync_run_mode text not null default 'incremental';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'integration_sync_jobs_sync_run_mode_check'
  ) then
    alter table public.integration_sync_jobs
      add constraint integration_sync_jobs_sync_run_mode_check
      check (sync_run_mode in ('full', 'incremental'));
  end if;
end
$$;

create table if not exists public.integration_sync_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sync_scope text not null default 'contacts',
  sync_mode_status text not null default 'pending_initial_sync',
  initial_full_sync_completed boolean not null default false,
  active_job_id uuid references public.integration_sync_jobs(id) on delete set null,
  last_successful_full_sync_at timestamptz,
  last_successful_incremental_sync_at timestamptz,
  last_processed_checkpoint timestamptz,
  last_error_message text,
  status_message text,
  records_processed integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  records_failed integer not null default 0,
  total_records_expected integer,
  records_remaining integer,
  percent_complete numeric(5, 2),
  current_page integer,
  current_batch integer,
  started_at timestamptz,
  last_updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, integration_connection_id, sync_scope),
  constraint integration_sync_states_scope_check
    check (sync_scope in ('contacts', 'donations', 'all')),
  constraint integration_sync_states_mode_check
    check (
      sync_mode_status in (
        'pending_initial_sync',
        'full_sync_in_progress',
        'incremental_ready',
        'incremental_sync_in_progress',
        'failed'
      )
    )
);

create index if not exists idx_integration_sync_states_org_connection_mode
  on public.integration_sync_states (organization_id, integration_connection_id, sync_mode_status);

create index if not exists idx_integration_sync_states_active_job
  on public.integration_sync_states (organization_id, active_job_id)
  where active_job_id is not null;

drop trigger if exists trg_integration_sync_states_updated_at on public.integration_sync_states;
create trigger trg_integration_sync_states_updated_at
before update on public.integration_sync_states
for each row execute function app.set_updated_at();

alter table public.integration_sync_states enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_sync_states'
      and policyname = 'integration_sync_states_manage'
  ) then
    create policy integration_sync_states_manage on public.integration_sync_states
      for all
      using (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_manage_integrations')
      )
      with check (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_manage_integrations')
      );
  end if;
end
$$;

grant select, insert, update, delete on public.integration_sync_states to authenticated;

insert into public.integration_sync_states (
  organization_id,
  integration_connection_id,
  sync_scope,
  sync_mode_status,
  initial_full_sync_completed,
  last_successful_full_sync_at,
  last_successful_incremental_sync_at,
  created_by,
  updated_by
)
select
  ic.organization_id,
  ic.id as integration_connection_id,
  case
    when idf.provider_key = 'webconnex' then 'contacts'
    when idf.provider_key = 'givingfuel_donations' then 'donations'
    else 'all'
  end as sync_scope,
  case
    when coalesce(nullif(ic.sync_settings_json ->> 'lastSuccessfulSyncDate', ''), '') <> ''
      then 'incremental_ready'
    else 'pending_initial_sync'
  end as sync_mode_status,
  case
    when coalesce(nullif(ic.sync_settings_json ->> 'lastSuccessfulSyncDate', ''), '') <> '' then true
    else false
  end as initial_full_sync_completed,
  case
    when coalesce(ic.sync_settings_json ->> 'lastSuccessfulSyncDate', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then (ic.sync_settings_json ->> 'lastSuccessfulSyncDate')::timestamptz
    else null
  end as last_successful_full_sync_at,
  case
    when coalesce(ic.sync_settings_json ->> 'lastSuccessfulSyncDate', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then (ic.sync_settings_json ->> 'lastSuccessfulSyncDate')::timestamptz
    else null
  end as last_successful_incremental_sync_at,
  ic.created_by,
  ic.updated_by
from public.integration_connections ic
join public.integration_definitions idf on idf.id = ic.integration_definition_id
where idf.provider_key in ('webconnex', 'givingfuel_donations')
on conflict (organization_id, integration_connection_id, sync_scope) do nothing;
