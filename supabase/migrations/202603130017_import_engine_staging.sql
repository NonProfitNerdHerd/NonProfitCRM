alter table public.import_jobs
  add column if not exists import_mode text not null default 'upsert',
  add column if not exists dry_run boolean not null default false,
  add column if not exists rollback_of_job_id uuid references public.import_jobs(id) on delete set null,
  add column if not exists rolled_back_at timestamptz,
  add column if not exists rolled_back_by uuid references auth.users(id) on delete set null,
  add column if not exists rollback_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.import_staging_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_index integer not null,
  source_row jsonb not null default '{}'::jsonb,
  mapped_row jsonb not null default '{}'::jsonb,
  normalized_row jsonb not null default '{}'::jsonb,
  relationship_resolution jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  duplicate_candidates jsonb not null default '[]'::jsonb,
  duplicate_decision text not null default 'pending',
  row_status text not null default 'staged',
  committed_entity_type text,
  committed_entity_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (import_job_id, row_index)
);

create table if not exists public.import_duplicate_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  staging_row_id uuid not null references public.import_staging_rows(id) on delete cascade,
  decision text not null,
  target_entity_id uuid,
  decision_reason text,
  merge_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.import_row_change_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  staging_row_id uuid references public.import_staging_rows(id) on delete set null,
  action_type text not null,
  target_table text not null,
  target_row_id uuid,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  rollback_status text not null default 'not_rolled_back',
  rolled_back_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_import_staging_rows_job_status
  on public.import_staging_rows (organization_id, import_job_id, row_status);
create index if not exists idx_import_duplicate_decisions_job
  on public.import_duplicate_decisions (organization_id, import_job_id);
create index if not exists idx_import_row_change_log_job
  on public.import_row_change_log (organization_id, import_job_id);

create trigger trg_import_staging_rows_updated_at
before update on public.import_staging_rows
for each row execute function app.set_updated_at();

create trigger trg_import_duplicate_decisions_updated_at
before update on public.import_duplicate_decisions
for each row execute function app.set_updated_at();

create trigger trg_import_row_change_log_updated_at
before update on public.import_row_change_log
for each row execute function app.set_updated_at();

alter table public.import_staging_rows enable row level security;
alter table public.import_duplicate_decisions enable row level security;
alter table public.import_row_change_log enable row level security;

create policy import_staging_rows_manage on public.import_staging_rows
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  );

create policy import_duplicate_decisions_manage on public.import_duplicate_decisions
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  );

create policy import_row_change_log_manage on public.import_row_change_log
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  );

grant select, insert, update, delete on public.import_staging_rows to authenticated;
grant select, insert, update, delete on public.import_duplicate_decisions to authenticated;
grant select, insert, update, delete on public.import_row_change_log to authenticated;
