do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'donation_acknowledgement_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.donation_acknowledgement_status as enum ('Pending', 'Sent', 'Not Required');
  end if;
end $$;

alter table public.donations
  add column if not exists acknowledgement_status public.donation_acknowledgement_status not null default 'Pending',
  add column if not exists acknowledgement_sent_date date,
  add column if not exists acknowledgement_sent_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_donations_org_ack_status
  on public.donations (organization_id, acknowledgement_status, donation_date desc);

drop policy if exists saved_reports_select on public.saved_reports;
drop policy if exists saved_reports_update on public.saved_reports;
drop policy if exists saved_reports_delete on public.saved_reports;

create policy saved_reports_select on public.saved_reports
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_run_reports')
    and created_by = auth.uid()
  );

create policy saved_reports_update on public.saved_reports
  for update
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_build_reports')
    and created_by = auth.uid()
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_build_reports')
    and created_by = auth.uid()
  );

create policy saved_reports_delete on public.saved_reports
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_build_reports')
    and created_by = auth.uid()
  );
