alter table public.import_center_jobs
  add column if not exists processed_rows integer not null default 0,
  add column if not exists import_file_bucket text,
  add column if not exists import_file_path text,
  add column if not exists source_file_type text,
  add column if not exists source_sheet_name text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_heartbeat_at timestamptz,
  add column if not exists runner_invoked_at timestamptz,
  add column if not exists runner_completed_at timestamptz,
  add column if not exists processor_error text;

update public.import_center_jobs
set processed_rows = greatest(
  coalesce(processed_rows, 0),
  coalesce(successful_rows, 0) + coalesce(failed_rows, 0) + coalesce(skipped_rows, 0)
)
where processed_rows < coalesce(successful_rows, 0) + coalesce(failed_rows, 0) + coalesce(skipped_rows, 0);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_center_jobs_status_async_check'
  ) then
    alter table public.import_center_jobs
      add constraint import_center_jobs_status_async_check
      check (status in ('queued', 'processing', 'running', 'completed', 'completed_with_errors', 'failed'));
  end if;
end
$$;

create index if not exists idx_import_center_jobs_async_queue
  on public.import_center_jobs (organization_id, status, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-center-files',
  'import-center-files',
  false,
  209715200,
  array[
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do nothing;
