alter table public.organizations
  add column if not exists logo_url text,
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_email text,
  add column if not exists primary_contact_phone text;

update public.organizations o
set
  primary_contact_name = coalesce(o.primary_contact_name, t.primary_contact_name),
  primary_contact_email = coalesce(o.primary_contact_email, t.primary_contact_email),
  primary_contact_phone = coalesce(o.primary_contact_phone, t.primary_contact_phone),
  updated_at = timezone('utc', now())
from public.tenants t
where t.id = o.id
  and (
    o.primary_contact_name is null
    or o.primary_contact_email is null
    or o.primary_contact_phone is null
  );
