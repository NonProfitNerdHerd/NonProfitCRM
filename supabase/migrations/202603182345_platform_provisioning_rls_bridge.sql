-- Allow platform-admin provisioning workflows to create organizations and seed memberships
-- without requiring tenant-scoped membership first.

drop policy if exists organizations_insert_platform on public.organizations;
create policy organizations_insert_platform on public.organizations
  for insert
  with check (
    app.has_platform_role(array['super_admin', 'build_team_admin', 'implementation_specialist'])
  );

drop policy if exists memberships_platform_manage on public.organization_memberships;
create policy memberships_platform_manage on public.organization_memberships
  for all
  using (
    app.has_platform_role(array['super_admin', 'build_team_admin', 'implementation_specialist', 'support_admin'])
  )
  with check (
    app.has_platform_role(array['super_admin', 'build_team_admin', 'implementation_specialist', 'support_admin'])
  );
