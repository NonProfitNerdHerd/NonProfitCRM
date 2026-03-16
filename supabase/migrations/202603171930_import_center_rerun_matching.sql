alter table public.import_center_templates
  add column if not exists rerun_matching_enabled boolean not null default false,
  add column if not exists source_match_column text,
  add column if not exists destination_match_field text,
  add column if not exists on_match_behavior text not null default 'update_blank_only',
  add column if not exists on_no_match_behavior text not null default 'create_new',
  add column if not exists ignore_blank_overwrites boolean not null default true,
  add column if not exists missing_key_behavior text not null default 'skip_row';

alter table public.import_center_jobs
  add column if not exists rerun_matching_enabled boolean not null default false,
  add column if not exists source_match_column text,
  add column if not exists destination_match_field text,
  add column if not exists on_match_behavior text not null default 'update_blank_only',
  add column if not exists on_no_match_behavior text not null default 'create_new',
  add column if not exists blank_overwrite_protection_enabled boolean not null default true,
  add column if not exists missing_key_behavior text not null default 'skip_row',
  add column if not exists matched_record_count integer not null default 0,
  add column if not exists overwritten_record_count integer not null default 0,
  add column if not exists blank_only_update_count integer not null default 0,
  add column if not exists new_record_count integer not null default 0,
  add column if not exists skipped_existing_count integer not null default 0,
  add column if not exists missing_key_skip_count integer not null default 0,
  add column if not exists ambiguous_match_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_center_templates_on_match_behavior_check'
  ) then
    alter table public.import_center_templates
      add constraint import_center_templates_on_match_behavior_check
      check (on_match_behavior in ('skip_existing', 'overwrite_existing', 'update_blank_only'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_center_templates_on_no_match_behavior_check'
  ) then
    alter table public.import_center_templates
      add constraint import_center_templates_on_no_match_behavior_check
      check (on_no_match_behavior in ('create_new', 'skip_row'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_center_templates_missing_key_behavior_check'
  ) then
    alter table public.import_center_templates
      add constraint import_center_templates_missing_key_behavior_check
      check (missing_key_behavior in ('skip_row', 'treat_as_no_match'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_center_jobs_on_match_behavior_check'
  ) then
    alter table public.import_center_jobs
      add constraint import_center_jobs_on_match_behavior_check
      check (on_match_behavior in ('skip_existing', 'overwrite_existing', 'update_blank_only'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_center_jobs_on_no_match_behavior_check'
  ) then
    alter table public.import_center_jobs
      add constraint import_center_jobs_on_no_match_behavior_check
      check (on_no_match_behavior in ('create_new', 'skip_row'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_center_jobs_missing_key_behavior_check'
  ) then
    alter table public.import_center_jobs
      add constraint import_center_jobs_missing_key_behavior_check
      check (missing_key_behavior in ('skip_row', 'treat_as_no_match'));
  end if;
end
$$;
