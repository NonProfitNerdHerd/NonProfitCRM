alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.role_templates enable row level security;
alter table public.permissions enable row level security;
alter table public.role_template_permissions enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.households enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_relationships enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.donations enable row level security;
alter table public.membership_types enable row level security;
alter table public.memberships enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_mappings enable row level security;
alter table public.communication_log enable row level security;
alter table public.notifications enable row level security;
alter table public.report_fields enable row level security;
alter table public.saved_reports enable row level security;
alter table public.report_runs enable row level security;
alter table public.audit_log enable row level security;

create policy organizations_select on public.organizations
  for select
  using (app.has_active_membership(id));

create policy organizations_update on public.organizations
  for update
  using (app.has_permission(id, 'can_manage_org_settings'))
  with check (app.has_permission(id, 'can_manage_org_settings'));

create policy profiles_select_self on public.profiles
  for select
  using (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy role_templates_select on public.role_templates
  for select
  using (
    organization_id is null
    or app.has_active_membership(organization_id)
  );

create policy role_templates_manage on public.role_templates
  for all
  using (
    organization_id is not null
    and app.has_permission(organization_id, 'can_manage_role_templates')
  )
  with check (
    organization_id is not null
    and app.has_permission(organization_id, 'can_manage_role_templates')
  );

create policy permissions_select on public.permissions
  for select
  using (auth.uid() is not null);

create policy role_template_permissions_select on public.role_template_permissions
  for select
  using (
    exists (
      select 1
      from public.role_templates rt
      where rt.id = role_template_permissions.role_template_id
        and (
          rt.organization_id is null
          or app.has_active_membership(rt.organization_id)
        )
    )
  );

create policy role_template_permissions_manage on public.role_template_permissions
  for all
  using (
    exists (
      select 1
      from public.role_templates rt
      where rt.id = role_template_permissions.role_template_id
        and rt.organization_id is not null
        and app.has_permission(rt.organization_id, 'can_manage_role_templates')
    )
  )
  with check (
    exists (
      select 1
      from public.role_templates rt
      where rt.id = role_template_permissions.role_template_id
        and rt.organization_id is not null
        and app.has_permission(rt.organization_id, 'can_manage_role_templates')
    )
  );

create policy memberships_select on public.organization_memberships
  for select
  using (
    user_id = auth.uid()
    or app.has_permission(organization_id, 'can_manage_users')
  );

create policy memberships_manage on public.organization_memberships
  for all
  using (app.has_permission(organization_id, 'can_manage_users'))
  with check (app.has_permission(organization_id, 'can_manage_users'));

create policy households_select on public.households
  for select
  using (app.has_permission(organization_id, 'can_view_contacts'));

create policy households_manage on public.households
  for all
  using (app.has_permission(organization_id, 'can_edit_contacts'))
  with check (app.has_permission(organization_id, 'can_edit_contacts'));

create policy contacts_select on public.contacts
  for select
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_view_contacts')
    )
    or (
      app.has_active_membership(organization_id)
      and portal_user_id = auth.uid()
    )
  );

create policy contacts_insert on public.contacts
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_create_contacts')
  );

create policy contacts_update on public.contacts
  for update
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_edit_contacts')
    )
    or (
      app.has_active_membership(organization_id)
      and portal_user_id = auth.uid()
    )
  )
  with check (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_edit_contacts')
    )
    or (
      app.has_active_membership(organization_id)
      and portal_user_id = auth.uid()
    )
  );

create policy contacts_delete on public.contacts
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_delete_contacts')
  );

create policy contact_relationships_select on public.contact_relationships
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_view_contacts')
  );

create policy contact_relationships_manage on public.contact_relationships
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_contacts')
  );

create policy notes_select on public.notes
  for select
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_view_contacts')
      and (
        visibility_classification in ('staff_public', 'portal_visible')
        or app.has_permission(organization_id, 'can_view_sensitive_notes')
      )
      and (
        not contains_pii
        or app.has_permission(organization_id, 'can_view_pii')
      )
    )
    or (
      app.has_active_membership(organization_id)
      and visibility_classification = 'portal_visible'
      and contact_id is not null
      and contact_id = app.current_contact_id(organization_id)
    )
  );

create policy notes_insert on public.notes
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_create_notes')
  );

create policy notes_update on public.notes
  for update
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_notes')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_notes')
  );

create policy notes_delete on public.notes
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_delete_notes')
  );

create policy tasks_select on public.tasks
  for select
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_view_dashboard')
      and (
        visibility_classification in ('staff_public', 'portal_visible')
        or app.has_permission(organization_id, 'can_view_sensitive_tasks')
      )
      and (
        not contains_pii
        or app.has_permission(organization_id, 'can_view_pii')
      )
    )
    or (
      app.has_active_membership(organization_id)
      and visibility_classification = 'portal_visible'
      and contact_id is not null
      and contact_id = app.current_contact_id(organization_id)
    )
  );

