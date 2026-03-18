alter table public.projects
  add column if not exists is_system_project boolean not null default false,
  add column if not exists system_key text;

create unique index if not exists uq_projects_org_system_key
  on public.projects (organization_id, system_key)
  where system_key is not null;

create index if not exists idx_projects_org_system_flag
  on public.projects (organization_id, is_system_project);

with seed_rows as (
  select
    o.id as organization_id,
    coalesce(m.user_id, null) as owner_user_id
  from public.organizations o
  left join lateral (
    select om.user_id
    from public.organization_memberships om
    where om.organization_id = o.id
      and om.is_active = true
    order by om.created_at asc nulls last
    limit 1
  ) m on true
)
insert into public.projects (
  tenant_id,
  organization_id,
  name,
  description,
  status,
  lifecycle_status,
  owner_user_id,
  project_manager_user_id,
  created_by,
  is_system_project,
  system_key
)
select
  organization_id,
  organization_id,
  'consituent-outreach',
  'System project for constituent follow-up and outreach tasks.',
  'active',
  'active',
  owner_user_id,
  owner_user_id,
  owner_user_id,
  true,
  'consituent_outreach'
from seed_rows
on conflict (organization_id, name)
do update
set
  description = excluded.description,
  status = excluded.status,
  lifecycle_status = excluded.lifecycle_status,
  is_system_project = true,
  system_key = 'consituent_outreach',
  updated_at = timezone('utc', now());

update public.projects
set
  is_system_project = true,
  system_key = 'consituent_outreach',
  updated_at = timezone('utc', now())
where organization_id is not null
  and lower(trim(name)) = 'consituent-outreach'
  and coalesce(system_key, '') = '';

create or replace function app.prevent_system_project_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_system_project then
    raise exception 'System projects cannot be modified or deleted.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_projects_prevent_system_mutation on public.projects;

create trigger trg_projects_prevent_system_mutation
before update or delete on public.projects
for each row
when (old.is_system_project = true)
execute function app.prevent_system_project_mutation();
