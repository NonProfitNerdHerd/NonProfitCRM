alter table public.integration_connections
  add column if not exists allow_module_access boolean not null default false;

create table if not exists public.integration_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider_key text not null,
  provider_event_id text,
  event_type text not null,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  processing_status text not null default 'pending',
  processing_attempts integer not null default 0,
  request_headers jsonb not null default '{}'::jsonb,
  raw_payload_json jsonb not null default '{}'::jsonb,
  normalized_payload_json jsonb not null default '{}'::jsonb,
  error_message text,
  idempotency_key text not null,
  created_transaction_id uuid references public.donations(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, integration_connection_id, idempotency_key)
);

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_processing_status_check;

alter table public.integration_webhook_events
  add constraint integration_webhook_events_processing_status_check
  check (
    processing_status in (
      'pending',
      'processed',
      'needs_review',
      'failed',
      'ignored',
      'duplicate',
      'invalid'
    )
  );

create table if not exists public.integration_transaction_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  webhook_event_id uuid not null references public.integration_webhook_events(id) on delete cascade,
  provider_key text not null,
  external_transaction_id text,
  external_page_id text,
  external_campaign_reference text,
  external_donor_reference text,
  matched_campaign_id uuid references public.campaigns(id) on delete set null,
  matched_donor_id uuid references public.contacts(id) on delete set null,
  donor_match_confidence numeric(5, 2),
  campaign_match_confidence numeric(5, 2),
  donor_match_rule text,
  campaign_match_rule text,
  review_status text not null default 'pending_review',
  review_notes text,
  import_status text not null default 'pending',
  normalized_donor_json jsonb not null default '{}'::jsonb,
  normalized_transaction_json jsonb not null default '{}'::jsonb,
  matching_details_json jsonb not null default '{}'::jsonb,
  created_crm_transaction_id uuid references public.donations(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  processed_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (webhook_event_id)
);

alter table public.integration_transaction_imports
  drop constraint if exists integration_transaction_imports_review_status_check;

alter table public.integration_transaction_imports
  add constraint integration_transaction_imports_review_status_check
  check (
    review_status in (
      'auto_accepted',
      'pending_review',
      'approved',
      'rejected',
      'corrected',
      'ignored'
    )
  );

alter table public.integration_transaction_imports
  drop constraint if exists integration_transaction_imports_import_status_check;

alter table public.integration_transaction_imports
  add constraint integration_transaction_imports_import_status_check
  check (
    import_status in (
      'pending',
      'ready_to_import',
      'imported',
      'failed',
      'ignored'
    )
  );

create table if not exists public.givingfuel_campaign_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  external_page_id text not null,
  external_page_key text,
  external_page_name text,
  crm_campaign_id uuid not null references public.campaigns(id) on delete cascade,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, integration_connection_id, external_page_id)
);

create table if not exists public.integration_review_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  transaction_import_id uuid not null references public.integration_transaction_imports(id) on delete cascade,
  action_type text not null,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  previous_values_json jsonb not null default '{}'::jsonb,
  new_values_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists uq_integration_imports_external_tx
  on public.integration_transaction_imports (organization_id, integration_connection_id, external_transaction_id)
  where external_transaction_id is not null;

create index if not exists idx_integration_webhook_events_org_status_received
  on public.integration_webhook_events (organization_id, processing_status, received_at desc);

create index if not exists idx_integration_webhook_events_connection_received
  on public.integration_webhook_events (integration_connection_id, received_at desc);

create index if not exists idx_integration_webhook_events_provider_event
  on public.integration_webhook_events (provider_event_id);

create index if not exists idx_integration_imports_org_review_status
  on public.integration_transaction_imports (organization_id, review_status, created_at desc);

create index if not exists idx_integration_imports_org_import_status
  on public.integration_transaction_imports (organization_id, import_status, created_at desc);

create index if not exists idx_integration_imports_org_campaign
  on public.integration_transaction_imports (organization_id, matched_campaign_id);

create index if not exists idx_integration_imports_org_donor
  on public.integration_transaction_imports (organization_id, matched_donor_id);

create index if not exists idx_givingfuel_campaign_mappings_org_connection
  on public.givingfuel_campaign_mappings (organization_id, integration_connection_id, is_active);

create index if not exists idx_review_actions_import_created
  on public.integration_review_actions (transaction_import_id, created_at desc);

drop trigger if exists trg_integration_webhook_events_updated_at on public.integration_webhook_events;
create trigger trg_integration_webhook_events_updated_at
before update on public.integration_webhook_events
for each row execute function app.set_updated_at();

drop trigger if exists trg_integration_transaction_imports_updated_at on public.integration_transaction_imports;
create trigger trg_integration_transaction_imports_updated_at
before update on public.integration_transaction_imports
for each row execute function app.set_updated_at();

drop trigger if exists trg_givingfuel_campaign_mappings_updated_at on public.givingfuel_campaign_mappings;
create trigger trg_givingfuel_campaign_mappings_updated_at
before update on public.givingfuel_campaign_mappings
for each row execute function app.set_updated_at();

alter table public.integration_webhook_events enable row level security;
alter table public.integration_transaction_imports enable row level security;
alter table public.givingfuel_campaign_mappings enable row level security;
alter table public.integration_review_actions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_webhook_events'
      and policyname = 'integration_webhook_events_select'
  ) then
    create policy integration_webhook_events_select on public.integration_webhook_events
      for select
      using (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_view_donations')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_webhook_events'
      and policyname = 'integration_webhook_events_manage'
  ) then
    create policy integration_webhook_events_manage on public.integration_webhook_events
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
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_transaction_imports'
      and policyname = 'integration_transaction_imports_select'
  ) then
    create policy integration_transaction_imports_select on public.integration_transaction_imports
      for select
      using (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_view_donations')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_transaction_imports'
      and policyname = 'integration_transaction_imports_update'
  ) then
    create policy integration_transaction_imports_update on public.integration_transaction_imports
      for update
      using (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_edit_donations')
      )
      with check (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_edit_donations')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_transaction_imports'
      and policyname = 'integration_transaction_imports_insert'
  ) then
    create policy integration_transaction_imports_insert on public.integration_transaction_imports
      for insert
      with check (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_manage_integrations')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_transaction_imports'
      and policyname = 'integration_transaction_imports_delete'
  ) then
    create policy integration_transaction_imports_delete on public.integration_transaction_imports
      for delete
      using (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_manage_integrations')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'givingfuel_campaign_mappings'
      and policyname = 'givingfuel_campaign_mappings_manage'
  ) then
    create policy givingfuel_campaign_mappings_manage on public.givingfuel_campaign_mappings
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
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_review_actions'
      and policyname = 'integration_review_actions_select'
  ) then
    create policy integration_review_actions_select on public.integration_review_actions
      for select
      using (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_view_donations')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_review_actions'
      and policyname = 'integration_review_actions_insert'
  ) then
    create policy integration_review_actions_insert on public.integration_review_actions
      for insert
      with check (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_edit_donations')
      );
  end if;
end $$;

grant select, insert, update, delete on public.integration_webhook_events to authenticated;
grant select, insert, update, delete on public.integration_transaction_imports to authenticated;
grant select, insert, update, delete on public.givingfuel_campaign_mappings to authenticated;
grant select, insert on public.integration_review_actions to authenticated;

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
    'GivingFuel Webhook',
    'givingfuel_webhook',
    'Webhook-based GivingFuel transaction intake with campaign/donor matching, review workflow, and audit traceability.',
    'donations',
    true,
    false,
    false,
    false
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
