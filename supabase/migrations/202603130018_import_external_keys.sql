alter table public.crm_organizations
  add column if not exists source_platform text,
  add column if not exists external_source_id text;

alter table public.campaigns
  add column if not exists source_platform text,
  add column if not exists external_source_id text;

alter table public.projects
  add column if not exists source_platform text,
  add column if not exists external_source_id text;

alter table public.tasks
  add column if not exists source_platform text,
  add column if not exists external_source_id text;

alter table public.memberships
  add column if not exists source_platform text,
  add column if not exists external_source_id text;

create unique index if not exists uq_crm_organizations_org_source_external
  on public.crm_organizations (organization_id, source_platform, external_source_id)
  where external_source_id is not null and source_platform is not null;

create unique index if not exists uq_campaigns_org_source_external
  on public.campaigns (organization_id, source_platform, external_source_id)
  where external_source_id is not null and source_platform is not null;

create unique index if not exists uq_projects_org_source_external
  on public.projects (organization_id, source_platform, external_source_id)
  where external_source_id is not null and source_platform is not null;

create unique index if not exists uq_tasks_org_source_external
  on public.tasks (organization_id, source_platform, external_source_id)
  where external_source_id is not null and source_platform is not null;

create unique index if not exists uq_memberships_org_source_external
  on public.memberships (organization_id, source_platform, external_source_id)
  where external_source_id is not null and source_platform is not null;
