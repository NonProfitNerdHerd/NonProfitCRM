create index if not exists idx_donations_memo_trgm
  on public.donations using gin (memo gin_trgm_ops)
  where memo is not null;
