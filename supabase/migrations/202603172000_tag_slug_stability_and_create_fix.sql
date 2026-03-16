create or replace function app.unique_tag_slug(
  org_id uuid,
  base_input text,
  exclude_tag_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base_slug text := app.slugify_tag(base_input);
  candidate text;
  suffix integer := 2;
begin
  if coalesce(base_slug, '') = '' then
    base_slug := 'tag';
  end if;

  candidate := base_slug;
  while exists (
    select 1
    from public.tags t
    where t.organization_id = org_id
      and t.slug = candidate
      and (exclude_tag_id is null or t.id <> exclude_tag_id)
  ) loop
    candidate := base_slug || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;

  return candidate;
end;
$$;

do $$
declare
  duplicate_row record;
begin
  for duplicate_row in
    select id, organization_id, slug
    from (
      select
        t.id,
        t.organization_id,
        t.slug,
        row_number() over (
          partition by t.organization_id, t.slug
          order by t.created_at asc, t.id asc
        ) as row_num
      from public.tags t
    ) ranked
    where ranked.row_num > 1
  loop
    update public.tags
    set
      slug = app.unique_tag_slug(
        duplicate_row.organization_id,
        duplicate_row.slug,
        duplicate_row.id
      ),
      updated_at = timezone('utc', now())
    where id = duplicate_row.id;
  end loop;
end;
$$;

drop index if exists idx_tags_unique_slug_within_parent;
create unique index if not exists idx_tags_unique_slug_per_org
  on public.tags (organization_id, slug);

create or replace function app.tags_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_record public.tags%rowtype;
  subtree_depth integer := 0;
  requested_slug text;
  slug_conflict boolean := false;
begin
  if coalesce(trim(new.name), '') = '' then
    raise exception 'Tag name is required';
  end if;

  new.name := trim(new.name);

  if tg_op = 'INSERT' then
    requested_slug := app.slugify_tag(coalesce(nullif(trim(new.slug), ''), new.name));
    if requested_slug = '' then
      raise exception 'Tag slug cannot be empty';
    end if;

    if coalesce(nullif(trim(new.slug), ''), '') = '' then
      new.slug := app.unique_tag_slug(new.organization_id, requested_slug);
    else
      select exists (
        select 1
        from public.tags t
        where t.organization_id = new.organization_id
          and t.slug = requested_slug
      )
      into slug_conflict;
      if slug_conflict then
        raise exception 'Tag slug already exists in this organization';
      end if;
      new.slug := requested_slug;
    end if;
  else
    if new.slug is distinct from old.slug then
      requested_slug := app.slugify_tag(coalesce(nullif(trim(new.slug), ''), old.slug));
      if requested_slug = '' then
        raise exception 'Tag slug cannot be empty';
      end if;
      select exists (
        select 1
        from public.tags t
        where t.organization_id = new.organization_id
          and t.slug = requested_slug
          and t.id <> new.id
      )
      into slug_conflict;
      if slug_conflict then
        raise exception 'Tag slug already exists in this organization';
      end if;
      new.slug := requested_slug;
    else
      new.slug := old.slug;
    end if;
  end if;

  if new.parent_tag_id is null then
    new.level := 1;
    new.path := new.name;
  else
    select *
    into parent_record
    from public.tags
    where id = new.parent_tag_id;

    if parent_record.id is null then
      raise exception 'Parent tag was not found';
    end if;
    if parent_record.organization_id <> new.organization_id then
      raise exception 'Parent tag must belong to the same organization';
    end if;

    if tg_op = 'UPDATE' and new.id is not null then
      if exists (
        with recursive ancestors as (
          select p.id, p.parent_tag_id
          from public.tags p
          where p.id = new.parent_tag_id
          union all
          select t.id, t.parent_tag_id
          from public.tags t
          join ancestors a on t.id = a.parent_tag_id
          where t.organization_id = new.organization_id
        )
        select 1
        from ancestors
        where id = new.id
      ) then
        raise exception 'Circular tag hierarchy is not allowed';
      end if;
    end if;

    new.level := parent_record.level + 1;
    new.path := parent_record.path || ' > ' || new.name;
  end if;

  if new.level > 4 then
    raise exception 'Tag hierarchy depth cannot exceed 4 levels';
  end if;

  if tg_op = 'UPDATE' then
    with recursive descendants as (
      select t.id, 1 as depth
      from public.tags t
      where t.organization_id = new.organization_id
        and t.parent_tag_id = new.id
      union all
      select t.id, d.depth + 1
      from public.tags t
      join descendants d on d.id = t.parent_tag_id
      where t.organization_id = new.organization_id
    )
    select coalesce(max(depth), 0)
    into subtree_depth
    from descendants;

    if new.level + subtree_depth > 4 then
      raise exception 'Moving this tag would exceed maximum hierarchy depth of 4';
    end if;
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

grant execute on function app.unique_tag_slug(uuid, text, uuid) to authenticated;
