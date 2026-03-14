create or replace function public.campaign_fund_distribution(org_id uuid, range_key text)
returns table (
  campaign_id uuid,
  campaign_name text,
  total numeric
)
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
      end::date as start_date
  )
  select
    c.id as campaign_id,
    c.name as campaign_name,
    coalesce(sum(d.amount), 0)::numeric as total
  from public.donations d
  join public.campaigns c
    on c.id = d.campaign_id
   and c.organization_id = d.organization_id
  where d.organization_id = org_id
    and d.donation_date >= (select start_date from cfg)
  group by c.id, c.name
  order by total desc, c.name asc;
$$;

create or replace function public.payment_type_distribution(org_id uuid, range_key text)
returns table (
  payment_type text,
  total numeric
)
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
      end::date as start_date
  )
  select
    coalesce(d.payment_type::text, 'unknown') as payment_type,
    coalesce(sum(d.amount), 0)::numeric as total
  from public.donations d
  where d.organization_id = org_id
    and d.donation_date >= (select start_date from cfg)
  group by coalesce(d.payment_type::text, 'unknown')
  order by total desc;
$$;

grant execute on function public.campaign_fund_distribution(uuid, text) to authenticated;
grant execute on function public.payment_type_distribution(uuid, text) to authenticated;
