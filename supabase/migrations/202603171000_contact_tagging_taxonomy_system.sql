insert into public.permissions (key, name, description, category)
values
  (
    'can_manage_contact_tags',
    'Manage Contact Tags',
    'Create, update, move, activate, and deactivate contact tags and taxonomy structure',
    'contacts'
  ),
  (
    'can_assign_contact_tags',
    'Assign Contact Tags',
    'Assign and remove tags on contacts through profile and list workflows',
    'contacts'
  ),
  (
    'can_bulk_tag_contacts',
    'Bulk Tag Contacts',
    'Run bulk tag assignment and removal jobs',
    'contacts'
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

with role_permission_map as (
  select 'administrator'::text as role_key, unnest(array[
    'can_manage_contact_tags',
    'can_assign_contact_tags',
    'can_bulk_tag_contacts'
  ]) as permission_key
  union all
  select 'data_steward', unnest(array[
    'can_manage_contact_tags',
    'can_assign_contact_tags',
    'can_bulk_tag_contacts'
  ])
  union all
  select 'data_administrator', unnest(array[
    'can_manage_contact_tags',
    'can_assign_contact_tags',
    'can_bulk_tag_contacts'
  ])
  union all
  select 'executive_staff', unnest(array[
    'can_assign_contact_tags',
    'can_bulk_tag_contacts'
  ])
  union all
  select 'staff_pii', unnest(array[
    'can_assign_contact_tags'
  ])
  union all
  select 'staff_non_pii', unnest(array[
    'can_assign_contact_tags'
  ])
  union all
  select 'data_entry', unnest(array[
    'can_assign_contact_tags'
  ])
),
resolved as (
  select rt.id as role_template_id, p.id as permission_id
  from role_permission_map rpm
  join public.role_templates rt
    on rt.key = rpm.role_key
   and rt.organization_id is null
  join public.permissions p
    on p.key = rpm.permission_key
)
insert into public.role_template_permissions (role_template_id, permission_id)
select role_template_id, permission_id
from resolved
on conflict (role_template_id, permission_id) do nothing;

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  parent_tag_id uuid references public.tags(id) on delete restrict,
  level integer not null default 1,
  path text not null,
  is_active boolean not null default true,
  is_system boolean not null default false,
  color text,
  sort_order integer not null default 0,
  external_key text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint tags_level_bounds check (level between 1 and 4),
  constraint tags_slug_not_empty check (length(trim(slug)) > 0),
  constraint tags_not_self_parent check (parent_tag_id is null or parent_tag_id <> id)
);

