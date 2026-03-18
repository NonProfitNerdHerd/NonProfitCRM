create table if not exists public.project_closeout_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  note_type text not null check (note_type in ('improve', 'sustain')),
  note_body text not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_closeout_notes_tenant_org_match check (tenant_id = organization_id)
);

create index if not exists idx_project_closeout_notes_project
  on public.project_closeout_notes (organization_id, project_id, note_type, created_at desc);

drop trigger if exists trg_project_closeout_notes_updated_at on public.project_closeout_notes;
create trigger trg_project_closeout_notes_updated_at
before update on public.project_closeout_notes
for each row execute function app.set_updated_at();

alter table public.project_closeout_notes enable row level security;

drop policy if exists project_closeout_notes_select on public.project_closeout_notes;
create policy project_closeout_notes_select on public.project_closeout_notes
for select using (
  app.has_active_membership(organization_id)
  and app.has_permission(organization_id, 'can_view_dashboard')
);

drop policy if exists project_closeout_notes_manage on public.project_closeout_notes;
create policy project_closeout_notes_manage on public.project_closeout_notes
for all using (
  app.has_active_membership(organization_id)
  and app.can_create_projects(organization_id)
) with check (
  app.has_active_membership(organization_id)
  and app.can_create_projects(organization_id)
);

grant select, insert, update, delete on public.project_closeout_notes to authenticated;
