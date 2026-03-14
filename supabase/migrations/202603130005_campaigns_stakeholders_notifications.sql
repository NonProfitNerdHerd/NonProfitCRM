do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'campaign_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.campaign_status as enum ('Active', 'Inactive');
  end if;
end $$;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status public.campaign_status not null default 'Active'::public.campaign_status,
  start_date date,
  end_date date,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

alter table public.membership_types
  add column if not exists membership_length integer,
  add column if not exists length_unit text not null default 'months',
  add column if not exists status text not null default 'active';

update public.membership_types
set membership_length = coalesce(membership_length, default_duration_months, 12)
where membership_length is null;

alter table public.donations
  add column if not exists campaign_id uuid references public.campaigns(id) on delete restrict,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

with generated_campaigns as (
  insert into public.campaigns (organization_id, name, description, status)
  select distinct
    d.organization_id,
    coalesce(nullif(trim(d.campaign), ''), 'General Campaign'),
    'Backfilled from donation campaign value',
    'Active'::public.campaign_status
  from public.donations d
  where d.organization_id is not null
  on conflict (organization_id, name) do update set updated_at = timezone('utc', now())
  returning id, organization_id, name
)
update public.donations d
set campaign_id = c.id
from public.campaigns c
where d.organization_id = c.organization_id
  and c.name = coalesce(nullif(trim(d.campaign), ''), 'General Campaign')
  and d.campaign_id is null;

do $$
begin
  if exists (select 1 from public.donations where campaign_id is null) then
    with fallback as (
      insert into public.campaigns (organization_id, name, description, status)
      select distinct
        organization_id,
        'General Campaign',
        'Auto-created fallback campaign',
        'Active'::public.campaign_status
      from public.donations
      where campaign_id is null
      on conflict (organization_id, name) do update set updated_at = timezone('utc', now())
      returning id, organization_id
    )
    update public.donations d
    set campaign_id = c.id
    from public.campaigns c
    where d.organization_id = c.organization_id
      and c.name = 'General Campaign'
      and d.campaign_id is null;
  end if;
end $$;

alter table public.donations
  alter column campaign_id set not null;

alter table public.projects
  add column if not exists project_start_date date,
  add column if not exists expected_end_date date,
  add column if not exists project_manager_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.project_staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_on_project text not null default 'Team Member',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, user_id)
);

create table if not exists public.project_stakeholders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  stakeholder_name text not null,
  stakeholder_role_title text,
  stakeholder_organization text,
  stakeholder_type text not null default 'External',
  influence_level text,
  interest_level text,
  support_level text,
  engagement_strategy text,
  communication_needs text,
  owner_user_id uuid references auth.users(id) on delete set null,
  contact_info text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  comment_body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.notifications
  add column if not exists notification_type text,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid,
  add column if not exists action_url text;

create index if not exists idx_campaigns_org_status on public.campaigns (organization_id, status, start_date);
create index if not exists idx_campaigns_org_name_trgm on public.campaigns using gin (name gin_trgm_ops);
create index if not exists idx_donations_campaign on public.donations (organization_id, campaign_id, donation_date);
create index if not exists idx_project_staff_project on public.project_staff (organization_id, project_id, user_id);
create index if not exists idx_project_staff_user on public.project_staff (organization_id, user_id);
create index if not exists idx_project_stakeholders_project on public.project_stakeholders (organization_id, project_id);
create index if not exists idx_task_comments_task on public.task_comments (organization_id, task_id, created_at desc);
create index if not exists idx_notifications_user_created on public.notifications (organization_id, recipient_user_id, created_at desc);

create trigger trg_campaigns_updated_at before update on public.campaigns for each row execute function app.set_updated_at();
create trigger trg_project_staff_updated_at before update on public.project_staff for each row execute function app.set_updated_at();
create trigger trg_project_stakeholders_updated_at before update on public.project_stakeholders for each row execute function app.set_updated_at();
create trigger trg_task_comments_updated_at before update on public.task_comments for each row execute function app.set_updated_at();

create or replace function app.can_create_campaigns(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app.user_role_key(org_id), '') in (
    'administrator',
    'executive_staff',
    'executive_leader',
    'staff_non_pii',
    'staff_pii',
    'data_entry'
  );
$$;

