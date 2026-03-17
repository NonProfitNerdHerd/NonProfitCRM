do $$
declare
  waitlist_constraint_name text;
  substitute_constraint_name text;
begin
  select con.conname
  into waitlist_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'volunteer_waitlist_entries'
    and con.contype = 'u'
    and (
      select array_agg(att.attname order by ord.n)
      from unnest(con.conkey) with ordinality as ord(attnum, n)
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = ord.attnum
    ) = array['event_id', 'role_id', 'volunteer_profile_id']::name[];

  if waitlist_constraint_name is not null then
    execute format(
      'alter table public.volunteer_waitlist_entries drop constraint %I',
      waitlist_constraint_name
    );
  end if;

  select con.conname
  into substitute_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'volunteer_substitute_entries'
    and con.contype = 'u'
    and (
      select array_agg(att.attname order by ord.n)
      from unnest(con.conkey) with ordinality as ord(attnum, n)
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = ord.attnum
    ) = array['event_id', 'role_id', 'volunteer_profile_id']::name[];

  if substitute_constraint_name is not null then
    execute format(
      'alter table public.volunteer_substitute_entries drop constraint %I',
      substitute_constraint_name
    );
  end if;
end
$$;
