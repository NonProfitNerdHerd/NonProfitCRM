alter table public.contacts
  add column if not exists alternate_email text,
  add column if not exists mailing_address_line_1 text,
  add column if not exists mailing_address_line_2 text,
  add column if not exists mailing_city text,
  add column if not exists mailing_state text,
  add column if not exists mailing_postal_code text;

update public.contacts
set
  mailing_address_line_1 = coalesce(mailing_address_line_1, address_line_1),
  mailing_address_line_2 = coalesce(mailing_address_line_2, address_line_2),
  mailing_city = coalesce(mailing_city, city),
  mailing_state = coalesce(mailing_state, state),
  mailing_postal_code = coalesce(mailing_postal_code, postal_code)
where mailing_address_line_1 is null
   or mailing_address_line_2 is null
   or mailing_city is null
   or mailing_state is null
   or mailing_postal_code is null;

create or replace view public.contacts_safe_view
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
  c.organization_name,
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
  end as mailing_postal_code
from public.contacts c;
