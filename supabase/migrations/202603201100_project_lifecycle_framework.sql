do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'project_lifecycle_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.project_lifecycle_status as enum (
      'idea',
      'under_review',
      'approved',
      'planning',
      'active',
      'on_hold',
      'completed',
      'cancelled',
      'archived'
    );
  end if;
end $$;

alter table public.projects
  add column if not exists tenant_id uuid,
  add column if not exists lifecycle_status public.project_lifecycle_status not null default 'idea',
  add column if not exists problem_statement text,
  add column if not exists business_justification text,
  add column if not exists expected_outcomes text,
  add column if not exists success_criteria text,
  add column if not exists rough_cost_estimate numeric(12,2),
  add column if not exists rough_time_estimate_weeks numeric(8,2),
  add column if not exists strategic_alignment text,
  add column if not exists requestor_name text,
  add column if not exists executive_sponsor_name text,
  add column if not exists score_impact integer,
  add column if not exists score_effort integer,
  add column if not exists score_risk integer,
  add column if not exists guardrail_bypass_acknowledged boolean not null default false,
  add column if not exists guardrail_bypass_note text;

update public.projects
set tenant_id = organization_id
where tenant_id is null;

alter table public.projects
  alter column tenant_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_tenant_fk'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_tenant_fk
      foreign key (tenant_id) references public.organizations(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_score_impact_range'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_score_impact_range
      check (score_impact between 1 and 5 or score_impact is null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_score_effort_range'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_score_effort_range
      check (score_effort between 1 and 5 or score_effort is null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_score_risk_range'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_score_risk_range
      check (score_risk between 1 and 5 or score_risk is null);
  end if;
end $$;

create table if not exists public.project_scopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  in_scope text,
  out_of_scope text not null default '',
  assumptions text,
  constraints text,
  dependencies text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id),
  constraint project_scopes_tenant_org_match check (tenant_id = organization_id)
);

create table if not exists public.project_scope_change_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  change_summary text not null,
  change_reason text,
  impact_summary text,
  requested_by text,
  approved_by text,
  effective_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_scope_change_log_tenant_org_match check (tenant_id = organization_id)
);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_name text not null,
  description text,
  due_date date,
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending',
  percent_complete integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_milestones_tenant_org_match check (tenant_id = organization_id),
  constraint project_milestones_percent_range check (percent_complete between 0 and 100)
);

create table if not exists public.project_risks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  risk_title text not null,
  risk_description text,
  likelihood integer,
  impact integer,
  mitigation_plan text,
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'open',
  target_resolution_date date,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_risks_tenant_org_match check (tenant_id = organization_id),
  constraint project_risks_likelihood_range check (likelihood between 1 and 5 or likelihood is null),
  constraint project_risks_impact_range check (impact between 1 and 5 or impact is null)
);

create table if not exists public.project_budget (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  approved_budget numeric(12,2) not null default 0,
  forecasted_spend numeric(12,2) not null default 0,
  actual_spend numeric(12,2) not null default 0,
  variance numeric(12,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id),
  constraint project_budget_tenant_org_match check (tenant_id = organization_id)
);

create table if not exists public.project_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  resource_name text not null,
  role_name text,
  allocation_percent numeric(5,2),
  planned_hours numeric(8,2),
  actual_hours numeric(8,2),
  cost_rate numeric(10,2),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_resources_tenant_org_match check (tenant_id = organization_id),
  constraint project_resources_allocation_range check (
    allocation_percent is null or (allocation_percent >= 0 and allocation_percent <= 100)
  )
);

create table if not exists public.project_decision_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  decision_summary text not null,
  decision_details text,
  decided_at timestamptz not null default timezone('utc', now()),
  decided_by_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_decision_log_tenant_org_match check (tenant_id = organization_id)
);

create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  update_title text not null,
  update_body text not null,
  health_status text not null default 'on_track',
  published_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_updates_tenant_org_match check (tenant_id = organization_id)
);

create table if not exists public.project_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  final_outcome_summary text,
  met_success_criteria boolean,
  budget_variance_explanation text,
  lessons_learned text,
  would_do_again text,
  review_completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id),
  constraint project_reviews_tenant_org_match check (tenant_id = organization_id)
);

alter table public.tasks
  add column if not exists tenant_id uuid,
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists estimated_hours numeric(8,2),
  add column if not exists actual_hours numeric(8,2),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists percent_complete integer not null default 0,
  add column if not exists blocking_note text,
  add column if not exists milestone_id uuid references public.project_milestones(id) on delete set null;

update public.tasks
set tenant_id = organization_id
where tenant_id is null;

update public.tasks
set owner_user_id = coalesce(owner_user_id, assigned_to, created_by)
where owner_user_id is null;

