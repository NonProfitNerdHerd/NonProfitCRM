create or replace function app.can_access_import_center(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app.user_role_key(org_id), '') in ('administrator', 'data_steward');
$$;

create or replace function public.can_access_import_center(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.can_access_import_center(org_id);
$$;

create table if not exists public.contact_custom_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module text not null default 'contacts',
  field_label text not null,
  internal_key text not null,
  data_type text not null default 'text',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint contact_custom_fields_data_type_check
    check (data_type in ('text', 'number', 'date', 'boolean', 'json')),
  constraint contact_custom_fields_internal_key_not_blank
    check (length(trim(internal_key)) > 0)
);

create unique index if not exists idx_contact_custom_fields_unique_key
  on public.contact_custom_fields (organization_id, module, internal_key);

create index if not exists idx_contact_custom_fields_org_module
  on public.contact_custom_fields (organization_id, module, is_active, display_order);

create table if not exists public.contact_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  custom_field_id uuid not null references public.contact_custom_fields(id) on delete cascade,
  value_text text,
  value_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, contact_id, custom_field_id)
);

create index if not exists idx_contact_custom_field_values_contact
  on public.contact_custom_field_values (organization_id, contact_id, custom_field_id);

create table if not exists public.import_center_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_type text not null,
  name text not null,
  mapping_configuration jsonb not null default '[]'::jsonb,
  classification_defaults jsonb not null default '{}'::jsonb,
  tag_configuration jsonb not null default '{}'::jsonb,
  duplicate_handling text not null default 'skip',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_import_center_templates_name
  on public.import_center_templates (organization_id, import_type, lower(name));

create table if not exists public.import_center_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_type text not null,
  file_name text not null,
  template_used uuid references public.import_center_templates(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  status text not null default 'queued',
  total_rows integer not null default 0,
  successful_rows integer not null default 0,
  failed_rows integer not null default 0,
  skipped_rows integer not null default 0,
  new_tags_created integer not null default 0,
  mapping_configuration_snapshot jsonb not null default '{}'::jsonb,
  classification_snapshot jsonb not null default '{}'::jsonb,
  tag_configuration jsonb not null default '{}'::jsonb,
  duplicate_handling text not null default 'skip',
  error_log_location text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_import_center_jobs_org_created
  on public.import_center_jobs (organization_id, created_at desc);

create index if not exists idx_import_center_jobs_status
  on public.import_center_jobs (organization_id, status, started_at desc);

create table if not exists public.import_center_job_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_center_job_id uuid not null references public.import_center_jobs(id) on delete cascade,
  row_index integer not null,
  error_message text not null,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_import_center_job_errors_job
  on public.import_center_job_errors (organization_id, import_center_job_id, row_index);

alter table public.tags
  add column if not exists module text not null default 'contacts';

create index if not exists idx_tags_org_module
  on public.tags (organization_id, module, is_active, sort_order, name);

drop trigger if exists trg_contact_custom_fields_updated_at on public.contact_custom_fields;
create trigger trg_contact_custom_fields_updated_at
before update on public.contact_custom_fields
for each row execute function app.set_updated_at();

drop trigger if exists trg_contact_custom_field_values_updated_at on public.contact_custom_field_values;
create trigger trg_contact_custom_field_values_updated_at
before update on public.contact_custom_field_values
for each row execute function app.set_updated_at();

drop trigger if exists trg_import_center_templates_updated_at on public.import_center_templates;
create trigger trg_import_center_templates_updated_at
before update on public.import_center_templates
for each row execute function app.set_updated_at();

drop trigger if exists trg_import_center_jobs_updated_at on public.import_center_jobs;
create trigger trg_import_center_jobs_updated_at
before update on public.import_center_jobs
for each row execute function app.set_updated_at();

alter table public.contact_custom_fields enable row level security;
alter table public.contact_custom_field_values enable row level security;
alter table public.import_center_templates enable row level security;
alter table public.import_center_jobs enable row level security;
alter table public.import_center_job_errors enable row level security;

drop policy if exists contact_custom_fields_select on public.contact_custom_fields;
create policy contact_custom_fields_select on public.contact_custom_fields
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_view_contacts')
      or app.can_access_import_center(organization_id)
    )
  );

drop policy if exists contact_custom_fields_manage on public.contact_custom_fields;
create policy contact_custom_fields_manage on public.contact_custom_fields
  for all
  using (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  )
  with check (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  );

drop policy if exists contact_custom_field_values_select on public.contact_custom_field_values;
create policy contact_custom_field_values_select on public.contact_custom_field_values
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_view_contacts')
      or app.can_access_import_center(organization_id)
    )
  );

drop policy if exists contact_custom_field_values_manage on public.contact_custom_field_values;
create policy contact_custom_field_values_manage on public.contact_custom_field_values
  for all
  using (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  )
  with check (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  );

drop policy if exists import_center_templates_manage on public.import_center_templates;
create policy import_center_templates_manage on public.import_center_templates
  for all
  using (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  )
  with check (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  );

drop policy if exists import_center_jobs_manage on public.import_center_jobs;
create policy import_center_jobs_manage on public.import_center_jobs
  for all
  using (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  )
  with check (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  );

drop policy if exists import_center_job_errors_manage on public.import_center_job_errors;
create policy import_center_job_errors_manage on public.import_center_job_errors
  for all
  using (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  )
  with check (
    app.has_active_membership(organization_id)
    and app.can_access_import_center(organization_id)
  );

grant select, insert, update, delete on public.contact_custom_fields to authenticated;
grant select, insert, update, delete on public.contact_custom_field_values to authenticated;
grant select, insert, update, delete on public.import_center_templates to authenticated;
grant select, insert, update, delete on public.import_center_jobs to authenticated;
grant select, insert, update, delete on public.import_center_job_errors to authenticated;

grant execute on function app.can_access_import_center(uuid) to authenticated;
grant execute on function public.can_access_import_center(uuid) to authenticated;
