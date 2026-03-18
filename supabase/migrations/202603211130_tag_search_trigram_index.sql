create extension if not exists pg_trgm;

create index if not exists idx_tags_name_trgm
  on public.tags using gin (lower(name) gin_trgm_ops);
