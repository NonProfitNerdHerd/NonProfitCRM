create or replace function public.platform_get_tenant_stats(input_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  response jsonb;
begin
  if input_tenant_id is null then
    raise exception 'Tenant id is required.'
      using errcode = '22023';
  end if;

  if not app.is_platform_admin(auth.uid()) then
    raise exception 'Insufficient permissions to view tenant stats.'
      using errcode = '42501';
  end if;

  with contact_counts as (
    select
      count(*) filter (
        where coalesce(lower(entity_type), '') = 'person'
          and coalesce(lower(tracking_status), '') = 'donor'
      )::int as donors,
      count(*) filter (
        where coalesce(lower(entity_type), '') = 'person'
          and coalesce(lower(tracking_status), '') in ('lead', 'non_lead')
      )::int as contacts,
      count(*) filter (
        where coalesce(lower(entity_type), '') = 'organization'
          and coalesce(lower(tracking_status), '') = 'donor'
      )::int as donor_organizations,
      count(*) filter (
        where coalesce(lower(entity_type), '') = 'organization'
          and coalesce(lower(tracking_status), '') in ('lead', 'non_lead')
      )::int as organizations
    from public.contacts
    where organization_id = input_tenant_id
  ),
  total_users as (
    select count(distinct om.user_id)::int as value
    from public.organization_memberships om
    where om.organization_id = input_tenant_id
      and om.is_active = true
  ),
  role_counts as (
    select
      coalesce(rt.key, 'unknown') as role_key,
      count(distinct om.user_id)::int as user_count
    from public.organization_memberships om
    left join public.role_templates rt on rt.id = om.role_template_id
    where om.organization_id = input_tenant_id
      and om.is_active = true
    group by coalesce(rt.key, 'unknown')
  ),
  active_campaigns as (
    select count(*)::int as value
    from public.campaigns c
    where c.organization_id = input_tenant_id
      and coalesce(lower(c.status), '') = 'active'
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
      on d.organization_id = input_tenant_id
     and d.donation_date >= (timezone('utc', now()) - w.span)::date
    group by w.sort_order, w.label
  )
  select jsonb_build_object(
    'contactCounts',
    jsonb_build_object(
      'donors', coalesce(cc.donors, 0),
      'contacts', coalesce(cc.contacts, 0),
      'donorOrganizations', coalesce(cc.donor_organizations, 0),
      'organizations', coalesce(cc.organizations, 0)
    ),
    'totalUsers',
    coalesce((select value from total_users), 0),
    'roleCounts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'roleKey', rc.role_key,
            'userCount', rc.user_count
          )
          order by rc.role_key
        )
        from role_counts rc
      ),
      '[]'::jsonb
    ),
    'activeCampaigns',
    coalesce((select value from active_campaigns), 0),
    'donationTrend',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'label', dt.label,
            'amount', dt.amount
          )
          order by dt.sort_order
        )
        from donation_totals dt
      ),
      '[]'::jsonb
    )
  )
    into response
  from contact_counts cc;

  return coalesce(response, '{}'::jsonb);
end;
$$;

grant execute on function public.platform_get_tenant_stats(uuid) to authenticated;