create or replace function public.user_role_key(org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select app.user_role_key(org_id);
$$;

create or replace function public.can_create_campaigns(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.can_create_campaigns(org_id);
$$;

create or replace function app.is_project_manager(project_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = project_uuid
      and p.project_manager_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.project_staff ps
    where ps.project_id = project_uuid
      and ps.user_id = auth.uid()
      and lower(ps.role_on_project) = 'project manager'
  );
$$;

create or replace function app.notify_user(
  org_id uuid,
  recipient uuid,
  n_type text,
  n_message text,
  entity_type text,
  entity_id uuid,
  url text,
  actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  insert into public.notifications (
    organization_id,
    recipient_user_id,
    title,
    body,
    status,
    visibility_classification,
    created_by,
    notification_type,
    related_entity_type,
    related_entity_id,
    action_url
  )
  values (
    org_id,
    recipient,
    n_type,
    n_message,
    'unread',
    'staff_public',
    actor,
    n_type,
    entity_type,
    entity_id,
    url
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

alter table public.campaigns enable row level security;
alter table public.project_staff enable row level security;
alter table public.project_stakeholders enable row level security;
alter table public.task_comments enable row level security;

create policy campaigns_select on public.campaigns
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_view_donations')
      or app.has_permission(organization_id, 'can_view_dashboard')
    )
  );

create policy campaigns_insert on public.campaigns
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.can_create_campaigns(organization_id)
    and created_by = auth.uid()
  );

create policy campaigns_update on public.campaigns
  for update
  using (
    app.has_active_membership(organization_id)
    and app.can_create_campaigns(organization_id)
  )
  with check (
    app.has_active_membership(organization_id)
    and app.can_create_campaigns(organization_id)
  );

create policy campaigns_delete on public.campaigns
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.can_create_campaigns(organization_id)
  );

create policy project_staff_select on public.project_staff
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_view_dashboard')
  );

create policy project_staff_manage on public.project_staff
  for all
  using (
    app.has_active_membership(organization_id)
    and (
      app.can_create_projects(organization_id)
      or app.is_project_manager(project_id)
    )
  )
  with check (
    app.has_active_membership(organization_id)
    and (
      app.can_create_projects(organization_id)
      or app.is_project_manager(project_id)
    )
  );

create policy project_stakeholders_select on public.project_stakeholders
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_view_dashboard')
  );

create policy project_stakeholders_manage on public.project_stakeholders
  for all
  using (
    app.has_active_membership(organization_id)
    and (
      app.can_create_projects(organization_id)
      or app.is_project_manager(project_id)
    )
  )
  with check (
    app.has_active_membership(organization_id)
    and (
      app.can_create_projects(organization_id)
      or app.is_project_manager(project_id)
    )
  );

create policy task_comments_select on public.task_comments
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_view_dashboard')
  );

create policy task_comments_insert on public.task_comments
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_view_dashboard')
    and author_user_id = auth.uid()
  );

create policy task_comments_update on public.task_comments
  for update
  using (
    app.has_active_membership(organization_id)
    and (
      author_user_id = auth.uid()
      or app.can_create_projects(organization_id)
    )
  )
  with check (
    app.has_active_membership(organization_id)
    and (
      author_user_id = auth.uid()
      or app.can_create_projects(organization_id)
    )
  );

create policy task_comments_delete on public.task_comments
  for delete
  using (
    app.has_active_membership(organization_id)
    and (
      author_user_id = auth.uid()
      or app.can_create_projects(organization_id)
    )
  );

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_insert_manage on public.notifications;
drop policy if exists notifications_update_manage on public.notifications;
drop policy if exists notifications_delete_manage on public.notifications;

create policy notifications_select on public.notifications
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      recipient_user_id = auth.uid()
      or app.has_permission(organization_id, 'can_view_communications')
      or app.has_permission(organization_id, 'can_manage_users')
    )
  );

create policy notifications_insert on public.notifications
  for insert
  with check (
    app.has_active_membership(organization_id)
    and (
      created_by = auth.uid()
      or created_by is null
    )
  );

create policy notifications_update on public.notifications
  for update
  using (
    app.has_active_membership(organization_id)
    and (
      recipient_user_id = auth.uid()
      or app.has_permission(organization_id, 'can_manage_communications')
    )
  )
  with check (
    app.has_active_membership(organization_id)
    and (
      recipient_user_id = auth.uid()
      or app.has_permission(organization_id, 'can_manage_communications')
    )
  );

create policy notifications_delete on public.notifications
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_communications')
  );

grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.project_staff to authenticated;
grant select, insert, update, delete on public.project_stakeholders to authenticated;
grant select, insert, update, delete on public.task_comments to authenticated;
grant execute on function public.user_role_key(uuid) to authenticated;
grant execute on function public.can_create_campaigns(uuid) to authenticated;
grant execute on function app.can_create_campaigns(uuid) to authenticated;
grant execute on function app.is_project_manager(uuid) to authenticated;
grant execute on function app.notify_user(uuid, uuid, text, text, text, uuid, text, uuid) to authenticated;