create unique index if not exists idx_tags_unique_name_within_parent
  on public.tags (organization_id, coalesce(parent_tag_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create unique index if not exists idx_tags_unique_slug_within_parent
  on public.tags (organization_id, coalesce(parent_tag_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

create index if not exists idx_tags_parent on public.tags (organization_id, parent_tag_id);
create index if not exists idx_tags_slug on public.tags (organization_id, slug);
create index if not exists idx_tags_active on public.tags (organization_id, is_active, sort_order, name);
create index if not exists idx_tags_path on public.tags (organization_id, path);

create table if not exists public.contact_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default timezone('utc', now()),
  assignment_source text not null default 'manual',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint contact_tags_source_valid check (
    assignment_source in ('manual', 'bulk', 'donation_rule', 'api', 'import', 'integration')
  ),
  unique (organization_id, contact_id, tag_id)
);

create index if not exists idx_contact_tags_contact on public.contact_tags (organization_id, contact_id);
create index if not exists idx_contact_tags_tag on public.contact_tags (organization_id, tag_id);

create table if not exists public.tag_assignment_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  initiated_by uuid references auth.users(id) on delete set null,
  job_type text not null,
  tag_ids uuid[] not null,
  source_filter_definition jsonb not null default '{}'::jsonb,
  total_contacts integer not null default 0,
  processed_count integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  status text not null default 'queued',
  error_summary text,
  result_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint tag_assignment_jobs_job_type check (job_type in ('add', 'remove')),
  constraint tag_assignment_jobs_status check (
    status in ('queued', 'previewed', 'running', 'completed', 'failed', 'cancelled')
  ),
  constraint tag_assignment_jobs_tag_ids_non_empty check (coalesce(array_length(tag_ids, 1), 0) > 0)
);

create index if not exists idx_tag_assignment_jobs_org_created
  on public.tag_assignment_jobs (organization_id, created_at desc);
create index if not exists idx_tag_assignment_jobs_org_status
  on public.tag_assignment_jobs (organization_id, status, created_at desc);

create table if not exists public.tag_assignment_job_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.tag_assignment_jobs(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  tag_id uuid references public.tags(id) on delete set null,
  action_taken text not null,
  status text not null default 'success',
  message text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint tag_assignment_job_results_action check (action_taken in ('add', 'remove')),
  constraint tag_assignment_job_results_status check (status in ('success', 'failed', 'skipped'))
);

create index if not exists idx_tag_assignment_job_results_job
  on public.tag_assignment_job_results (organization_id, job_id, created_at desc);

create table if not exists public.tag_sync_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  internal_tag_id uuid not null references public.tags(id) on delete restrict,
  external_system text not null,
  external_tag_identifier text not null,
  sync_direction text not null default 'outbound',
  is_active boolean not null default true,
  mapping_status text not null default 'mapped',
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint tag_sync_mappings_direction check (sync_direction in ('inbound', 'outbound', 'bidirectional')),
  constraint tag_sync_mappings_status check (mapping_status in ('mapped', 'pending', 'error')),
  unique (organization_id, external_system, external_tag_identifier)
);

create index if not exists idx_tag_sync_mappings_org_system
  on public.tag_sync_mappings (organization_id, external_system, is_active);

create or replace function app.slugify_tag(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function app.refresh_tag_subtree_paths(
  org_id uuid,
  root_tag_id uuid,
  root_path text,
  root_level integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  max_level integer := root_level;
begin
  with recursive tree as (
    select
      t.id,
      t.parent_tag_id,
      root_path::text as computed_path,
      root_level::integer as computed_level
    from public.tags t
    where t.organization_id = org_id
      and t.id = root_tag_id
    union all
    select
      child.id,
      child.parent_tag_id,
      tree.computed_path || ' > ' || child.name,
      tree.computed_level + 1
    from public.tags child
    join tree on tree.id = child.parent_tag_id
    where child.organization_id = org_id
  ),
  max_depth as (
    select coalesce(max(computed_level), root_level) as value
    from tree
  ),
  apply_update as (
    update public.tags t
    set
      path = tree.computed_path,
      level = tree.computed_level,
      updated_at = timezone('utc', now())
    from tree
    where t.id = tree.id
      and t.organization_id = org_id
      and (
        t.path is distinct from tree.computed_path
        or t.level is distinct from tree.computed_level
      )
    returning 1
  )
  select value into max_level from max_depth;

  if max_level > 4 then
    raise exception 'Tag hierarchy depth cannot exceed 4 levels';
  end if;
end;
$$;

create or replace function app.tags_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_record public.tags%rowtype;
  subtree_depth integer := 0;
begin
  if coalesce(trim(new.name), '') = '' then
    raise exception 'Tag name is required';
  end if;

  new.name := trim(new.name);
  new.slug := app.slugify_tag(coalesce(nullif(trim(new.slug), ''), new.name));
  if new.slug = '' then
    raise exception 'Tag slug cannot be empty';
  end if;

  if new.parent_tag_id is null then
    new.level := 1;
    new.path := new.name;
  else
    select *
    into parent_record
    from public.tags
    where id = new.parent_tag_id;

    if parent_record.id is null then
      raise exception 'Parent tag was not found';
    end if;
    if parent_record.organization_id <> new.organization_id then
      raise exception 'Parent tag must belong to the same organization';
    end if;

    if tg_op = 'UPDATE' and new.id is not null then
      if exists (
        with recursive ancestors as (
          select p.id, p.parent_tag_id
          from public.tags p
          where p.id = new.parent_tag_id
          union all
          select t.id, t.parent_tag_id
          from public.tags t
          join ancestors a on t.id = a.parent_tag_id
          where t.organization_id = new.organization_id
        )
        select 1
        from ancestors
        where id = new.id
      ) then
        raise exception 'Circular tag hierarchy is not allowed';
      end if;
    end if;

    new.level := parent_record.level + 1;
    new.path := parent_record.path || ' > ' || new.name;
  end if;

  if new.level > 4 then
    raise exception 'Tag hierarchy depth cannot exceed 4 levels';
  end if;

  if tg_op = 'UPDATE' then
    with recursive descendants as (
      select t.id, 1 as depth
      from public.tags t
      where t.organization_id = new.organization_id
        and t.parent_tag_id = new.id
      union all
      select t.id, d.depth + 1
      from public.tags t
      join descendants d on d.id = t.parent_tag_id
      where t.organization_id = new.organization_id
    )
    select coalesce(max(depth), 0)
    into subtree_depth
    from descendants;

    if new.level + subtree_depth > 4 then
      raise exception 'Moving this tag would exceed maximum hierarchy depth of 4';
    end if;
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function app.tags_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform app.refresh_tag_subtree_paths(new.organization_id, new.id, new.path, new.level);
    return new;
  end if;

  if tg_op = 'UPDATE'
    and (
      old.parent_tag_id is distinct from new.parent_tag_id
      or old.name is distinct from new.name
      or old.path is distinct from new.path
      or old.level is distinct from new.level
    ) then
    perform app.refresh_tag_subtree_paths(new.organization_id, new.id, new.path, new.level);
  end if;
  return new;
end;
$$;

create or replace function app.prevent_tag_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.tags child
    where child.organization_id = old.organization_id
      and child.parent_tag_id = old.id
  ) then
    raise exception 'Cannot hard delete tag with child tags. Deactivate it instead.';
  end if;

  if exists (
    select 1
    from public.contact_tags ct
    where ct.organization_id = old.organization_id
      and ct.tag_id = old.id
  ) then
    raise exception 'Cannot hard delete tag with historical contact assignments. Deactivate it instead.';
  end if;

  if exists (
    select 1
    from public.tag_sync_mappings sm
    where sm.organization_id = old.organization_id
      and sm.internal_tag_id = old.id
  ) then
    raise exception 'Cannot hard delete tag with integration mappings. Remove mappings first.';
  end if;

  if exists (
    select 1
    from public.tag_assignment_jobs j
    where j.organization_id = old.organization_id
      and old.id = any(j.tag_ids)
  ) then
    raise exception 'Cannot hard delete tag with bulk job history. Deactivate it instead.';
  end if;

  return old;
end;
$$;

create or replace function app.enforce_contact_tag_org_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contact_org_id uuid;
  tag_org_id uuid;
begin
  select c.organization_id
  into contact_org_id
  from public.contacts c
  where c.id = new.contact_id;

  if contact_org_id is null then
    raise exception 'Contact not found for tag assignment';
  end if;

  select t.organization_id
  into tag_org_id
  from public.tags t
  where t.id = new.tag_id;

  if tag_org_id is null then
    raise exception 'Tag not found for assignment';
  end if;

  if contact_org_id <> new.organization_id or tag_org_id <> new.organization_id then
    raise exception 'Tag assignment organization mismatch';
  end if;

  if new.assigned_by is null then
    new.assigned_by := auth.uid();
  end if;
  if new.assigned_at is null then
    new.assigned_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

create or replace function public.collect_descendant_tag_ids(org_id uuid, input_tag_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select t.id
    from public.tags t
    where t.organization_id = org_id
      and t.id = any(coalesce(input_tag_ids, '{}'::uuid[]))
    union
    select child.id
    from public.tags child
    join tree on tree.id = child.parent_tag_id
    where child.organization_id = org_id
  )
  select coalesce(array_agg(distinct id), '{}'::uuid[])
  from tree;
$$;

create or replace function public.flatten_contact_tag_paths(org_id uuid, contact uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(t.path order by t.path), '{}'::text[])
  from public.contact_tags ct
  join public.tags t on t.id = ct.tag_id
  where ct.organization_id = org_id
    and ct.contact_id = contact;
$$;

create or replace function public.contact_tag_rollup_counts(org_id uuid)
returns table (
  tag_id uuid,
  tag_name text,
  tag_path text,
  level integer,
  direct_contact_count bigint,
  rollup_contact_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with direct_counts as (
    select
      t.id as tag_id,
      count(distinct ct.contact_id) as contact_count
    from public.tags t
    left join public.contact_tags ct
      on ct.organization_id = t.organization_id
     and ct.tag_id = t.id
    where t.organization_id = org_id
    group by t.id
  ),
  recursive_descendants as (
    select t.id as ancestor_id, t.id as descendant_id
    from public.tags t
    where t.organization_id = org_id
    union all
    select rd.ancestor_id, child.id
    from recursive_descendants rd
    join public.tags child
      on child.parent_tag_id = rd.descendant_id
     and child.organization_id = org_id
  )
  select
    t.id as tag_id,
    t.name as tag_name,
    t.path as tag_path,
    t.level,
    coalesce(dc.contact_count, 0) as direct_contact_count,
    coalesce(count(distinct ct.contact_id), 0) as rollup_contact_count
  from public.tags t
  left join direct_counts dc on dc.tag_id = t.id
  left join recursive_descendants rd on rd.ancestor_id = t.id
  left join public.contact_tags ct
    on ct.organization_id = org_id
   and ct.tag_id = rd.descendant_id
  where t.organization_id = org_id
  group by t.id, t.name, t.path, t.level, dc.contact_count
  order by t.path;
$$;

drop trigger if exists trg_tags_before_write on public.tags;
create trigger trg_tags_before_write
before insert or update on public.tags
for each row execute function app.tags_before_write();

drop trigger if exists trg_tags_after_write on public.tags;
create trigger trg_tags_after_write
after insert or update on public.tags
for each row execute function app.tags_after_write();

drop trigger if exists trg_tags_prevent_hard_delete on public.tags;
create trigger trg_tags_prevent_hard_delete
before delete on public.tags
for each row execute function app.prevent_tag_hard_delete();

drop trigger if exists trg_contact_tags_org_consistency on public.contact_tags;
create trigger trg_contact_tags_org_consistency
before insert or update on public.contact_tags
for each row execute function app.enforce_contact_tag_org_consistency();

drop trigger if exists trg_tags_updated_at on public.tags;
create trigger trg_tags_updated_at
before update on public.tags
for each row execute function app.set_updated_at();

drop trigger if exists trg_tag_assignment_jobs_updated_at on public.tag_assignment_jobs;
create trigger trg_tag_assignment_jobs_updated_at
before update on public.tag_assignment_jobs
for each row execute function app.set_updated_at();

drop trigger if exists trg_tag_sync_mappings_updated_at on public.tag_sync_mappings;
create trigger trg_tag_sync_mappings_updated_at
before update on public.tag_sync_mappings
for each row execute function app.set_updated_at();

alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.tag_assignment_jobs enable row level security;
alter table public.tag_assignment_job_results enable row level security;
alter table public.tag_sync_mappings enable row level security;

drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      or app.has_permission(organization_id, 'can_assign_contact_tags')
      or app.has_permission(organization_id, 'can_manage_contact_tags')
      or app.has_permission(organization_id, 'can_bulk_tag_contacts')
    )
  );

drop policy if exists tags_manage on public.tags;
create policy tags_manage on public.tags
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_contact_tags')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_contact_tags')
  );

