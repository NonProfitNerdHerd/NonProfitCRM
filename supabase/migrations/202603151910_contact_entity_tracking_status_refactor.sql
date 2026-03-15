alter table public.contacts
  add column if not exists entity_type text,
  add column if not exists tracking_status text,
  add column if not exists webconnex_id text;

update public.contacts c
set entity_type = case
  when coalesce(nullif(trim(c.organization_name), ''), '') = '' then 'person'
  else 'organization'
end
where coalesce(c.entity_type, '') = '';

update public.contacts c
set webconnex_id = c.external_source_id
where coalesce(c.webconnex_id, '') = ''
  and lower(coalesce(c.external_source, '')) in ('webconnex', 'givingfuel')
  and coalesce(c.external_source_id, '') <> '';

update public.contacts c
set webconnex_id = refs.external_record_id
from (
  select distinct on (r.organization_id, r.contact_id)
    r.organization_id,
    r.contact_id,
    r.external_record_id
  from public.contact_external_references r
  where lower(coalesce(r.source_system, '')) in ('webconnex', 'givingfuel')
    and coalesce(r.external_record_id, '') <> ''
  order by r.organization_id, r.contact_id, coalesce(r.last_synced_date, r.created_at) desc
) refs
where c.organization_id = refs.organization_id
  and c.id = refs.contact_id
  and coalesce(c.webconnex_id, '') = '';

update public.contacts c
set tracking_status = case
  when coalesce(c.webconnex_id, '') <> '' then 'donor'
  when exists (
    select 1
    from public.donations d
    where d.organization_id = c.organization_id
      and d.contact_id = c.id
    limit 1
  ) then 'donor'
  when lower(coalesce(c.donor_status, '')) in ('active', 'lapsed') then 'donor'
  when lower(coalesce(c.donor_status, '')) = 'inactive' then 'non_lead'
  else 'lead'
end
where coalesce(c.tracking_status, '') = '';

update public.contacts c
set tracking_status = 'donor'
where coalesce(c.webconnex_id, '') <> ''
  and c.tracking_status <> 'donor';

alter table public.contacts
  alter column entity_type set default 'person',
  alter column tracking_status set default 'lead';

update public.contacts
set entity_type = 'person'
where entity_type is null;

update public.contacts
set tracking_status = 'lead'
where tracking_status is null;

alter table public.contacts
  alter column entity_type set not null,
  alter column tracking_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_entity_type_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_entity_type_check
      check (entity_type in ('person', 'organization'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_tracking_status_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_tracking_status_check
      check (tracking_status in ('donor', 'lead', 'non_lead'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_webconnex_donor_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_webconnex_donor_check
      check (coalesce(webconnex_id, '') = '' or tracking_status = 'donor');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_organization_name_required_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_organization_name_required_check
      check (
        entity_type <> 'organization'
        or coalesce(nullif(trim(organization_name), ''), '') <> ''
      );
  end if;
end $$;

create index if not exists idx_contacts_org_entity_tracking_status
  on public.contacts (organization_id, entity_type, tracking_status);

create index if not exists idx_contacts_org_webconnex_id
  on public.contacts (organization_id, webconnex_id);

create or replace function app.apply_contact_classification_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.tracking_status = 'donor' and new.tracking_status <> 'donor' then
    raise exception 'Donor classification cannot be downgraded.';
  end if;

  if new.entity_type is null or btrim(new.entity_type) = '' then
    if coalesce(nullif(trim(new.organization_name), ''), '') = '' then
      new.entity_type := 'person';
    else
      new.entity_type := 'organization';
    end if;
  end if;

  if new.tracking_status is null or btrim(new.tracking_status) = '' then
    new.tracking_status := 'lead';
  end if;

  if coalesce(new.webconnex_id, '') <> '' then
    new.tracking_status := 'donor';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_contacts_classification_defaults on public.contacts;
create trigger trg_contacts_classification_defaults
before insert or update on public.contacts
for each row execute function app.apply_contact_classification_defaults();

drop view if exists public.contacts_safe_view;

create view public.contacts_safe_view
with (security_invoker = true)
as
select
  c.id,
  c.organization_id,
  c.household_id,
  c.portal_user_id,
  c.first_name,
  c.last_name,
  c.preferred_name,
  case
    when app.has_permission(c.organization_id, 'can_view_pii') or c.portal_user_id = auth.uid()
      then c.email
    else null
  end as email,
  case
    when app.has_permission(c.organization_id, 'can_view_pii') or c.portal_user_id = auth.uid()
      then c.phone
    else null
  end as phone,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.alternate_phone
    else null
  end as alternate_phone,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.address_line_1
    else null
  end as address_line_1,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.address_line_2
    else null
  end as address_line_2,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.city
    else null
  end as city,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.state
    else null
  end as state,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.postal_code
    else null
  end as postal_code,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.country
    else null
  end as country,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.birthdate
    else null
  end as birthdate,
  c.entity_type,
  c.tracking_status,
  c.organization_name,
  c.webconnex_id,
  c.donor_status,
  c.member_status,
  c.communication_preferences,
  c.tags,
  c.external_source,
  c.external_source_id,
  c.import_job_id,
  c.created_by,
  c.updated_by,
  c.created_at,
  c.updated_at,
  case
    when app.has_permission(c.organization_id, 'can_view_pii') or c.portal_user_id = auth.uid()
      then c.alternate_email
    else null
  end as alternate_email,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.mailing_address_line_1
    else null
  end as mailing_address_line_1,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.mailing_address_line_2
    else null
  end as mailing_address_line_2,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.mailing_city
    else null
  end as mailing_city,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.mailing_state
    else null
  end as mailing_state,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.mailing_postal_code
    else null
  end as mailing_postal_code,
  c.formal_letter_name,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.mobile_number
    else null
  end as mobile_number,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.emergency_contact
    else null
  end as emergency_contact,
  case
    when app.has_permission(c.organization_id, 'can_view_pii')
      then c.emergency_contact_phone
    else null
  end as emergency_contact_phone
from public.contacts c;
