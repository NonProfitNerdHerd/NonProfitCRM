create table if not exists public.volunteer_role_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.volunteer_events(id) on delete cascade,
  role_id uuid not null references public.volunteer_event_roles(id) on delete cascade,
  shift_name text,
  shift_start time not null,
  shift_end time not null,
  number_needed integer not null default 1,
  number_filled integer not null default 0,
  supervisor_contact_id uuid references public.contacts(id) on delete set null,
  check_in_location text,
  notes text,
  waitlist_enabled boolean not null default true,
  substitute_enabled boolean not null default true,
  max_waitlist_count integer,
  max_substitute_count integer,
  substitute_scope text not null default 'shift',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint volunteer_role_shifts_time_check check (shift_end > shift_start),
  constraint volunteer_role_shifts_number_needed_check check (number_needed > 0),
  constraint volunteer_role_shifts_number_filled_check check (number_filled >= 0),
  constraint volunteer_role_shifts_max_waitlist_check check (max_waitlist_count is null or max_waitlist_count >= 0),
  constraint volunteer_role_shifts_max_substitute_check check (max_substitute_count is null or max_substitute_count >= 0),
  constraint volunteer_role_shifts_substitute_scope_check check (substitute_scope in ('shift', 'role'))
);

create index if not exists volunteer_role_shifts_org_idx
  on public.volunteer_role_shifts (organization_id, event_id, role_id);
create index if not exists volunteer_role_shifts_event_idx
  on public.volunteer_role_shifts (event_id, role_id, shift_start);

alter table public.volunteer_assignments
  add column if not exists shift_id uuid references public.volunteer_role_shifts(id) on delete set null;
alter table public.volunteer_waitlist_entries
  add column if not exists shift_id uuid references public.volunteer_role_shifts(id) on delete set null;
alter table public.volunteer_substitute_entries
  add column if not exists shift_id uuid references public.volunteer_role_shifts(id) on delete set null;
alter table public.volunteer_hours
  add column if not exists shift_id uuid references public.volunteer_role_shifts(id) on delete set null;

create index if not exists volunteer_assignments_shift_idx
  on public.volunteer_assignments (organization_id, event_id, role_id, shift_id);
create index if not exists volunteer_waitlist_entries_shift_idx
  on public.volunteer_waitlist_entries (organization_id, event_id, role_id, shift_id);
create index if not exists volunteer_substitute_entries_shift_idx
  on public.volunteer_substitute_entries (organization_id, event_id, role_id, shift_id);
create index if not exists volunteer_hours_shift_idx
  on public.volunteer_hours (organization_id, event_id, role_id, shift_id);

alter table public.volunteer_waitlist_entries
  drop constraint if exists volunteer_waitlist_entries_event_id_role_id_volunteer_profile_id_key;
alter table public.volunteer_substitute_entries
  drop constraint if exists volunteer_substitute_entries_event_id_role_id_volunteer_profile_id_key;

create unique index if not exists volunteer_waitlist_entries_scope_unique_idx
  on public.volunteer_waitlist_entries (
    event_id,
    role_id,
    coalesce(shift_id, '00000000-0000-0000-0000-000000000000'::uuid),
    volunteer_profile_id
  );

create unique index if not exists volunteer_substitute_entries_scope_unique_idx
  on public.volunteer_substitute_entries (
    event_id,
    coalesce(role_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(shift_id, '00000000-0000-0000-0000-000000000000'::uuid),
    volunteer_profile_id
  );

drop trigger if exists trg_volunteer_role_shifts_updated_at on public.volunteer_role_shifts;
create trigger trg_volunteer_role_shifts_updated_at
before update on public.volunteer_role_shifts
for each row execute function app.set_updated_at();

alter table public.volunteer_role_shifts enable row level security;
select app.apply_volunteer_policy('volunteer_role_shifts', false);

grant select, insert, update, delete on public.volunteer_role_shifts to authenticated;
