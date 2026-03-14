alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists username text,
  add column if not exists email text,
  add column if not exists is_active boolean not null default true;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email))
  where email is not null;

create table if not exists public.organization_user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_template_id uuid not null references public.role_templates(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id, role_template_id)
);

create index if not exists idx_org_user_role_assignments_org_user
  on public.organization_user_role_assignments (organization_id, user_id);

create or replace function app.has_permission(org_id uuid, permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with role_ids as (
    select om.role_template_id as role_template_id
    from public.organization_memberships om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.is_active = true
    union
    select oura.role_template_id
    from public.organization_user_role_assignments oura
    join public.organization_memberships om
      on om.organization_id = oura.organization_id
     and om.user_id = oura.user_id
    where oura.organization_id = org_id
      and oura.user_id = auth.uid()
      and om.is_active = true
  )
  select exists (
    select 1
    from role_ids rid
    join public.role_template_permissions rtp on rtp.role_template_id = rid.role_template_id
    join public.permissions p on p.id = rtp.permission_id
    where p.key = permission_key
  );
$$;

create or replace function public.user_permissions(org_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with role_ids as (
    select om.role_template_id as role_template_id
    from public.organization_memberships om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.is_active = true
    union
    select oura.role_template_id
    from public.organization_user_role_assignments oura
    join public.organization_memberships om
      on om.organization_id = oura.organization_id
     and om.user_id = oura.user_id
    where oura.organization_id = org_id
      and oura.user_id = auth.uid()
      and om.is_active = true
  )
  select coalesce(array_agg(distinct p.key), '{}'::text[])
  from role_ids rid
  join public.role_template_permissions rtp on rtp.role_template_id = rid.role_template_id
  join public.permissions p on p.id = rtp.permission_id;
$$;

create or replace function app.can_create_projects(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.has_permission(org_id, 'can_create_projects');
$$;

create or replace function app.can_create_campaigns(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.has_permission(org_id, 'can_create_campaigns');
$$;

create or replace function public.contact_trend_series(org_id uuid, range_key text, contact_mode text)
returns table (bucket_start date, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select
      case range_key
        when '30d' then current_date - interval '29 days'
        when '60d' then current_date - interval '59 days'
        when '90d' then current_date - interval '89 days'
        when '120d' then current_date - interval '119 days'
        when '1y' then current_date - interval '1 year'
        when '3y' then current_date - interval '3 years'
        when '5y' then current_date - interval '5 years'
        else current_date - interval '29 days'
      end::date as start_date,
      case range_key
        when '30d' then 'day'
        when '60d' then 'week'
        when '90d' then 'week'
        when '120d' then 'week'
        when '1y' then 'month'
        when '3y' then 'month'
        when '5y' then 'year'
        else 'day'
      end as granularity
  ),
  series as (
    select generate_series(
      date_trunc((select granularity from cfg), (select start_date from cfg)::timestamp),
      date_trunc((select granularity from cfg), current_date::timestamp),
      case (select granularity from cfg)
        when 'day' then interval '1 day'
        when 'week' then interval '1 week'
        when 'month' then interval '1 month'
        else interval '1 year'
      end
    )::date as bucket_start
  ),
  agg as (
    select
      date_trunc((select granularity from cfg), c.created_at)::date as bucket_start,
      count(*)::bigint as total
    from public.contacts c
    where c.organization_id = org_id
      and c.created_at::date >= (select start_date from cfg)
      and (
        (contact_mode = 'personal' and coalesce(nullif(trim(c.organization_name), ''), '') = '')
        or (contact_mode = 'organization' and coalesce(nullif(trim(c.organization_name), ''), '') <> '')
      )
    group by 1
  )
  select s.bucket_start, coalesce(a.total, 0)::bigint as total
  from series s
  left join agg a on a.bucket_start = s.bucket_start
  order by s.bucket_start asc;
$$;

create or replace function public.donation_trend_series(org_id uuid, range_key text)
returns table (bucket_start date, total numeric)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select
      case range_key
        when '30d' then current_date - interval '29 days'
        when '60d' then current_date - interval '59 days'
        when '90d' then current_date - interval '89 days'
        when '120d' then current_date - interval '119 days'
        when '1y' then current_date - interval '1 year'
        when '3y' then current_date - interval '3 years'
        when '5y' then current_date - interval '5 years'
        else current_date - interval '29 days'
      end::date as start_date,
      case range_key
        when '30d' then 'day'
        when '60d' then 'week'
        when '90d' then 'month'
        when '120d' then 'month'
        when '1y' then 'month'
        when '3y' then 'month'
        when '5y' then 'year'
        else 'day'
      end as granularity
  ),
  series as (
    select generate_series(
      date_trunc((select granularity from cfg), (select start_date from cfg)::timestamp),
      date_trunc((select granularity from cfg), current_date::timestamp),
      case (select granularity from cfg)
        when 'day' then interval '1 day'
        when 'week' then interval '1 week'
        when 'month' then interval '1 month'
        else interval '1 year'
      end
    )::date as bucket_start
  ),
  agg as (
    select
      date_trunc((select granularity from cfg), d.donation_date::timestamp)::date as bucket_start,
      coalesce(sum(d.amount), 0)::numeric as total
    from public.donations d
    where d.organization_id = org_id
      and d.donation_date >= (select start_date from cfg)
    group by 1
  )
  select s.bucket_start, coalesce(a.total, 0)::numeric as total
  from series s
  left join agg a on a.bucket_start = s.bucket_start
  order by s.bucket_start asc;
$$;

alter table public.organization_user_role_assignments enable row level security;

create policy org_user_role_assignments_select on public.organization_user_role_assignments
  for select
  using (
    user_id = auth.uid()
    or app.has_permission(organization_id, 'can_manage_users')
  );

create policy org_user_role_assignments_manage on public.organization_user_role_assignments
  for all
  using (app.has_permission(organization_id, 'can_manage_users'))
  with check (app.has_permission(organization_id, 'can_manage_users'));

grant select, insert, update, delete on public.organization_user_role_assignments to authenticated;
grant execute on function public.contact_trend_series(uuid, text, text) to authenticated;
grant execute on function public.donation_trend_series(uuid, text) to authenticated;
