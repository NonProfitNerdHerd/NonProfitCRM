create extension if not exists pg_trgm;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'donation_payment_type'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.donation_payment_type as enum ('Cash', 'Check', 'Card');
  end if;
end $$;

alter table public.donations
  add column if not exists payment_type public.donation_payment_type default 'Cash',
  add column if not exists check_number text,
  add column if not exists transaction_id text,
  add column if not exists memo text;

update public.donations
set payment_type = case
  when lower(coalesce(payment_method, '')) like '%check%' then 'Check'::public.donation_payment_type
  when lower(coalesce(payment_method, '')) like '%card%' then 'Card'::public.donation_payment_type
  else 'Cash'::public.donation_payment_type
end
where payment_type is null;

alter table public.donations
  alter column payment_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'donations_payment_type_requirements'
      and conrelid = 'public.donations'::regclass
  ) then
    alter table public.donations
      add constraint donations_payment_type_requirements check (
        (payment_type = 'Cash')
        or (payment_type = 'Check' and check_number is not null and length(trim(check_number)) > 0)
        or (payment_type = 'Card' and transaction_id is not null and length(trim(transaction_id)) > 0)
      );
  end if;
end $$;

create table if not exists public.crm_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

create table if not exists public.contact_organization_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  crm_organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  relationship_type text not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, contact_id, crm_organization_id)
);

create table if not exists public.contact_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  email text not null,
  label text not null default 'primary',
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, contact_id, email)
);

create table if not exists public.contact_phones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  phone text not null,
  label text not null default 'primary',
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, contact_id, phone)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  related_contact_id uuid references public.contacts(id) on delete set null,
  action_type text not null,
  action_summary text not null,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.tasks
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade,
  add column if not exists crm_organization_id uuid references public.crm_organizations(id) on delete set null;

create index if not exists idx_contact_emails_org_contact
  on public.contact_emails (organization_id, contact_id);
create index if not exists idx_contact_phones_org_contact
  on public.contact_phones (organization_id, contact_id);
create index if not exists idx_contact_org_links_org_contact
  on public.contact_organization_links (organization_id, contact_id);
create index if not exists idx_contact_org_links_org_org
  on public.contact_organization_links (organization_id, crm_organization_id);
create index if not exists idx_crm_orgs_org_name
  on public.crm_organizations (organization_id, name);
create index if not exists idx_projects_org_status
  on public.projects (organization_id, status);
create index if not exists idx_tasks_org_project
  on public.tasks (organization_id, project_id, due_date);
create index if not exists idx_tasks_org_parent
  on public.tasks (organization_id, parent_task_id);
create index if not exists idx_activity_log_org_contact_created
  on public.activity_log (organization_id, related_contact_id, created_at desc);
create index if not exists idx_activity_log_org_entity_created
  on public.activity_log (organization_id, entity_type, entity_id, created_at desc);

