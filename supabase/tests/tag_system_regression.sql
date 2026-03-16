-- Tag system regression checks
-- Run in a non-production database with a privileged role.

do $$
declare
  v_org_id uuid;
  v_contact_id uuid;
  v_tag_a uuid;
  v_tag_b uuid;
  v_parent uuid;
  v_slug_a text;
  v_slug_b text;
  v_before_assignment_count integer;
  v_after_assignment_count integer;
  duplicate_slug_error boolean := false;
begin
  insert into public.organizations (name, slug)
  values (
    'Tag Test Org ' || substr(md5(random()::text), 1, 8),
    'tag-test-org-' || substr(md5(random()::text), 1, 8)
  )
  returning id into v_org_id;

  insert into public.contacts (organization_id, first_name, last_name)
  values (v_org_id, 'Tag', 'Test Contact')
  returning id into v_contact_id;

  -- 1) Create tag with auto-generated slug
  insert into public.tags (organization_id, name)
  values (v_org_id, 'Don Capital')
  returning id, slug into v_tag_a, v_slug_a;

  if v_slug_a <> 'don-capital' then
    raise exception 'Expected slug don-capital, got %', v_slug_a;
  end if;

  -- 2) Ensure unique slug generation with numeric suffix
  insert into public.tags (organization_id, name)
  values (v_org_id, 'Don-Capital')
  returning id, slug into v_tag_b, v_slug_b;

  if v_slug_b <> 'don-capital-2' then
    raise exception 'Expected slug don-capital-2, got %', v_slug_b;
  end if;

  -- 3) Assign contact by tag_id and verify assignment remains after rename/move
  insert into public.contact_tags (organization_id, contact_id, tag_id, assignment_source)
  values (v_org_id, v_contact_id, v_tag_a, 'manual');

  select count(*) into v_before_assignment_count
  from public.contact_tags
  where organization_id = v_org_id
    and contact_id = v_contact_id
    and tag_id = v_tag_a;

  update public.tags
  set name = 'Don Capital Updated'
  where id = v_tag_a;

  if (select slug from public.tags where id = v_tag_a) <> 'don-capital' then
    raise exception 'Slug changed after rename; expected stable slug';
  end if;

  insert into public.tags (organization_id, name)
  values (v_org_id, 'Donations')
  returning id into v_parent;

  update public.tags
  set parent_tag_id = v_parent
  where id = v_tag_a;

  select count(*) into v_after_assignment_count
  from public.contact_tags
  where organization_id = v_org_id
    and contact_id = v_contact_id
    and tag_id = v_tag_a;

  if v_before_assignment_count <> 1 or v_after_assignment_count <> 1 then
    raise exception 'Tag assignment was lost after rename/move';
  end if;

  -- 4) Manual slug edit allowed; duplicate slug blocked
  update public.tags
  set slug = 'don-capital-custom'
  where id = v_tag_a;

  begin
    update public.tags
    set slug = 'don-capital-custom'
    where id = v_tag_b;
  exception
    when others then
      duplicate_slug_error := true;
  end;

  if not duplicate_slug_error then
    raise exception 'Expected duplicate slug update to fail';
  end if;
end;
$$;
