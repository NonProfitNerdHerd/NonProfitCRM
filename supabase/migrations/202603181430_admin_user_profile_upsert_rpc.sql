create or replace function public.admin_upsert_user_profile(
  org_id uuid,
  target_user_id uuid,
  first_name text,
  last_name text,
  display_name text,
  email text,
  username text,
  is_active boolean,
  must_change_password boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  normalized_username text;
  normalized_first_name text;
  normalized_last_name text;
  normalized_display_name text;
begin
  if not app.has_permission(org_id, 'can_manage_users') then
    raise exception 'Insufficient permissions to manage users.'
      using errcode = '42501';
  end if;

  normalized_first_name := nullif(trim(coalesce(first_name, '')), '');
  normalized_last_name := nullif(trim(coalesce(last_name, '')), '');
  normalized_display_name := nullif(trim(coalesce(display_name, '')), '');
  normalized_email := nullif(trim(lower(coalesce(email, ''))), '');
  normalized_username := nullif(trim(coalesce(username, '')), '');

  if normalized_email is null then
    raise exception 'Email is required.'
      using errcode = '22023';
  end if;

  insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    email,
    username,
    is_active,
    must_change_password
  )
  values (
    target_user_id,
    normalized_first_name,
    normalized_last_name,
    coalesce(normalized_display_name, trim(coalesce(normalized_first_name, '') || ' ' || coalesce(normalized_last_name, ''))),
    normalized_email,
    normalized_username,
    coalesce(is_active, true),
    coalesce(must_change_password, false)
  )
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        display_name = excluded.display_name,
        email = excluded.email,
        username = excluded.username,
        is_active = excluded.is_active,
        must_change_password =
          case
            when must_change_password is null then profiles.must_change_password
            else excluded.must_change_password
          end;

  return target_user_id;
end;
$$;

grant execute on function public.admin_upsert_user_profile(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean
) to authenticated;
