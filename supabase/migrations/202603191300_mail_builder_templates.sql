create table if not exists public.mail_builder_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  paper_size text not null default 'letter',
  template_body text not null default '',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint mail_builder_templates_paper_size_check
    check (paper_size in ('letter', 'a4', 'label_4x6')),
  unique (organization_id, name)
);

create index if not exists mail_builder_templates_org_idx
  on public.mail_builder_templates (organization_id, is_active, name);

drop trigger if exists trg_mail_builder_templates_updated_at on public.mail_builder_templates;
create trigger trg_mail_builder_templates_updated_at
before update on public.mail_builder_templates
for each row execute function app.set_updated_at();

alter table public.mail_builder_templates enable row level security;

drop policy if exists mail_builder_templates_select on public.mail_builder_templates;
create policy mail_builder_templates_select on public.mail_builder_templates
for select using (
  app.has_active_membership(organization_id)
  and app.has_permission(organization_id, 'can_view_contacts')
);

drop policy if exists mail_builder_templates_manage on public.mail_builder_templates;
create policy mail_builder_templates_manage on public.mail_builder_templates
for all using (
  app.has_active_membership(organization_id)
  and (
    app.has_permission(organization_id, 'can_build_reports')
    or app.has_permission(organization_id, 'can_edit_contacts')
  )
)
with check (
  app.has_active_membership(organization_id)
  and (
    app.has_permission(organization_id, 'can_build_reports')
    or app.has_permission(organization_id, 'can_edit_contacts')
  )
);

grant select, insert, update, delete on public.mail_builder_templates to authenticated;
