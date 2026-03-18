create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  expense_type text not null,
  amount numeric(12,2) not null,
  entry_date date not null default (timezone('utc', now()))::date,
  description text,
  campaign_id uuid references public.campaigns(id),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_expenses_tenant_org_match check (tenant_id = organization_id),
  constraint project_expenses_type_check check (expense_type in ('debit', 'credit')),
  constraint project_expenses_amount_check check (amount > 0),
  constraint project_expenses_credit_campaign_check check (
    (expense_type = 'credit' and campaign_id is not null) or
    (expense_type = 'debit' and campaign_id is null)
  )
);

create index if not exists idx_project_expenses_project_date
  on public.project_expenses (organization_id, project_id, entry_date desc, created_at desc);
create index if not exists idx_project_expenses_campaign
  on public.project_expenses (organization_id, campaign_id);

drop trigger if exists trg_project_expenses_updated_at on public.project_expenses;
create trigger trg_project_expenses_updated_at
before update on public.project_expenses
for each row execute function app.set_updated_at();

alter table public.project_expenses enable row level security;

drop policy if exists project_expenses_select on public.project_expenses;
create policy project_expenses_select on public.project_expenses
for select using (
  app.has_active_membership(organization_id)
  and app.has_permission(organization_id, 'can_view_dashboard')
);

drop policy if exists project_expenses_manage on public.project_expenses;
create policy project_expenses_manage on public.project_expenses
for all using (
  app.has_active_membership(organization_id)
  and app.can_create_projects(organization_id)
) with check (
  app.has_active_membership(organization_id)
  and app.can_create_projects(organization_id)
);

grant select, insert, update, delete on public.project_expenses to authenticated;
