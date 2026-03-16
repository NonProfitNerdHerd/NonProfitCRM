alter table public.import_center_jobs
  add column if not exists matched_contact_count integer not null default 0,
  add column if not exists created_contact_count integer not null default 0,
  add column if not exists created_transaction_count integer not null default 0,
  add column if not exists no_contact_match_skip_count integer not null default 0,
  add column if not exists campaign_mapped_count integer not null default 0,
  add column if not exists campaign_unmapped_skip_count integer not null default 0,
  add column if not exists ambiguous_contact_match_count integer not null default 0;