drop policy if exists contact_tags_select on public.contact_tags;
create policy contact_tags_select on public.contact_tags
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_assign_contact_tags')
      or app.has_permission(organization_id, 'can_manage_contact_tags')
      or app.has_permission(organization_id, 'can_bulk_tag_contacts')
    )
  );

drop policy if exists contact_tags_insert on public.contact_tags;
create policy contact_tags_insert on public.contact_tags
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_assign_contact_tags')
    and coalesce(assigned_by, auth.uid()) = auth.uid()
    and (
      coalesce(app.user_role_key(organization_id), '') <> 'data_entry'
      or exists (
        select 1
        from public.contacts c
        where c.organization_id = contact_tags.organization_id
          and c.id = contact_tags.contact_id
          and c.created_by = auth.uid()
      )
    )
  );

drop policy if exists contact_tags_delete on public.contact_tags;
create policy contact_tags_delete on public.contact_tags
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_assign_contact_tags')
    and (
      coalesce(app.user_role_key(organization_id), '') <> 'data_entry'
      or exists (
        select 1
        from public.contacts c
        where c.organization_id = contact_tags.organization_id
          and c.id = contact_tags.contact_id
          and c.created_by = auth.uid()
      )
    )
  );

drop policy if exists tag_assignment_jobs_select on public.tag_assignment_jobs;
create policy tag_assignment_jobs_select on public.tag_assignment_jobs
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_assign_contact_tags')
      or app.has_permission(organization_id, 'can_bulk_tag_contacts')
    )
  );

