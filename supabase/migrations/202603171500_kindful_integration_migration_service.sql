-- Kindful migration + transition sync support.
-- Built to support: full backfill, incremental sync, restartability, review queues,
-- raw payload traceability, and external ID preservation.

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
values (
  'Kindful',
  'kindful',
  'Kindful Customer API migration + transition sync (contacts, transactions, metadata).',
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

create table if not exists public.integration_sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  scope text not null,
  checkpoint_key text not null,
  checkpoint_value jsonb not null default '{}'::jsonb,
  last_successful_sync_date timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, integration_connection_id, scope, checkpoint_key)
);

create table if not exists public.integration_dead_letter_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sync_job_id uuid references public.integration_sync_jobs(id) on delete set null,
  entity_type text not null,
  source_record_id text,
  payload_json jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text not null,
  retryable boolean not null default true,
  retry_count integer not null default 0,
  status text not null default 'open',
  last_retry_date timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.integration_review_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sync_job_id uuid references public.integration_sync_jobs(id) on delete set null,
  entity_type text not null,
  source_record_id text,
  reason text not null,
  confidence_score numeric(5,2),
  source_payload jsonb not null default '{}'::jsonb,
  candidate_matches jsonb not null default '[]'::jsonb,
  resolution_status text not null default 'open',
  resolution_notes text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.raw_source_payloads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sync_job_id uuid references public.integration_sync_jobs(id) on delete set null,
  source_system text not null,
  entity_type text not null,
  source_record_id text,
  payload_hash text,
  payload_json jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.transaction_external_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  donation_id uuid not null references public.donations(id) on delete cascade,
  source_system text not null,
  external_id text not null,
  external_type text,
  raw_source_reference jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.campaign_external_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_system text not null,
  external_id text not null,
  external_type text,
  raw_source_reference jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tag_external_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  source_system text not null,
  external_id text not null,
  external_type text,
  raw_source_reference jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.integration_cutover_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  source_system text not null default 'kindful',
  report_status text not null default 'draft',
  contacts_with_external_ids integer not null default 0,
  transactions_with_external_ids integer not null default 0,
  open_failed_queue_count integer not null default 0,
  open_review_queue_count integer not null default 0,
  last_kindful_only_change_at timestamptz,
  reconciliation_summary jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_transaction_external_ids_unique_active
  on public.transaction_external_ids (organization_id, source_system, external_id)
  where is_active = true;

create unique index if not exists idx_campaign_external_ids_unique_active
  on public.campaign_external_ids (organization_id, source_system, external_id)
  where is_active = true;

create unique index if not exists idx_tag_external_ids_unique_active
  on public.tag_external_ids (organization_id, source_system, external_id)
  where is_active = true;

create index if not exists idx_integration_checkpoints_lookup
  on public.integration_sync_checkpoints (organization_id, integration_connection_id, scope, checkpoint_key);

create index if not exists idx_integration_dlq_lookup
  on public.integration_dead_letter_queue (organization_id, integration_connection_id, status, created_at desc);

create index if not exists idx_integration_review_lookup
  on public.integration_review_queue (organization_id, integration_connection_id, resolution_status, created_at desc);

create index if not exists idx_raw_payloads_lookup
  on public.raw_source_payloads (organization_id, integration_connection_id, source_system, entity_type, ingested_at desc);

