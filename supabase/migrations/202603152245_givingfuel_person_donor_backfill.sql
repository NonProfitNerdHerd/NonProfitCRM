update public.contacts c
set
  webconnex_id = c.external_source_id,
  updated_at = timezone('utc', now())
where coalesce(c.webconnex_id, '') = ''
  and lower(coalesce(c.external_source, '')) in ('givingfuel', 'webconnex')
  and coalesce(c.external_source_id, '') <> '';

update public.contacts c
set
  webconnex_id = refs.external_record_id,
  updated_at = timezone('utc', now())
from (
  select distinct on (r.organization_id, r.contact_id)
    r.organization_id,
    r.contact_id,
    r.external_record_id
  from public.contact_external_references r
  where lower(coalesce(r.source_system, '')) in ('givingfuel', 'webconnex')
    and coalesce(r.external_record_id, '') <> ''
  order by r.organization_id, r.contact_id, coalesce(r.last_synced_date, r.created_at) desc
) refs
where c.organization_id = refs.organization_id
  and c.id = refs.contact_id
  and coalesce(c.webconnex_id, '') = '';

update public.contacts c
set
  entity_type = 'person',
  tracking_status = 'donor',
  donor_status = 'active',
  updated_at = timezone('utc', now())
where coalesce(c.webconnex_id, '') <> ''
  and (
    c.entity_type <> 'person'
    or c.tracking_status <> 'donor'
    or coalesce(c.donor_status, '') <> 'active'
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_givingfuel_person_donor_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_givingfuel_person_donor_check
      check (
        coalesce(webconnex_id, '') = ''
        or (entity_type = 'person' and tracking_status = 'donor')
      );
  end if;
end $$;

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

  if coalesce(new.webconnex_id, '') <> '' then
    new.entity_type := 'person';
    new.tracking_status := 'donor';
  else
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
  end if;

  return new;
end;
$$;
