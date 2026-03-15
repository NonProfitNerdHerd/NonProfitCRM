alter table public.sub_campaigns
  add column if not exists start_date date,
  add column if not exists end_date date;

alter table public.sub_campaigns
  drop constraint if exists sub_campaigns_date_range_check;

alter table public.sub_campaigns
  add constraint sub_campaigns_date_range_check
  check (end_date is null or start_date is null or end_date >= start_date);

drop policy if exists sub_campaigns_manage on public.sub_campaigns;

create policy sub_campaigns_select on public.sub_campaigns
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_view_donations')
      or app.has_permission(organization_id, 'can_manage_integrations')
    )
  );

create policy sub_campaigns_insert on public.sub_campaigns
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.can_create_campaigns(organization_id)
  );

create policy sub_campaigns_update on public.sub_campaigns
  for update
  using (
    app.has_active_membership(organization_id)
    and app.can_create_campaigns(organization_id)
  )
  with check (
    app.has_active_membership(organization_id)
    and app.can_create_campaigns(organization_id)
  );

create policy sub_campaigns_delete on public.sub_campaigns
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.can_create_campaigns(organization_id)
  );
