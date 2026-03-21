alter table public.import_center_jobs
  add column if not exists stop_requested boolean not null default false,
  add column if not exists stop_requested_at timestamptz,
  add column if not exists stopped_at timestamptz,
  add column if not exists retry_requested boolean not null default false,
  add column if not exists retry_requested_at timestamptz,
  add column if not exists parent_job_id uuid references public.import_center_jobs(id) on delete set null,
  add column if not exists last_processed_row integer not null default 0,
  add column if not exists last_activity_at timestamptz,
  add column if not exists last_error_message text,
  add column if not exists processor_log text,
  add column if not exists runner_lock_token uuid,
  add column if not exists runner_lock_expires_at timestamptz;

update public.import_center_jobs
set last_processed_row = greatest(coalesce(last_processed_row, 0), coalesce(processed_rows, 0));

update public.import_center_jobs
set last_activity_at = coalesce(last_activity_at, processing_heartbeat_at, updated_at, started_at, created_at);

update public.import_center_jobs
set status = 'processing'
where status = 'running';

update public.import_center_jobs
set status = 'failed',
    last_error_message = coalesce(nullif(last_error_message, ''), 'Unsupported legacy status migrated to failed.'),
    processor_error = coalesce(nullif(processor_error, ''), 'Unsupported legacy status migrated to failed.')
where status not in ('queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled', 'stalled');

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'import_center_jobs_status_async_check'
  ) then
    alter table public.import_center_jobs
      drop constraint import_center_jobs_status_async_check;
  end if;

  alter table public.import_center_jobs
    add constraint import_center_jobs_status_async_check
    check (status in ('queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled', 'stalled'));
end
$$;

create index if not exists idx_import_center_jobs_org_status_activity
  on public.import_center_jobs (organization_id, status, last_activity_at desc);

create index if not exists idx_import_center_jobs_org_parent
  on public.import_center_jobs (organization_id, parent_job_id, created_at desc);
