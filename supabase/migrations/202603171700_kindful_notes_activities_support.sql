-- Kindful inbound sync support for notes and activities external identifiers.

create table if not exists public.note_external_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  source_system text not null,
  external_id text not null,
  external_type text,
  raw_source_reference jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.activity_external_ids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_log_id uuid not null references public.activity_log(id) on delete cascade,
  source_system text not null,
  external_id text not null,
  external_type text,
  raw_source_reference jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_note_external_ids_unique_active
  on public.note_external_ids (organization_id, source_system, external_id)
  where is_active = true;

create unique index if not exists idx_activity_external_ids_unique_active
  on public.activity_external_ids (organization_id, source_system, external_id)
  where is_active = true;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_note_external_ids_updated_at'
  ) then
    create trigger trg_note_external_ids_updated_at
    before update on public.note_external_ids
    for each row execute function app.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_activity_external_ids_updated_at'
  ) then
    create trigger trg_activity_external_ids_updated_at
    before update on public.activity_external_ids
    for each row execute function app.set_updated_at();
  end if;
end $$;

alter table public.note_external_ids enable row level security;
alter table public.activity_external_ids enable row level security;

drop policy if exists note_external_ids_manage on public.note_external_ids;
create policy note_external_ids_manage on public.note_external_ids
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

drop policy if exists activity_external_ids_manage on public.activity_external_ids;
create policy activity_external_ids_manage on public.activity_external_ids
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_integrations')
  );

grant select, insert, update, delete on public.note_external_ids to authenticated;
grant select, insert, update, delete on public.activity_external_ids to authenticated;
