alter table public.integration_sync_jobs
  add column if not exists records_retrieved integer not null default 0,
  add column if not exists records_skipped integer not null default 0,
  add column if not exists total_records_expected integer,
  add column if not exists current_cursor text,
  add column if not exists current_page integer,
  add column if not exists completed_successfully boolean not null default false,
  add column if not exists paging_complete boolean not null default false;

update public.integration_sync_jobs
set
  records_retrieved = coalesce(records_retrieved, records_processed, 0),
  records_skipped = coalesce(records_skipped, 0),
  completed_successfully = coalesce(
    completed_successfully,
    case
      when status = 'completed' and coalesce(records_failed, 0) = 0 then true
      else false
    end
  ),
  paging_complete = coalesce(
    paging_complete,
    case
      when status = 'completed' then true
      else false
    end
  )
where true;

create index if not exists idx_integration_jobs_org_connection_running
  on public.integration_sync_jobs (organization_id, integration_connection_id, status, started_date desc);
