delete from public.contacts
where not (
  lower(coalesce(first_name, '')) in ('avery', 'riley')
  or lower(coalesce(preferred_name, '')) in ('avery', 'riley')
);
