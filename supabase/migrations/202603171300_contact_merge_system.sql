insert into public.permissions (key, name, description, category)
values (
  'can_merge_contacts',
  'Merge Contacts',
  'Review duplicate contacts and execute safe contact merge operations',
  'contacts'
)
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

with role_permission_map as (
  select 'administrator'::text as role_key, 'can_merge_contacts'::text as permission_key
  union all
  select 'data_steward', 'can_merge_contacts'
  union all
  select 'data_administrator', 'can_merge_contacts'
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

alter table public.contacts
  add column if not exists is_merged boolean not null default false,
  add column if not exists merged_into_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by uuid references auth.users(id) on delete set null;

create index if not exists idx_contacts_org_is_merged
  on public.contacts (organization_id, is_merged, updated_at desc);

create table if not exists public.contact_external_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source_system text not null,
  external_id text not null,
  external_type text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint contact_external_ids_source_not_blank check (length(trim(source_system)) > 0),
  constraint contact_external_ids_external_not_blank check (length(trim(external_id)) > 0)
);

create unique index if not exists idx_contact_external_ids_unique_active
  on public.contact_external_ids (organization_id, source_system, external_id)
  where is_active = true;

create index if not exists idx_contact_external_ids_contact
  on public.contact_external_ids (organization_id, contact_id, is_active);

create index if not exists idx_contact_external_ids_lookup
  on public.contact_external_ids (organization_id, source_system, external_id);

create table if not exists public.contact_merge_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  master_contact_id uuid not null references public.contacts(id) on delete restrict,
  duplicate_contact_id uuid not null references public.contacts(id) on delete restrict,
  merged_by uuid references auth.users(id) on delete set null,
  merged_at timestamptz not null default timezone('utc', now()),
  before_master jsonb not null default '{}'::jsonb,
  before_duplicate jsonb not null default '{}'::jsonb,
  after_master jsonb not null default '{}'::jsonb,
  reassigned_counts jsonb not null default '{}'::jsonb,
  resolved_field_map jsonb not null default '{}'::jsonb,
  merge_source text not null default 'manual_ui'
);

create index if not exists idx_contact_merge_history_org_merged_at
  on public.contact_merge_history (organization_id, merged_at desc);
create index if not exists idx_contact_merge_history_org_master
  on public.contact_merge_history (organization_id, master_contact_id, merged_at desc);
create index if not exists idx_contact_merge_history_org_duplicate
  on public.contact_merge_history (organization_id, duplicate_contact_id, merged_at desc);

create or replace function app.normalize_external_id_value(value text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(value, '')));
$$;

create or replace function app.normalize_email(value text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(value, '')));
$$;

create or replace function app.normalize_phone_digits(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(value, ''), '[^0-9]+', '', 'g');
$$;

create or replace function app.normalize_name_token(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(trim(coalesce(value, ''))), '\s+', ' ', 'g');
$$;

