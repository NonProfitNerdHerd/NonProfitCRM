alter table public.mail_builder_templates
  add column if not exists label_margin_top_in numeric(5,2) not null default 0,
  add column if not exists label_margin_left_in numeric(5,2) not null default 0,
  add column if not exists label_margin_right_in numeric(5,2) not null default 0,
  add column if not exists label_margin_bottom_in numeric(5,2) not null default 0;

alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_label_margin_top_check;
alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_label_margin_left_check;
alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_label_margin_right_check;
alter table public.mail_builder_templates
  drop constraint if exists mail_builder_templates_label_margin_bottom_check;

alter table public.mail_builder_templates
  add constraint mail_builder_templates_label_margin_top_check
    check (label_margin_top_in >= 0 and label_margin_top_in <= 1),
  add constraint mail_builder_templates_label_margin_left_check
    check (label_margin_left_in >= 0 and label_margin_left_in <= 1),
  add constraint mail_builder_templates_label_margin_right_check
    check (label_margin_right_in >= 0 and label_margin_right_in <= 1),
  add constraint mail_builder_templates_label_margin_bottom_check
    check (label_margin_bottom_in >= 0 and label_margin_bottom_in <= 1);
