create or replace function public.platform_get_dashboard_rollup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  response jsonb;
begin
  if not app.is_platform_admin(auth.uid()) then
    raise exception 'Insufficient permissions to view platform dashboard rollup.'
      using errcode = '42501';
  end if;

  with normalized_contacts as (
    select
      coalesce(
        nullif(lower(c.entity_type::text), ''),
        case
          when nullif(trim(coalesce(c.organization_name, '')), '') is not null then 'organization'
          else 'person'
        end
      ) as entity_type_norm,
      coalesce(
        nullif(lower(c.tracking_status::text), ''),
        case
          when lower(coalesce(c.donor_status::text, '')) in ('active', 'lapsed') then 'donor'
          when lower(coalesce(c.donor_status::text, '')) = 'inactive' then 'non_lead'
          else 'lead'
        end
      ) as tracking_status_norm
    from public.contacts c
  ),
  contact_counts as (
    select
      count(*) filter (
        where entity_type_norm = 'person'
          and tracking_status_norm = 'donor'
      )::int as donors,
      count(*) filter (
        where entity_type_norm = 'person'
          and tracking_status_norm in ('lead', 'non_lead')
      )::int as contacts,
      count(*) filter (
        where entity_type_norm = 'organization'
          and tracking_status_norm = 'donor'
      )::int as donor_organizations,
      count(*) filter (
        where entity_type_norm = 'organization'
          and tracking_status_norm in ('lead', 'non_lead')
      )::int as organizations
    from normalized_contacts
  ),
  total_users as (
    select count(distinct om.user_id)::int as value
    from public.organization_memberships om
    where om.is_active = true
  ),
  role_counts as (
    select
      coalesce(rt.key, 'unknown') as role_key,
      count(distinct om.user_id)::int as user_count
    from public.organization_memberships om
    left join public.role_templates rt on rt.id = om.role_template_id
    where om.is_active = true
    group by coalesce(rt.key, 'unknown')
  ),
  active_campaigns as (
    select count(*)::int as value
    from public.campaigns c
    where lower(c.status::text) = 'active'
  ),
  donation_windows as (
    select *
    from (
      values
        (1, 'last_30_days'::text, interval '30 days'),
        (2, 'last_60_days'::text, interval '60 days'),
        (3, 'last_90_days'::text, interval '90 days'),
        (4, 'last_120_days'::text, interval '120 days'),
        (5, 'last_1_year'::text, interval '1 year'),
        (6, 'last_3_years'::text, interval '3 years'),
        (7, 'last_5_years'::text, interval '5 years'),
        (8, 'last_10_years'::text, interval '10 years')
    ) as ranges(sort_order, label, span)
  ),
  donation_totals as (
    select
      w.sort_order,
      w.label,
      coalesce(sum(d.amount), 0)::numeric as amount
    from donation_windows w
    left join public.donations d
      on d.donation_date >= (timezone('utc', now()) - w.span)::date
    group by w.sort_order, w.label
  ),
  tenant_status_counts as (
    select coalesce(nullif(lower(t.status::text), ''), 'unknown') as key, count(*)::int as count
    from public.tenants t
    group by 1
  ),
  tenant_plan_counts as (
    select coalesce(nullif(t.plan_package, ''), 'unknown') as key, count(*)::int as count
    from public.tenants t
    group by 1
  ),
  tenant_onboarding_counts as (
    select coalesce(nullif(t.onboarding_stage, ''), 'unknown') as key, count(*)::int as count
    from public.tenants t
    group by 1
  ),
  tenant_module_counts as (
    select coalesce(nullif(module_key, ''), 'unknown') as key, count(*)::int as count
    from (
      select unnest(coalesce(t.enabled_modules, array[]::text[])) as module_key
      from public.tenants t
    ) modules
    group by 1
  ),
  tenant_base as (
    select
      count(*)::int as total_tenants,
      count(*) filter (where t.backup_tier_id is not null)::int as backup_tier_assigned_count
    from public.tenants t
  ),
  backup_status_counts as (
    select coalesce(nullif(lower(tb.last_backup_status::text), ''), 'unknown') as key, count(*)::int as count
    from public.tenant_backup_metadata tb
    group by 1
  ),
  backup_summary as (
    select
      count(*)::int as tenants_with_backup_metadata,
      count(*) filter (
        where tb.last_backup_at is null
          or tb.last_backup_at < (timezone('utc', now()) - interval '48 hours')
      )::int as stale_backups,
      count(*) filter (
        where tb.next_backup_due_at is not null
          and tb.next_backup_due_at <= (timezone('utc', now()) + interval '24 hours')
      )::int as backup_due_soon
    from public.tenant_backup_metadata tb
  ),
  restore_request_status_counts as (
    select coalesce(nullif(lower(r.status::text), ''), 'unknown') as key, count(*)::int as count
    from public.tenant_restore_requests r
    group by 1
  ),
  restore_request_summary as (
    select count(*)::int as total_requests
    from public.tenant_restore_requests
  ),
  snapshot_status_counts as (
    select coalesce(nullif(lower(s.status::text), ''), 'unknown') as key, count(*)::int as count
    from public.tenant_backup_snapshots s
    group by 1
  ),
  snapshot_type_counts as (
    select coalesce(nullif(lower(s.snapshot_type::text), ''), 'unknown') as key, count(*)::int as count
    from public.tenant_backup_snapshots s
    group by 1
  ),
  snapshot_summary as (
    select
      count(*)::int as total_snapshots,
      count(*) filter (
        where s.expires_at is not null
          and s.expires_at >= timezone('utc', now())
          and s.expires_at <= (timezone('utc', now()) + interval '7 days')
      )::int as expiring_snapshots_7d
    from public.tenant_backup_snapshots s
  ),
  restore_outcome_counts as (
    select coalesce(nullif(lower(rh.outcome::text), ''), 'unknown') as key, count(*)::int as count
    from public.tenant_restore_history rh
    group by 1
  ),
  restore_target_counts as (
    select coalesce(nullif(lower(rh.restore_target::text), ''), 'unknown') as key, count(*)::int as count
    from public.tenant_restore_history rh
    group by 1
  ),
  restore_summary as (
    select count(*)::int as total_restores
    from public.tenant_restore_history
  ),
  provisioning_status_counts as (
    select coalesce(nullif(lower(pr.status::text), ''), 'unknown') as key, count(*)::int as count
    from public.tenant_provisioning_runs pr
    group by 1
  ),
  provisioning_summary as (
    select count(*)::int as total_provisioning_runs
    from public.tenant_provisioning_runs
  ),
  enabled_entitlements as (
    select *
    from public.tenant_module_entitlements e
    where e.is_enabled = true
  ),
  entitlement_module_counts as (
    select coalesce(nullif(lower(e.module_key::text), ''), 'unknown') as key, count(*)::int as count
    from enabled_entitlements e
    group by 1
  ),
  entitlement_summary as (
    select
      count(*)::int as enabled_entitlement_count,
      count(distinct e.tenant_id)::int as tenants_with_enabled_entitlements
    from enabled_entitlements e
  )
  select jsonb_build_object(
    'tenantStats',
    jsonb_build_object(
      'donors', coalesce((select donors from contact_counts), 0),
      'contacts', coalesce((select contacts from contact_counts), 0),
      'donorOrganizations', coalesce((select donor_organizations from contact_counts), 0),
      'organizations', coalesce((select organizations from contact_counts), 0),
      'activeCampaigns', coalesce((select value from active_campaigns), 0),
      'totalUsers', coalesce((select value from total_users), 0),
      'roleCounts',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('key', rc.role_key, 'count', rc.user_count)
            order by rc.role_key
          )
          from role_counts rc
        ),
        '[]'::jsonb
      ),
      'donationTrend',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('label', dt.label, 'amount', dt.amount)
            order by dt.sort_order
          )
          from donation_totals dt
        ),
        '[]'::jsonb
      )
    ),
    'tenantConfiguration',
    jsonb_build_object(
      'totalTenants', coalesce((select total_tenants from tenant_base), 0),
      'backupTierAssignedCount', coalesce((select backup_tier_assigned_count from tenant_base), 0),
      'backupTierUnassignedCount',
      greatest(
        coalesce((select total_tenants from tenant_base), 0) -
        coalesce((select backup_tier_assigned_count from tenant_base), 0),
        0
      ),
      'statusCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from tenant_status_counts c
        ),
        '[]'::jsonb
      ),
      'planCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from tenant_plan_counts c
        ),
        '[]'::jsonb
      ),
      'onboardingStageCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from tenant_onboarding_counts c
        ),
        '[]'::jsonb
      ),
      'configuredModuleCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from tenant_module_counts c
        ),
        '[]'::jsonb
      )
    ),
    'backupStatus',
    jsonb_build_object(
      'tenantsWithBackupMetadata', coalesce((select tenants_with_backup_metadata from backup_summary), 0),
      'tenantsWithoutBackupMetadata',
      greatest(
        coalesce((select total_tenants from tenant_base), 0) -
        coalesce((select tenants_with_backup_metadata from backup_summary), 0),
        0
      ),
      'staleBackups', coalesce((select stale_backups from backup_summary), 0),
      'backupDueSoon', coalesce((select backup_due_soon from backup_summary), 0),
      'statusCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from backup_status_counts c
        ),
        '[]'::jsonb
      )
    ),
    'restoreRequestWorkflow',
    jsonb_build_object(
      'totalRequests', coalesce((select total_requests from restore_request_summary), 0),
      'statusCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from restore_request_status_counts c
        ),
        '[]'::jsonb
      )
    ),
    'snapshotHistory',
    jsonb_build_object(
      'totalSnapshots', coalesce((select total_snapshots from snapshot_summary), 0),
      'expiringSnapshots7d', coalesce((select expiring_snapshots_7d from snapshot_summary), 0),
      'statusCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from snapshot_status_counts c
        ),
        '[]'::jsonb
      ),
      'typeCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from snapshot_type_counts c
        ),
        '[]'::jsonb
      )
    ),
    'restoreHistory',
    jsonb_build_object(
      'totalRestores', coalesce((select total_restores from restore_summary), 0),
      'outcomeCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from restore_outcome_counts c
        ),
        '[]'::jsonb
      ),
      'targetCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from restore_target_counts c
        ),
        '[]'::jsonb
      )
    ),
    'provisioningAndEntitlements',
    jsonb_build_object(
      'totalProvisioningRuns', coalesce((select total_provisioning_runs from provisioning_summary), 0),
      'provisioningStatusCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from provisioning_status_counts c
        ),
        '[]'::jsonb
      ),
      'enabledEntitlementCount', coalesce((select enabled_entitlement_count from entitlement_summary), 0),
      'tenantsWithEnabledEntitlements',
      coalesce((select tenants_with_enabled_entitlements from entitlement_summary), 0),
      'moduleCounts',
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', c.key, 'count', c.count) order by c.count desc, c.key)
          from entitlement_module_counts c
        ),
        '[]'::jsonb
      )
    )
  )
  into response;

  return coalesce(response, '{}'::jsonb);
end;
$$;

grant execute on function public.platform_get_dashboard_rollup() to authenticated;