create index if not exists idx_contacts_name_trgm
  on public.contacts using gin ((coalesce(first_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops);
create index if not exists idx_contacts_email_trgm
  on public.contacts using gin (coalesce(email, '') gin_trgm_ops);
create index if not exists idx_contact_emails_email_trgm
  on public.contact_emails using gin (email gin_trgm_ops);
create index if not exists idx_contact_phones_phone_trgm
  on public.contact_phones using gin (phone gin_trgm_ops);
create index if not exists idx_donations_txn_trgm
  on public.donations using gin ((coalesce(transaction_id, '') || ' ' || coalesce(check_number, '')) gin_trgm_ops);
create index if not exists idx_notes_body_trgm
  on public.notes using gin (body gin_trgm_ops);
create index if not exists idx_tasks_text_trgm
  on public.tasks using gin ((coalesce(title, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
create index if not exists idx_crm_orgs_name_trgm
  on public.crm_organizations using gin (name gin_trgm_ops);
create index if not exists idx_projects_name_trgm
  on public.projects using gin (name gin_trgm_ops);

create or replace function app.user_role_key(org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rt.key
  from public.organization_memberships om
  join public.role_templates rt on rt.id = om.role_template_id
  where om.organization_id = org_id
    and om.user_id = auth.uid()
    and om.is_active = true
  limit 1;
$$;

create or replace function app.can_create_projects(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app.user_role_key(org_id), '') in ('administrator', 'executive_staff', 'executive_leader');
$$;

create or replace function public.can_create_projects(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.can_create_projects(org_id);
$$;

create or replace function app.task_effective_status(
  task_status public.task_status,
  suspense_date date,
  completed_at timestamptz
)
returns text
language sql
stable
as $$
  select case
    when completed_at is not null or task_status = 'completed' then 'Completed'
    when suspense_date is not null and suspense_date < current_date then 'Overdue'
    when task_status = 'in_progress' then 'In Progress'
    else 'Open'
  end;
$$;

create or replace function app.rollup_parent_task_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_id uuid;
  total_subtasks integer;
  completed_subtasks integer;
  in_progress_subtasks integer;
begin
  parent_id := coalesce(new.parent_task_id, old.parent_task_id);

  if parent_id is null then
    return coalesce(new, old);
  end if;

  select count(*),
         count(*) filter (where status = 'completed' or completed_at is not null),
         count(*) filter (where status = 'in_progress')
    into total_subtasks, completed_subtasks, in_progress_subtasks
  from public.tasks
  where parent_task_id = parent_id;

  if total_subtasks = 0 then
    return coalesce(new, old);
  end if;

  if completed_subtasks = total_subtasks then
    update public.tasks
    set status = 'completed',
        completed_at = coalesce(completed_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where id = parent_id;
  elsif in_progress_subtasks > 0 then
    update public.tasks
    set status = 'in_progress',
        completed_at = null,
        updated_at = timezone('utc', now())
    where id = parent_id;
  else
    update public.tasks
    set status = 'todo',
        completed_at = null,
        updated_at = timezone('utc', now())
    where id = parent_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_rollup_parent_task_status on public.tasks;
create trigger trg_rollup_parent_task_status
after insert or update or delete on public.tasks
for each row execute function app.rollup_parent_task_status();

create trigger trg_crm_orgs_updated_at before update on public.crm_organizations for each row execute function app.set_updated_at();
create trigger trg_projects_updated_at before update on public.projects for each row execute function app.set_updated_at();

alter table public.crm_organizations enable row level security;
alter table public.contact_organization_links enable row level security;
alter table public.contact_emails enable row level security;
alter table public.contact_phones enable row level security;
alter table public.projects enable row level security;
alter table public.activity_log enable row level security;

create policy crm_organizations_select on public.crm_organizations
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_view_contacts')
      or app.has_permission(organization_id, 'can_view_dashboard')
    )
  );

create policy crm_organizations_manage on public.crm_organizations
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  );

create policy contact_organization_links_select on public.contact_organization_links
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_view_contacts')
  );

create policy contact_organization_links_manage on public.contact_organization_links
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  );

create policy contact_emails_select on public.contact_emails
  for select
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_view_contacts')
    )
    or (
      app.has_active_membership(organization_id)
      and exists (
        select 1
        from public.contacts c
        where c.id = contact_emails.contact_id
          and c.organization_id = contact_emails.organization_id
          and c.portal_user_id = auth.uid()
      )
    )
  );

create policy contact_emails_manage on public.contact_emails
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  );

create policy contact_phones_select on public.contact_phones
  for select
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_view_contacts')
    )
    or (
      app.has_active_membership(organization_id)
      and exists (
        select 1
        from public.contacts c
        where c.id = contact_phones.contact_id
          and c.organization_id = contact_phones.organization_id
          and c.portal_user_id = auth.uid()
      )
    )
  );

create policy contact_phones_manage on public.contact_phones
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  );

create policy projects_select on public.projects
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_view_dashboard')
  );

create policy projects_insert on public.projects
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.can_create_projects(organization_id)
    and created_by = auth.uid()
  );

create policy projects_update on public.projects
  for update
  using (
    app.has_active_membership(organization_id)
    and app.can_create_projects(organization_id)
  )
  with check (
    app.has_active_membership(organization_id)
    and app.can_create_projects(organization_id)
  );

create policy projects_delete on public.projects
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.can_create_projects(organization_id)
  );

create policy activity_log_select on public.activity_log
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_view_contacts')
      or app.has_permission(organization_id, 'can_view_dashboard')
    )
  );

create policy activity_log_insert on public.activity_log
  for insert
  with check (
    app.has_active_membership(organization_id)
    and performed_by_user_id = auth.uid()
  );

grant select, insert, update, delete on public.crm_organizations to authenticated;
grant select, insert, update, delete on public.contact_organization_links to authenticated;
grant select, insert, update, delete on public.contact_emails to authenticated;
grant select, insert, update, delete on public.contact_phones to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert on public.activity_log to authenticated;
grant execute on function public.can_create_projects(uuid) to authenticated;