drop policy if exists tag_assignment_jobs_insert on public.tag_assignment_jobs;
create policy tag_assignment_jobs_insert on public.tag_assignment_jobs
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_bulk_tag_contacts')
    and coalesce(initiated_by, auth.uid()) = auth.uid()
  );

drop policy if exists tag_assignment_jobs_update on public.tag_assignment_jobs;
create policy tag_assignment_jobs_update on public.tag_assignment_jobs
  for update
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_bulk_tag_contacts')
    and initiated_by = auth.uid()
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_bulk_tag_contacts')
    and initiated_by = auth.uid()
  );

drop policy if exists tag_assignment_job_results_select on public.tag_assignment_job_results;
create policy tag_assignment_job_results_select on public.tag_assignment_job_results
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_assign_contact_tags')
      or app.has_permission(organization_id, 'can_bulk_tag_contacts')
    )
  );

drop policy if exists tag_assignment_job_results_manage on public.tag_assignment_job_results;
create policy tag_assignment_job_results_manage on public.tag_assignment_job_results
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_bulk_tag_contacts')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_bulk_tag_contacts')
  );

drop policy if exists tag_sync_mappings_select on public.tag_sync_mappings;
create policy tag_sync_mappings_select on public.tag_sync_mappings
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_manage_integrations')
      or app.has_permission(organization_id, 'can_manage_contact_tags')
    )
  );

drop policy if exists tag_sync_mappings_manage on public.tag_sync_mappings;
create policy tag_sync_mappings_manage on public.tag_sync_mappings
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.contact_tags to authenticated;
grant select, insert, update, delete on public.tag_assignment_jobs to authenticated;
grant select, insert, update, delete on public.tag_assignment_job_results to authenticated;
grant select, insert, update, delete on public.tag_sync_mappings to authenticated;

grant execute on function public.collect_descendant_tag_ids(uuid, uuid[]) to authenticated;
grant execute on function public.flatten_contact_tag_paths(uuid, uuid) to authenticated;
grant execute on function public.contact_tag_rollup_counts(uuid) to authenticated;