create or replace function app.normalize_address_token(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g');
$$;

create or replace function app.normalize_contact_external_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.source_system := app.normalize_external_id_value(new.source_system);
  new.external_id := app.normalize_external_id_value(new.external_id);
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_contact_external_ids_normalize on public.contact_external_ids;
create trigger trg_contact_external_ids_normalize
before insert or update on public.contact_external_ids
for each row execute function app.normalize_contact_external_id();

create index if not exists idx_contacts_org_norm_email_active
  on public.contacts (organization_id, app.normalize_email(email))
  where coalesce(is_merged, false) = false and email is not null;

create index if not exists idx_contacts_org_norm_phone_active
  on public.contacts (organization_id, app.normalize_phone_digits(phone))
  where coalesce(is_merged, false) = false and phone is not null;

create index if not exists idx_contacts_org_norm_name_active
  on public.contacts (
    organization_id,
    app.normalize_name_token(first_name),
    app.normalize_name_token(last_name)
  )
  where coalesce(is_merged, false) = false;

create or replace function public.resolve_contact_by_external_id(
  org_id uuid,
  source text,
  external text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved_id uuid;
begin
  if org_id is null or coalesce(trim(source), '') = '' or coalesce(trim(external), '') = '' then
    return null;
  end if;

  select cei.contact_id
  into resolved_id
  from public.contact_external_ids cei
  where cei.organization_id = org_id
    and cei.is_active = true
    and cei.source_system = app.normalize_external_id_value(source)
    and cei.external_id = app.normalize_external_id_value(external)
  limit 1;

  if resolved_id is not null then
    return resolved_id;
  end if;

  select c.id
  into resolved_id
  from public.contacts c
  where c.organization_id = org_id
    and coalesce(c.is_merged, false) = false
    and app.normalize_external_id_value(c.external_source) = app.normalize_external_id_value(source)
    and app.normalize_external_id_value(c.external_source_id) = app.normalize_external_id_value(external)
  limit 1;

  return resolved_id;
end;
$$;

create or replace function public.execute_contact_merge(
  org_id uuid,
  master_contact_id uuid,
  duplicate_contact_id uuid,
  resolved_field_map jsonb default '{}'::jsonb,
  action_source text default 'manual_ui'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  master_before public.contacts%rowtype;
  duplicate_before public.contacts%rowtype;
  master_after public.contacts%rowtype;
  now_utc timestamptz := timezone('utc', now());

  notes_reassigned integer := 0;
  tasks_reassigned integer := 0;
  activity_reassigned integer := 0;
  donations_reassigned integer := 0;
  memberships_reassigned integer := 0;
  communications_reassigned integer := 0;
  notifications_reassigned integer := 0;
  ext_ref_reassigned integer := 0;
  external_ids_preserved integer := 0;
  tags_reassigned integer := 0;
  links_reassigned integer := 0;
  emails_reassigned integer := 0;
  phones_reassigned integer := 0;
  relationships_reassigned integer := 0;

  merged_tags text[] := '{}'::text[];
  merged_comm_pref jsonb := '[]'::jsonb;
begin
  if master_contact_id is null or duplicate_contact_id is null then
    raise exception 'Both master and duplicate contact ids are required';
  end if;
  if master_contact_id = duplicate_contact_id then
    raise exception 'Master and duplicate contact ids must be different';
  end if;
  if actor_id is null then
    raise exception 'Authenticated user is required to merge contacts';
  end if;
  if not app.has_permission(org_id, 'can_merge_contacts') then
    raise exception 'You do not have permission to merge contacts';
  end if;

  select * into master_before
  from public.contacts
  where organization_id = org_id and id = master_contact_id
  for update;
  if master_before.id is null then
    raise exception 'Master contact was not found';
  end if;

  select * into duplicate_before
  from public.contacts
  where organization_id = org_id and id = duplicate_contact_id
  for update;
  if duplicate_before.id is null then
    raise exception 'Duplicate contact was not found';
  end if;

  if coalesce(master_before.is_merged, false) then
    raise exception 'Master contact is already merged into another record';
  end if;
  if coalesce(duplicate_before.is_merged, false) then
    raise exception 'Duplicate contact has already been merged';
  end if;

  merged_tags := (
    select coalesce(array_agg(distinct tag_value order by tag_value), '{}'::text[])
    from unnest(coalesce(master_before.tags, '{}'::text[]) || coalesce(duplicate_before.tags, '{}'::text[])) tag_value
    where coalesce(trim(tag_value), '') <> ''
  );

  merged_comm_pref := (
    with merged as (
      select distinct value
      from jsonb_array_elements_text(
        coalesce(master_before.communication_preferences, '[]'::jsonb) ||
        coalesce(duplicate_before.communication_preferences, '[]'::jsonb)
      ) value
      where coalesce(trim(value), '') <> ''
    )
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
    from merged
  );

  update public.contacts
  set
    first_name = coalesce(nullif(trim(resolved_field_map->>'first_name'), ''), master_before.first_name, duplicate_before.first_name),
    last_name = coalesce(nullif(trim(resolved_field_map->>'last_name'), ''), master_before.last_name, duplicate_before.last_name),
    preferred_name = coalesce(nullif(trim(resolved_field_map->>'preferred_name'), ''), master_before.preferred_name, duplicate_before.preferred_name),
    organization_name = coalesce(nullif(trim(resolved_field_map->>'organization_name'), ''), master_before.organization_name, duplicate_before.organization_name),
    email = coalesce(nullif(trim(resolved_field_map->>'email'), ''), master_before.email, duplicate_before.email),
    alternate_email = coalesce(nullif(trim(resolved_field_map->>'alternate_email'), ''), master_before.alternate_email, duplicate_before.alternate_email),
    phone = coalesce(nullif(trim(resolved_field_map->>'phone'), ''), master_before.phone, duplicate_before.phone),
    alternate_phone = coalesce(nullif(trim(resolved_field_map->>'alternate_phone'), ''), master_before.alternate_phone, duplicate_before.alternate_phone),
    mobile_number = coalesce(nullif(trim(resolved_field_map->>'mobile_number'), ''), master_before.mobile_number, duplicate_before.mobile_number),
    address_line_1 = coalesce(nullif(trim(resolved_field_map->>'address_line_1'), ''), master_before.address_line_1, duplicate_before.address_line_1),
    address_line_2 = coalesce(nullif(trim(resolved_field_map->>'address_line_2'), ''), master_before.address_line_2, duplicate_before.address_line_2),
    city = coalesce(nullif(trim(resolved_field_map->>'city'), ''), master_before.city, duplicate_before.city),
    state = coalesce(nullif(trim(resolved_field_map->>'state'), ''), master_before.state, duplicate_before.state),
    postal_code = coalesce(nullif(trim(resolved_field_map->>'postal_code'), ''), master_before.postal_code, duplicate_before.postal_code),
    formal_letter_name = coalesce(nullif(trim(resolved_field_map->>'formal_letter_name'), ''), master_before.formal_letter_name, duplicate_before.formal_letter_name),
    communication_preferences = coalesce(resolved_field_map->'communication_preferences', merged_comm_pref),
    tags = merged_tags,
    updated_by = actor_id,
    updated_at = now_utc
  where organization_id = org_id and id = master_contact_id;

  update public.notes
  set contact_id = master_contact_id
  where organization_id = org_id and contact_id = duplicate_contact_id;
  get diagnostics notes_reassigned = row_count;

  update public.tasks
  set contact_id = master_contact_id
  where organization_id = org_id and contact_id = duplicate_contact_id;
  get diagnostics tasks_reassigned = row_count;

  update public.activity_log
  set related_contact_id = master_contact_id
  where organization_id = org_id and related_contact_id = duplicate_contact_id;
  get diagnostics activity_reassigned = row_count;

  update public.donations
  set contact_id = master_contact_id
  where organization_id = org_id and contact_id = duplicate_contact_id;
  get diagnostics donations_reassigned = row_count;

  update public.memberships
  set contact_id = master_contact_id
  where organization_id = org_id and contact_id = duplicate_contact_id;
  get diagnostics memberships_reassigned = row_count;

  update public.communication_log
  set contact_id = master_contact_id
  where organization_id = org_id and contact_id = duplicate_contact_id;
  get diagnostics communications_reassigned = row_count;

  update public.notifications
  set contact_id = master_contact_id
  where organization_id = org_id and contact_id = duplicate_contact_id;
  get diagnostics notifications_reassigned = row_count;

  insert into public.contact_emails (organization_id, contact_id, email, label, is_primary)
  select organization_id, master_contact_id, email, label, is_primary
  from public.contact_emails
  where organization_id = org_id and contact_id = duplicate_contact_id
  on conflict (organization_id, contact_id, email) do nothing;
  get diagnostics emails_reassigned = row_count;
  delete from public.contact_emails
  where organization_id = org_id and contact_id = duplicate_contact_id;

  insert into public.contact_phones (organization_id, contact_id, phone, label, is_primary)
  select organization_id, master_contact_id, phone, label, is_primary
  from public.contact_phones
  where organization_id = org_id and contact_id = duplicate_contact_id
  on conflict (organization_id, contact_id, phone) do nothing;
  get diagnostics phones_reassigned = row_count;
  delete from public.contact_phones
  where organization_id = org_id and contact_id = duplicate_contact_id;

  insert into public.contact_organization_links (organization_id, contact_id, crm_organization_id, relationship_type)
  select organization_id, master_contact_id, crm_organization_id, relationship_type
  from public.contact_organization_links
  where organization_id = org_id and contact_id = duplicate_contact_id
  on conflict (organization_id, contact_id, crm_organization_id) do nothing;
  get diagnostics links_reassigned = row_count;
  delete from public.contact_organization_links
  where organization_id = org_id and contact_id = duplicate_contact_id;

  insert into public.contact_tags (organization_id, contact_id, tag_id, assigned_by, assigned_at, assignment_source, notes)
  select organization_id, master_contact_id, tag_id, assigned_by, assigned_at, assignment_source, notes
  from public.contact_tags
  where organization_id = org_id and contact_id = duplicate_contact_id
  on conflict (organization_id, contact_id, tag_id) do nothing;
  get diagnostics tags_reassigned = row_count;
  delete from public.contact_tags
  where organization_id = org_id and contact_id = duplicate_contact_id;

  insert into public.contact_relationships (
    organization_id,
    contact_id,
    related_contact_id,
    relationship_type,
    relationship_label,
    start_date,
    end_date,
    created_at,
    updated_at
  )
  select
    organization_id,
    case when contact_id = duplicate_contact_id then master_contact_id else contact_id end,
    case when related_contact_id = duplicate_contact_id then master_contact_id else related_contact_id end,
    relationship_type,
    relationship_label,
    start_date,
    end_date,
    created_at,
    now_utc
  from public.contact_relationships
  where organization_id = org_id
    and (contact_id = duplicate_contact_id or related_contact_id = duplicate_contact_id)
    and case when contact_id = duplicate_contact_id then master_contact_id else contact_id end <>
        case when related_contact_id = duplicate_contact_id then master_contact_id else related_contact_id end
  on conflict (organization_id, contact_id, related_contact_id, relationship_type) do nothing;
  get diagnostics relationships_reassigned = row_count;
  delete from public.contact_relationships
  where organization_id = org_id
    and (contact_id = duplicate_contact_id or related_contact_id = duplicate_contact_id);

  update public.households
  set primary_contact_id = master_contact_id
  where organization_id = org_id
    and primary_contact_id = duplicate_contact_id;

  insert into public.contact_external_ids (
    organization_id,
    contact_id,
    source_system,
    external_id,
    external_type,
    is_primary,
    is_active,
    created_by,
    updated_by
  )
  select organization_id, master_contact_id, source_system, external_id, external_type, is_primary, true, actor_id, actor_id
  from public.contact_external_ids
  where organization_id = org_id
    and contact_id in (master_contact_id, duplicate_contact_id)
    and is_active = true
  on conflict (organization_id, source_system, external_id) where is_active = true
  do update set
    contact_id = excluded.contact_id,
    updated_at = now_utc,
    updated_by = actor_id;
  get diagnostics external_ids_preserved = row_count;

  insert into public.contact_external_ids (
    organization_id,
    contact_id,
    source_system,
    external_id,
    external_type,
    is_primary,
    is_active,
    created_by,
    updated_by
  )
  select org_id, master_contact_id, source_system, external_id, external_type, is_primary, true, actor_id, actor_id
  from (
    select coalesce(nullif(trim(master_before.external_source), ''), 'legacy_contact') as source_system,
           nullif(trim(master_before.external_source_id), '') as external_id,
           'legacy_contact_field'::text as external_type,
           true as is_primary
    union all
    select coalesce(nullif(trim(duplicate_before.external_source), ''), 'legacy_contact'),
           nullif(trim(duplicate_before.external_source_id), ''),
           'legacy_contact_field'::text,
           true
    union all
    select 'webconnex', nullif(trim(master_before.webconnex_id), ''), 'webconnex_id', true
    union all
    select 'webconnex', nullif(trim(duplicate_before.webconnex_id), ''), 'webconnex_id', true
  ) src
  where src.external_id is not null
  on conflict (organization_id, source_system, external_id) where is_active = true
  do update set
    contact_id = excluded.contact_id,
    updated_at = now_utc,
    updated_by = actor_id;

  insert into public.contact_external_ids (
    organization_id,
    contact_id,
    source_system,
    external_id,
    external_type,
    is_primary,
    is_active,
    created_by,
    updated_by
  )
  select
    cer.organization_id,
    master_contact_id,
    cer.source_system,
    cer.external_record_id,
    coalesce(cer.external_record_type, 'reference'),
    false,
    true,
    actor_id,
    actor_id
  from public.contact_external_references cer
  where cer.organization_id = org_id
    and cer.contact_id in (master_contact_id, duplicate_contact_id)
  on conflict (organization_id, source_system, external_id) where is_active = true
  do update set
    contact_id = excluded.contact_id,
    updated_at = now_utc,
    updated_by = actor_id;

  insert into public.contact_external_references (
    organization_id,
    contact_id,
    source_system,
    external_record_id,
    external_record_type,
    last_source_modified_date,
    last_synced_date,
    created_at,
    updated_at
  )
  select
    organization_id,
    master_contact_id,
    source_system,
    external_record_id,
    external_record_type,
    last_source_modified_date,
    greatest(coalesce(last_synced_date, now_utc), now_utc),
    created_at,
    now_utc
  from public.contact_external_references
  where organization_id = org_id
    and contact_id in (master_contact_id, duplicate_contact_id)
  on conflict (organization_id, source_system, external_record_id)
  do update set
    contact_id = excluded.contact_id,
    external_record_type = excluded.external_record_type,
    last_source_modified_date = excluded.last_source_modified_date,
    last_synced_date = excluded.last_synced_date,
    updated_at = now_utc;
  get diagnostics ext_ref_reassigned = row_count;

  delete from public.contact_external_ids
  where organization_id = org_id
    and contact_id = duplicate_contact_id;

  delete from public.contact_external_references
  where organization_id = org_id
    and contact_id = duplicate_contact_id;

  update public.contacts
  set
    is_merged = true,
    merged_into_contact_id = master_contact_id,
    merged_at = now_utc,
    merged_by = actor_id,
    external_source = null,
    external_source_id = null,
    webconnex_id = null,
    portal_user_id = null,
    updated_by = actor_id,
    updated_at = now_utc
  where organization_id = org_id
    and id = duplicate_contact_id;

  select * into master_after
  from public.contacts
  where organization_id = org_id and id = master_contact_id;

  insert into public.contact_merge_history (
    organization_id,
    master_contact_id,
    duplicate_contact_id,
    merged_by,
    merged_at,
    before_master,
    before_duplicate,
    after_master,
    reassigned_counts,
    resolved_field_map,
    merge_source
  )
  values (
    org_id,
    master_contact_id,
    duplicate_contact_id,
    actor_id,
    now_utc,
    to_jsonb(master_before),
    to_jsonb(duplicate_before),
    to_jsonb(master_after),
    jsonb_build_object(
      'notes', notes_reassigned,
      'tasks', tasks_reassigned,
      'activity', activity_reassigned,
      'donations', donations_reassigned,
      'memberships', memberships_reassigned,
      'communication_log', communications_reassigned,
      'notifications', notifications_reassigned,
      'contact_emails', emails_reassigned,
      'contact_phones', phones_reassigned,
      'contact_links', links_reassigned,
      'contact_tags', tags_reassigned,
      'contact_relationships', relationships_reassigned,
      'external_references', ext_ref_reassigned,
      'external_ids', external_ids_preserved
    ),
    coalesce(resolved_field_map, '{}'::jsonb),
    coalesce(nullif(trim(action_source), ''), 'manual_ui')
  );

  insert into public.audit_log (
    organization_id,
    actor_user_id,
    action_type,
    target_entity_type,
    target_entity_id,
    metadata
  )
  values (
    org_id,
    actor_id,
    'contact_merged',
    'contacts',
    master_contact_id,
    jsonb_build_object(
      'master_contact_id', master_contact_id,
      'duplicate_contact_id', duplicate_contact_id,
      'action_source', coalesce(nullif(trim(action_source), ''), 'manual_ui')
    )
  );

  return jsonb_build_object(
    'masterContactId', master_contact_id,
    'duplicateContactId', duplicate_contact_id,
    'mergedAt', now_utc,
    'counts', jsonb_build_object(
      'notes', notes_reassigned,
      'tasks', tasks_reassigned,
      'activity', activity_reassigned,
      'donations', donations_reassigned,
      'memberships', memberships_reassigned,
      'communicationLog', communications_reassigned,
      'notifications', notifications_reassigned,
      'contactEmails', emails_reassigned,
      'contactPhones', phones_reassigned,
      'contactLinks', links_reassigned,
      'contactTags', tags_reassigned,
      'contactRelationships', relationships_reassigned,
      'externalReferences', ext_ref_reassigned,
      'externalIds', external_ids_preserved
    )
  );
end;
$$;

insert into public.contact_external_ids (
  organization_id,
  contact_id,
  source_system,
  external_id,
  external_type,
  is_primary,
  is_active
)
select
  c.organization_id,
  c.id,
  app.normalize_external_id_value(c.external_source),
  app.normalize_external_id_value(c.external_source_id),
  'legacy_contact_field',
  true,
  true
from public.contacts c
where coalesce(trim(c.external_source), '') <> ''
  and coalesce(trim(c.external_source_id), '') <> ''
on conflict (organization_id, source_system, external_id) where is_active = true
do nothing;

insert into public.contact_external_ids (
  organization_id,
  contact_id,
  source_system,
  external_id,
  external_type,
  is_primary,
  is_active
)
select
  c.organization_id,
  c.id,
  'webconnex',
  app.normalize_external_id_value(c.webconnex_id),
  'webconnex_id',
  true,
  true
from public.contacts c
where coalesce(trim(c.webconnex_id), '') <> ''
on conflict (organization_id, source_system, external_id) where is_active = true
do nothing;

insert into public.contact_external_ids (
  organization_id,
  contact_id,
  source_system,
  external_id,
  external_type,
  is_primary,
  is_active
)
select
  cer.organization_id,
  cer.contact_id,
  app.normalize_external_id_value(cer.source_system),
  app.normalize_external_id_value(cer.external_record_id),
  coalesce(cer.external_record_type, 'reference'),
  false,
  true
from public.contact_external_references cer
where coalesce(trim(cer.source_system), '') <> ''
  and coalesce(trim(cer.external_record_id), '') <> ''
on conflict (organization_id, source_system, external_id) where is_active = true
do nothing;

alter table public.contact_external_ids enable row level security;
alter table public.contact_merge_history enable row level security;

create policy contact_external_ids_select on public.contact_external_ids
for select
using (
  app.has_active_membership(organization_id)
  and app.has_permission(organization_id, 'can_view_contacts')
);

create policy contact_external_ids_manage on public.contact_external_ids
for all
using (
  app.has_active_membership(organization_id)
  and (
    app.has_permission(organization_id, 'can_edit_contacts')
    or app.has_permission(organization_id, 'can_merge_contacts')
  )
)
with check (
  app.has_active_membership(organization_id)
  and (
    app.has_permission(organization_id, 'can_edit_contacts')
    or app.has_permission(organization_id, 'can_merge_contacts')
  )
);

create policy contact_merge_history_select on public.contact_merge_history
for select
using (
  app.has_active_membership(organization_id)
  and (
    app.has_permission(organization_id, 'can_merge_contacts')
    or app.has_permission(organization_id, 'can_view_contacts')
  )
);

create policy contact_merge_history_insert on public.contact_merge_history
for insert
with check (
  app.has_active_membership(organization_id)
  and app.has_permission(organization_id, 'can_merge_contacts')
);

grant select, insert, update, delete on public.contact_external_ids to authenticated;
grant select, insert on public.contact_merge_history to authenticated;
grant execute on function public.resolve_contact_by_external_id(uuid, text, text) to authenticated;
grant execute on function public.execute_contact_merge(uuid, uuid, uuid, jsonb, text) to authenticated;
