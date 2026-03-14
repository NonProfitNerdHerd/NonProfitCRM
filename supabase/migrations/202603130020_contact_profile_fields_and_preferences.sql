alter table public.contacts
  add column if not exists formal_letter_name text,
  add column if not exists mobile_number text,
  add column if not exists emergency_contact text,
  add column if not exists emergency_contact_phone text;

alter table public.contacts
  alter column communication_preferences set default '[]'::jsonb;

update public.contacts
set communication_preferences = '[]'::jsonb
where communication_preferences is null;

update public.contacts
set communication_preferences = (
  case
    when jsonb_typeof(communication_preferences) = 'array' then communication_preferences
    when jsonb_typeof(communication_preferences) = 'object' then (
      select coalesce(jsonb_agg(key), '[]'::jsonb)
      from jsonb_each(communication_preferences) kv
      where kv.value = 'true'::jsonb
    )
    else '[]'::jsonb
  end
)
where jsonb_typeof(communication_preferences) is distinct from 'array';

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