create index if not exists idx_cutover_reports_lookup
  on public.integration_cutover_reports (organization_id, integration_connection_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_integration_sync_checkpoints_updated_at'
  ) then
    create trigger trg_integration_sync_checkpoints_updated_at
    before update on public.integration_sync_checkpoints
    for each row execute function app.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_integration_dead_letter_queue_updated_at'
  ) then
    create trigger trg_integration_dead_letter_queue_updated_at
    before update on public.integration_dead_letter_queue
    for each row execute function app.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_integration_review_queue_updated_at'
  ) then
    create trigger trg_integration_review_queue_updated_at
    before update on public.integration_review_queue
    for each row execute function app.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_raw_source_payloads_updated_at'
  ) then
    create trigger trg_raw_source_payloads_updated_at
    before update on public.raw_source_payloads
    for each row execute function app.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_transaction_external_ids_updated_at'
  ) then
    create trigger trg_transaction_external_ids_updated_at
    before update on public.transaction_external_ids
    for each row execute function app.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_campaign_external_ids_updated_at'
  ) then
    create trigger trg_campaign_external_ids_updated_at
    before update on public.campaign_external_ids
    for each row execute function app.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_tag_external_ids_updated_at'
  ) then
    create trigger trg_tag_external_ids_updated_at
    before update on public.tag_external_ids
    for each row execute function app.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_integration_cutover_reports_updated_at'
  ) then
    create trigger trg_integration_cutover_reports_updated_at
    before update on public.integration_cutover_reports
    for each row execute function app.set_updated_at();
  end if;
end $$;

create or replace function public.resolve_transaction_by_external_id(
  org_id uuid,
  source text,
  external text
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  resolved_donation uuid;
begin
  if org_id is null or source is null or external is null then
    return null;
  end if;

  select tei.donation_id
    into resolved_donation
  from public.transaction_external_ids tei
  where tei.organization_id = org_id
    and lower(trim(tei.source_system)) = lower(trim(source))
    and app.normalize_external_id_value(tei.external_id) = app.normalize_external_id_value(external)
    and tei.is_active = true
  limit 1;

  if resolved_donation is not null then
    return resolved_donation;
  end if;

  select der.donation_id
    into resolved_donation
  from public.donation_external_references der
  where der.organization_id = org_id
    and lower(trim(der.source_system)) = lower(trim(source))
    and app.normalize_external_id_value(der.external_record_id) = app.normalize_external_id_value(external)
  limit 1;

  return resolved_donation;
end;
$$;

grant execute on function public.resolve_transaction_by_external_id(uuid, text, text) to authenticated;

alter table public.integration_sync_checkpoints enable row level security;
alter table public.integration_dead_letter_queue enable row level security;
alter table public.integration_review_queue enable row level security;
alter table public.raw_source_payloads enable row level security;
alter table public.transaction_external_ids enable row level security;
alter table public.campaign_external_ids enable row level security;
alter table public.tag_external_ids enable row level security;
alter table public.integration_cutover_reports enable row level security;

drop policy if exists integration_sync_checkpoints_manage on public.integration_sync_checkpoints;
create policy integration_sync_checkpoints_manage on public.integration_sync_checkpoints
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

drop policy if exists integration_dead_letter_queue_manage on public.integration_dead_letter_queue;
create policy integration_dead_letter_queue_manage on public.integration_dead_letter_queue
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

drop policy if exists integration_review_queue_manage on public.integration_review_queue;
create policy integration_review_queue_manage on public.integration_review_queue
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

drop policy if exists raw_source_payloads_manage on public.raw_source_payloads;
create policy raw_source_payloads_manage on public.raw_source_payloads
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

drop policy if exists transaction_external_ids_manage on public.transaction_external_ids;
create policy transaction_external_ids_manage on public.transaction_external_ids
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

drop policy if exists campaign_external_ids_manage on public.campaign_external_ids;
create policy campaign_external_ids_manage on public.campaign_external_ids
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

drop policy if exists tag_external_ids_manage on public.tag_external_ids;
create policy tag_external_ids_manage on public.tag_external_ids
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

drop policy if exists integration_cutover_reports_manage on public.integration_cutover_reports;
create policy integration_cutover_reports_manage on public.integration_cutover_reports
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

grant select, insert, update, delete on public.integration_sync_checkpoints to authenticated;
grant select, insert, update, delete on public.integration_dead_letter_queue to authenticated;
grant select, insert, update, delete on public.integration_review_queue to authenticated;
grant select, insert, update, delete on public.raw_source_payloads to authenticated;
grant select, insert, update, delete on public.transaction_external_ids to authenticated;
grant select, insert, update, delete on public.campaign_external_ids to authenticated;
grant select, insert, update, delete on public.tag_external_ids to authenticated;
grant select, insert, update, delete on public.integration_cutover_reports to authenticated;
