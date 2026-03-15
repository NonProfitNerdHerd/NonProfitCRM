create table if not exists public.sub_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'Active',
  external_page_key text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, campaign_id, name)
);

alter table public.sub_campaigns
  drop constraint if exists sub_campaigns_status_check;

alter table public.sub_campaigns
  add constraint sub_campaigns_status_check
  check (status in ('Active', 'Inactive'));

create index if not exists idx_sub_campaigns_org_campaign_status
  on public.sub_campaigns (organization_id, campaign_id, status);

create index if not exists idx_sub_campaigns_org_external_page_key
  on public.sub_campaigns (organization_id, external_page_key);

drop trigger if exists trg_sub_campaigns_updated_at on public.sub_campaigns;
create trigger trg_sub_campaigns_updated_at
before update on public.sub_campaigns
for each row execute function app.set_updated_at();

alter table public.sub_campaigns enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sub_campaigns'
      and policyname = 'sub_campaigns_manage'
  ) then
    create policy sub_campaigns_manage on public.sub_campaigns
      for all
      using (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_view_donations')
      )
      with check (
        app.has_active_membership(organization_id)
        and app.has_permission(organization_id, 'can_manage_integrations')
      );
  end if;
end $$;

grant select, insert, update, delete on public.sub_campaigns to authenticated;

alter table public.donations
  add column if not exists sub_campaign_id uuid references public.sub_campaigns(id) on delete set null;

create index if not exists idx_donations_org_sub_campaign
  on public.donations (organization_id, sub_campaign_id, donation_date);

create table if not exists public.integration_donation_page_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  external_page_value text not null,
  mapped_campaign_id uuid references public.campaigns(id) on delete set null,
  mapped_sub_campaign_id uuid references public.sub_campaigns(id) on delete set null,
  status text not null default 'unmapped',
  first_detected_at timestamptz not null default timezone('utc', now()),
  last_detected_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, integration_connection_id, external_page_value)
);

alter table public.integration_donation_page_mappings
  drop constraint if exists integration_donation_page_mappings_status_check;

alter table public.integration_donation_page_mappings
  add constraint integration_donation_page_mappings_status_check
  check (status in ('mapped', 'unmapped'));

create index if not exists idx_integration_donation_mappings_org_connection
  on public.integration_donation_page_mappings (organization_id, integration_connection_id);

create index if not exists idx_integration_donation_mappings_org_status
  on public.integration_donation_page_mappings (organization_id, status, last_detected_at desc);

drop trigger if exists trg_integration_donation_page_mappings_updated_at on public.integration_donation_page_mappings;
create trigger trg_integration_donation_page_mappings_updated_at
before update on public.integration_donation_page_mappings
for each row execute function app.set_updated_at();

alter table public.integration_donation_page_mappings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'integration_donation_page_mappings'
      and policyname = 'integration_donation_page_mappings_manage'
  ) then
    create policy integration_donation_page_mappings_manage on public.integration_donation_page_mappings
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

grant select, insert, update, delete on public.integration_donation_page_mappings to authenticated;

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
    'GivingFuel Donations',
    'givingfuel_donations',
    'GivingFuel Donations API synchronization from Webconnex transactions endpoint.',
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
