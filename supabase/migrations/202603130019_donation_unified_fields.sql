alter table public.donations
  add column if not exists crm_organization_id uuid references public.crm_organizations(id) on delete set null;

create index if not exists idx_donations_org_crm_organization
  on public.donations (organization_id, crm_organization_id, donation_date desc);