create policy tasks_insert on public.tasks
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_create_tasks')
  );

create policy tasks_update on public.tasks
  for update
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_tasks')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_tasks')
  );

create policy tasks_delete on public.tasks
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_delete_tasks')
  );

create policy donations_select on public.donations
  for select
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_view_donations')
    )
    or (
      app.has_active_membership(organization_id)
      and contact_id is not null
      and contact_id = app.current_contact_id(organization_id)
    )
  );

create policy donations_insert on public.donations
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_create_donations')
  );

create policy donations_update on public.donations
  for update
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_donations')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_donations')
  );

create policy donations_delete on public.donations
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_edit_donations')
  );

create policy membership_types_select on public.membership_types
  for select
  using (
    app.has_active_membership(organization_id)
    and (
      app.has_permission(organization_id, 'can_manage_memberships')
      or app.has_permission(organization_id, 'can_view_member_records')
    )
  );

create policy membership_types_manage on public.membership_types
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_memberships')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_memberships')
  );

create policy memberships_data_select on public.memberships
  for select
  using (
    (
      app.has_active_membership(organization_id)
      and (
        app.has_permission(organization_id, 'can_manage_memberships')
        or app.has_permission(organization_id, 'can_view_member_records')
      )
    )
    or (
      app.has_active_membership(organization_id)
      and contact_id = app.current_contact_id(organization_id)
    )
  );

create policy memberships_data_manage on public.memberships
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_memberships')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_memberships')
  );

create policy import_jobs_manage on public.import_jobs
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  );

create policy import_mappings_manage on public.import_mappings
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_imports')
  );

create policy communication_log_select on public.communication_log
  for select
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_view_communications')
      and (
        visibility_classification in ('staff_public', 'portal_visible')
        or app.has_permission(organization_id, 'can_manage_communications')
      )
      and (
        not contains_pii
        or app.has_permission(organization_id, 'can_view_pii')
      )
    )
    or (
      app.has_active_membership(organization_id)
      and visibility_classification = 'portal_visible'
      and recipient_user_id = auth.uid()
    )
  );

create policy communication_log_manage on public.communication_log
  for all
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_communications')
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_communications')
  );

create policy notifications_select on public.notifications
  for select
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_view_communications')
      and (
        visibility_classification in ('staff_public', 'portal_visible')
        or app.has_permission(organization_id, 'can_manage_communications')
      )
      and (
        not contains_pii
        or app.has_permission(organization_id, 'can_view_pii')
      )
    )
    or (
      app.has_active_membership(organization_id)
      and visibility_classification = 'portal_visible'
      and recipient_user_id = auth.uid()
    )
  );

create policy notifications_insert_manage on public.notifications
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_communications')
  );

create policy notifications_update_manage on public.notifications
  for update
  using (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_manage_communications')
    )
    or (
      app.has_active_membership(organization_id)
      and recipient_user_id = auth.uid()
      and visibility_classification = 'portal_visible'
    )
  )
  with check (
    (
      app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_manage_communications')
    )
    or (
      app.has_active_membership(organization_id)
      and recipient_user_id = auth.uid()
      and visibility_classification = 'portal_visible'
    )
  );

create policy notifications_delete_manage on public.notifications
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_communications')
  );

create policy report_fields_select on public.report_fields
  for select
  using (
    (
      organization_id is null
      and auth.uid() is not null
    )
    or (
      organization_id is not null
      and app.has_active_membership(organization_id)
      and app.has_permission(organization_id, 'can_run_reports')
    )
  );

create policy report_fields_manage on public.report_fields
  for all
  using (
    organization_id is not null
    and app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_org_settings')
  )
  with check (
    organization_id is not null
    and app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_manage_org_settings')
  );

create policy saved_reports_select on public.saved_reports
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_run_reports')
  );

create policy saved_reports_insert on public.saved_reports
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_build_reports')
    and created_by = auth.uid()
  );

create policy saved_reports_update on public.saved_reports
  for update
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_build_reports')
    and (created_by = auth.uid() or app.has_permission(organization_id, 'can_manage_org_settings'))
  )
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_build_reports')
  );

create policy saved_reports_delete on public.saved_reports
  for delete
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_build_reports')
    and (created_by = auth.uid() or app.has_permission(organization_id, 'can_manage_org_settings'))
  );

create policy report_runs_select on public.report_runs
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_run_reports')
  );

create policy report_runs_insert on public.report_runs
  for insert
  with check (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_run_reports')
    and executed_by = auth.uid()
  );

create policy audit_log_select on public.audit_log
  for select
  using (
    app.has_active_membership(organization_id)
    and app.has_permission(organization_id, 'can_view_audit_log')
  );

create policy audit_log_insert on public.audit_log
  for insert
  with check (
    app.has_active_membership(organization_id)
    and actor_user_id = auth.uid()
  );
