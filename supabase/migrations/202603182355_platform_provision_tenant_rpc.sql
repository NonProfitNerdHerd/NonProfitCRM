create or replace function public.platform_provision_tenant(
  input_organization_name text,
  input_slug text,
  input_primary_contact_name text default null,
  input_primary_contact_email text default null,
  input_primary_contact_phone text default null,
  input_plan_package text default 'standard',
  input_enabled_modules text[] default null,
  input_onboarding_stage text default 'new',
  input_backup_tier_id uuid default null,
  input_first_tenant_admin_user_id uuid default null,
  input_first_tenant_admin_email text default null,
  input_save_mode text default 'draft',
  input_applied_template text default null,
  input_branding jsonb default '{}'::jsonb,
  input_internal_notes text default null
)
returns table (
  tenant_id uuid,
  tenant_slug text,
  tenant_status text,
  provisioning_run_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_organization_name text;
  normalized_slug text;
  normalized_primary_contact_name text;
  normalized_primary_contact_email text;
  normalized_primary_contact_phone text;
  normalized_plan_package text;
  normalized_onboarding_stage text;
  normalized_save_mode text;
  normalized_first_tenant_admin_email text;
  normalized_applied_template text;
  normalized_internal_notes text;
  normalized_modules text[];
  resolved_backup_tier_id uuid;
  org_row public.organizations%rowtype;
  tenant_row public.tenants%rowtype;
  admin_role_template_id uuid;
  run_id uuid;
begin
  if not app.has_platform_role(array['super_admin', 'build_team_admin', 'implementation_specialist']) then
    raise exception 'Insufficient permissions to provision tenants.'
      using errcode = '42501';
  end if;

  normalized_organization_name := nullif(trim(coalesce(input_organization_name, '')), '');
  normalized_slug := nullif(trim(lower(coalesce(input_slug, ''))), '');
  normalized_primary_contact_name := nullif(trim(coalesce(input_primary_contact_name, '')), '');
  normalized_primary_contact_email := nullif(trim(lower(coalesce(input_primary_contact_email, ''))), '');
  normalized_primary_contact_phone := nullif(trim(coalesce(input_primary_contact_phone, '')), '');
  normalized_plan_package := coalesce(nullif(trim(coalesce(input_plan_package, '')), ''), 'standard');
  normalized_onboarding_stage := coalesce(nullif(trim(coalesce(input_onboarding_stage, '')), ''), 'new');
  normalized_save_mode := coalesce(nullif(trim(lower(coalesce(input_save_mode, ''))), ''), 'draft');
  normalized_first_tenant_admin_email := nullif(trim(lower(coalesce(input_first_tenant_admin_email, ''))), '');
  normalized_applied_template := nullif(trim(coalesce(input_applied_template, '')), '');
  normalized_internal_notes := nullif(trim(coalesce(input_internal_notes, '')), '');

  if normalized_organization_name is null then
    raise exception 'Organization name is required.'
      using errcode = '22023';
  end if;
  if normalized_slug is null then
    raise exception 'Tenant slug is required.'
      using errcode = '22023';
  end if;

  normalized_modules := coalesce(
    input_enabled_modules,
    array['contacts', 'financial', 'projects', 'memberships', 'reports', 'import_center']::text[]
  );
  normalized_modules := (
    select coalesce(
      array_agg(distinct trimmed) filter (where trimmed is not null and trimmed <> ''),
      array['contacts', 'financial', 'projects', 'memberships', 'reports', 'import_center']::text[]
    )
    from (
      select nullif(trim(value), '') as trimmed
      from unnest(normalized_modules) value
    ) modules
  );

  resolved_backup_tier_id := input_backup_tier_id;
  if resolved_backup_tier_id is null then
    select id
      into resolved_backup_tier_id
      from public.tenant_backup_tiers
     where key = 'standard'
       and is_active = true
     order by updated_at desc
     limit 1;
  end if;

  insert into public.organizations (name, slug, is_active)
  values (normalized_organization_name, normalized_slug, normalized_save_mode = 'active')
  returning * into org_row;

  insert into public.tenants (
    id,
    organization_name,
    slug,
    status,
    primary_contact_name,
    primary_contact_email,
    primary_contact_phone,
    plan_package,
    enabled_modules,
    onboarding_stage,
    backup_tier_id,
    internal_notes,
    backup_metadata
  )
  values (
    org_row.id,
    normalized_organization_name,
    normalized_slug,
    case when normalized_save_mode = 'active' then 'active'::public.tenant_status else 'draft'::public.tenant_status end,
    normalized_primary_contact_name,
    normalized_primary_contact_email,
    normalized_primary_contact_phone,
    normalized_plan_package,
    normalized_modules,
    normalized_onboarding_stage::public.tenant_onboarding_stage,
    resolved_backup_tier_id,
    normalized_internal_notes,
    jsonb_build_object(
      'firstTenantAdminEmail', normalized_first_tenant_admin_email,
      'appliedTemplate', normalized_applied_template
    )
  )
  returning * into tenant_row;

  if input_first_tenant_admin_user_id is not null then
    select id
      into admin_role_template_id
      from public.role_templates
     where key = 'administrator'
       and organization_id is null
     order by created_at asc
     limit 1;

    if admin_role_template_id is not null then
      insert into public.organization_memberships (
        organization_id,
        user_id,
        role_template_id,
        is_active
      )
      values (
        org_row.id,
        input_first_tenant_admin_user_id,
        admin_role_template_id,
        true
      )
      on conflict (organization_id, user_id)
      do update set
        role_template_id = excluded.role_template_id,
        is_active = true,
        updated_at = timezone('utc', now());
    end if;
  end if;

  if array_length(normalized_modules, 1) > 0 then
    insert into public.tenant_module_entitlements (
      tenant_id,
      module_key,
      is_enabled,
      source
    )
    select org_row.id, module_key, true, 'provisioning'
    from unnest(normalized_modules) module_key
    on conflict (tenant_id, module_key)
    do update set
      is_enabled = true,
      source = excluded.source,
      updated_at = timezone('utc', now());
  end if;

  insert into public.tenant_provisioning_runs (
    tenant_id,
    requested_by,
    status,
    organization_name,
    slug,
    primary_contact_name,
    primary_contact_email,
    first_tenant_admin_email,
    selected_modules,
    applied_template,
    selected_plan,
    selected_backup_tier_key,
    branding,
    payload,
    provisioning_log,
    activated_at
  )
  values (
    org_row.id,
    auth.uid(),
    case when normalized_save_mode = 'active' then 'active' else 'draft' end,
    normalized_organization_name,
    normalized_slug,
    normalized_primary_contact_name,
    normalized_primary_contact_email,
    normalized_first_tenant_admin_email,
    normalized_modules,
    normalized_applied_template,
    normalized_plan_package,
    resolved_backup_tier_id::text,
    coalesce(input_branding, '{}'::jsonb),
    jsonb_build_object('firstTenantAdminUserId', input_first_tenant_admin_user_id),
    jsonb_build_array(
      jsonb_build_object(
        'at', timezone('utc', now()),
        'message',
        case
          when normalized_save_mode = 'active' then 'Tenant activated from provisioning workflow.'
          else 'Tenant saved as draft.'
        end
      )
    ),
    case when normalized_save_mode = 'active' then timezone('utc', now()) else null end
  )
  returning id into run_id;

  perform app.log_platform_audit_event(
    'tenant_provisioned',
    'tenants',
    org_row.id,
    org_row.id,
    jsonb_build_object(
      'status', normalized_save_mode,
      'enabledModules', normalized_modules,
      'backupTierId', resolved_backup_tier_id
    )
  );

  return query
  select tenant_row.id, tenant_row.slug, tenant_row.status::text, run_id;
end;
$$;

grant execute on function public.platform_provision_tenant(
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  text
) to authenticated;
