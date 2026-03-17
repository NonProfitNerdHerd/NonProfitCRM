do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'email'
  ) then
    execute 'create index if not exists idx_contacts_org_email on public.contacts (organization_id, email)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'alternate_email'
  ) then
    execute 'create index if not exists idx_contacts_org_alternate_email on public.contacts (organization_id, alternate_email)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'external_source_id'
  ) then
    execute 'create index if not exists idx_contacts_org_external_source_id on public.contacts (organization_id, external_source_id)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'external_source'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'external_source_id'
  ) then
    execute 'create index if not exists idx_contacts_org_external_source_source_id on public.contacts (organization_id, external_source, external_source_id)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'first_name'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'last_name'
  ) then
    execute 'create index if not exists idx_contacts_org_first_last_name on public.contacts (organization_id, first_name, last_name)';
  end if;
end
$$;

create index if not exists idx_contact_custom_field_values_lookup
  on public.contact_custom_field_values (organization_id, custom_field_id, value_text);
