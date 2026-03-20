alter table public.integration_webhook_events
  alter column organization_id drop not null,
  alter column integration_connection_id drop not null;

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_organization_id_integration_connection_id_idempotency_key_key;

alter table public.integration_webhook_events
  add column if not exists webhook_route_id text,
  add column if not exists request_method text,
  add column if not exists request_url text,
  add column if not exists raw_body_text text,
  add column if not exists parsed_body_json jsonb not null default '{}'::jsonb,
  add column if not exists source_system text not null default 'GivingFuel',
  add column if not exists validation_status text not null default 'pending',
  add column if not exists response_status_code integer,
  add column if not exists matched_integration_id uuid references public.integration_connections(id) on delete set null,
  add column if not exists matched_campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists matched_donor_id uuid references public.contacts(id) on delete set null,
  add column if not exists is_test_event boolean not null default false,
  add column if not exists environment text,
  add column if not exists replay_of_webhook_event_id uuid references public.integration_webhook_events(id) on delete set null;

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_processing_status_check;

alter table public.integration_webhook_events
  add constraint integration_webhook_events_processing_status_check
  check (
    processing_status in (
      'received',
      'pending',
      'processed',
      'needs_review',
      'failed',
      'ignored',
      'duplicate',
      'invalid'
    )
  );

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_validation_status_check;

alter table public.integration_webhook_events
  add constraint integration_webhook_events_validation_status_check
  check (validation_status in ('pending', 'valid', 'invalid'));

create index if not exists idx_integration_webhook_events_org_created
  on public.integration_webhook_events (organization_id, created_at desc);

create index if not exists idx_integration_webhook_events_org_route
  on public.integration_webhook_events (organization_id, webhook_route_id, created_at desc);

create index if not exists idx_integration_webhook_events_org_validation_processing
  on public.integration_webhook_events (organization_id, validation_status, processing_status, created_at desc);
