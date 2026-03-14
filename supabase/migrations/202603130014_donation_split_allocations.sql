create table if not exists public.donation_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  donation_id uuid not null references public.donations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  allocation_amount numeric(12, 2) not null check (allocation_amount > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (donation_id, campaign_id)
);

create index if not exists idx_donation_allocations_org_donation
  on public.donation_allocations (organization_id, donation_id);
create index if not exists idx_donation_allocations_org_campaign
  on public.donation_allocations (organization_id, campaign_id);

create trigger trg_donation_allocations_updated_at
before update on public.donation_allocations
for each row execute function app.set_updated_at();

insert into public.donation_allocations (
  organization_id,
  donation_id,
  campaign_id,
  allocation_amount,
  created_by
)
select
  d.organization_id,
  d.id,
  d.campaign_id,
  d.amount,
  d.created_by
from public.donations d
where d.campaign_id is not null
  and d.amount > 0
on conflict (donation_id, campaign_id) do nothing;

create or replace function app.ensure_default_donation_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.campaign_id is not null and new.amount > 0 then
    insert into public.donation_allocations (
      organization_id,
      donation_id,
      campaign_id,
      allocation_amount,
      created_by
    )
    values (
      new.organization_id,
      new.id,
      new.campaign_id,
      new.amount,
      new.created_by
    )
    on conflict (donation_id, campaign_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ensure_default_donation_allocation on public.donations;
create trigger trg_ensure_default_donation_allocation
after insert on public.donations
for each row execute function app.ensure_default_donation_allocation();

alter table public.donation_allocations enable row level security;

create policy donation_allocations_select on public.donation_allocations
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_view_donations')
  );

create policy donation_allocations_insert on public.donation_allocations
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_create_donations')
  );

create policy donation_allocations_update on public.donation_allocations
  for update
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_donations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_donations')
  );

create policy donation_allocations_delete on public.donation_allocations
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_donations')
  );

grant select, insert, update, delete on public.donation_allocations to authenticated;
