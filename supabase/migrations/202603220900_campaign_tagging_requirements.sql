alter table public.campaigns
  add column if not exists campaign_tag_id uuid references public.tags(id) on delete restrict;

alter table public.sub_campaigns
  add column if not exists campaign_tag_id uuid references public.tags(id) on delete restrict;

alter table public.donations
  add column if not exists campaign_tag_ids uuid[] not null default '{}'::uuid[];

create index if not exists idx_campaigns_org_campaign_tag
  on public.campaigns (organization_id, campaign_tag_id);

create index if not exists idx_sub_campaigns_org_campaign_tag
  on public.sub_campaigns (organization_id, campaign_tag_id);