alter table public.tasks
  alter column tenant_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_tenant_fk'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_tenant_fk
      foreign key (tenant_id) references public.organizations(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_percent_complete_range'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_percent_complete_range
      check (percent_complete between 0 and 100);
  end if;
end $$;

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  prerequisite_task_id uuid not null references public.tasks(id) on delete cascade,
  dependency_type text not null default 'blocks',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (task_id, prerequisite_task_id),
  constraint task_dependencies_tenant_org_match check (tenant_id = organization_id),
  constraint task_dependencies_self_reference_check check (task_id <> prerequisite_task_id)
);

create index if not exists idx_projects_lifecycle_status
  on public.projects (organization_id, lifecycle_status);
create index if not exists idx_project_scopes_project
  on public.project_scopes (organization_id, project_id);
create index if not exists idx_scope_change_log_project
  on public.project_scope_change_log (organization_id, project_id, created_at desc);
create index if not exists idx_project_milestones_project
  on public.project_milestones (organization_id, project_id, due_date);
create index if not exists idx_project_risks_project
  on public.project_risks (organization_id, project_id, status);
create index if not exists idx_project_budget_project
  on public.project_budget (organization_id, project_id);
create index if not exists idx_project_resources_project
  on public.project_resources (organization_id, project_id);
create index if not exists idx_project_decision_log_project
  on public.project_decision_log (organization_id, project_id, decided_at desc);
create index if not exists idx_project_updates_project
  on public.project_updates (organization_id, project_id, published_at desc);
create index if not exists idx_project_reviews_project
  on public.project_reviews (organization_id, project_id);
create index if not exists idx_tasks_project_owner
  on public.tasks (organization_id, project_id, owner_user_id, due_date);
create index if not exists idx_tasks_project_milestone
  on public.tasks (organization_id, project_id, milestone_id);
create index if not exists idx_task_dependencies_task
  on public.task_dependencies (organization_id, task_id, prerequisite_task_id);
create index if not exists idx_task_dependencies_prereq
  on public.task_dependencies (organization_id, prerequisite_task_id, task_id);

drop trigger if exists trg_project_scopes_updated_at on public.project_scopes;
create trigger trg_project_scopes_updated_at
before update on public.project_scopes
for each row execute function app.set_updated_at();

drop trigger if exists trg_project_scope_change_log_updated_at on public.project_scope_change_log;
create trigger trg_project_scope_change_log_updated_at
before update on public.project_scope_change_log
for each row execute function app.set_updated_at();

drop trigger if exists trg_project_milestones_updated_at on public.project_milestones;
create trigger trg_project_milestones_updated_at
before update on public.project_milestones
for each row execute function app.set_updated_at();

drop trigger if exists trg_project_risks_updated_at on public.project_risks;
create trigger trg_project_risks_updated_at
before update on public.project_risks
for each row execute function app.set_updated_at();

drop trigger if exists trg_project_budget_updated_at on public.project_budget;
create trigger trg_project_budget_updated_at
before update on public.project_budget
for each row execute function app.set_updated_at();

drop trigger if exists trg_project_resources_updated_at on public.project_resources;
create trigger trg_project_resources_updated_at
before update on public.project_resources
for each row execute function app.set_updated_at();

drop trigger if exists trg_project_decision_log_updated_at on public.project_decision_log;
create trigger trg_project_decision_log_updated_at
before update on public.project_decision_log
for each row execute function app.set_updated_at();

drop trigger if exists trg_project_updates_updated_at on public.project_updates;
create trigger trg_project_updates_updated_at
before update on public.project_updates
for each row execute function app.set_updated_at();

drop trigger if exists trg_project_reviews_updated_at on public.project_reviews;
create trigger trg_project_reviews_updated_at
before update on public.project_reviews
for each row execute function app.set_updated_at();

drop trigger if exists trg_task_dependencies_updated_at on public.task_dependencies;
create trigger trg_task_dependencies_updated_at
before update on public.task_dependencies
for each row execute function app.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_scopes',
    'project_scope_change_log',
    'project_milestones',
    'project_risks',
    'project_budget',
    'project_resources',
    'project_decision_log',
    'project_updates',
    'project_reviews',
    'task_dependencies'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);

    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format(
      'create policy %I_select on public.%I for select using (
         app.has_active_membership(organization_id)
         and app.has_permission(organization_id, ''can_view_dashboard'')
       )',
      table_name,
      table_name
    );

    execute format('drop policy if exists %I_manage on public.%I', table_name, table_name);
    execute format(
      'create policy %I_manage on public.%I for all using (
         app.has_active_membership(organization_id)
         and app.can_create_projects(organization_id)
       ) with check (
         app.has_active_membership(organization_id)
         and app.can_create_projects(organization_id)
       )',
      table_name,
      table_name
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end
$$;
