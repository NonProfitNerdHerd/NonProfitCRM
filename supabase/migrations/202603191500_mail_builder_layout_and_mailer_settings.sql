alter table public.mail_builder_templates
  add column if not exists margin_top_in numeric(5,2) not null default 0.5,
  add column if not exists margin_left_in numeric(5,2) not null default 0.5,
  add column if not exists margin_right_in numeric(5,2) not null default 0.5,
  add column if not exists margin_bottom_in numeric(5,2) not null default 0.5,
  add column if not exists include_mailer boolean not null default false,
  add column if not exists mailer_type text,
  add column if not exists mailer_size_key text;

alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_paper_size_check;

update public.mail_builder_templates
set paper_size = 'letter'
where paper_size not in ('letter', 'legal', 'tabloid', 'a4', 'a5');

alter table public.mail_builder_templates
  add constraint mail_builder_templates_paper_size_check
  check (paper_size in ('letter', 'legal', 'tabloid', 'a4', 'a5'));

alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_margin_top_check;
alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_margin_left_check;
alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_margin_right_check;
alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_margin_bottom_check;
alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_mailer_type_check;
alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_mailer_requirements_check;

alter table public.mail_builder_templates
  add constraint mail_builder_templates_margin_top_check
    check (margin_top_in >= 0 and margin_top_in <= 3),
  add constraint mail_builder_templates_margin_left_check
    check (margin_left_in >= 0 and margin_left_in <= 3),
  add constraint mail_builder_templates_margin_right_check
    check (margin_right_in >= 0 and margin_right_in <= 3),
  add constraint mail_builder_templates_margin_bottom_check
    check (margin_bottom_in >= 0 and margin_bottom_in <= 3),
  add constraint mail_builder_templates_mailer_type_check
    check (mailer_type is null or mailer_type in ('label', 'envelope')),
  add constraint mail_builder_templates_mailer_requirements_check
    check (
      include_mailer = false
      or (
        mailer_type is not null
        and mailer_size_key is not null
        and length(trim(mailer_size_key)) > 0
      )
    );
