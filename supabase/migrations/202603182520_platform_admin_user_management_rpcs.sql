create or replace function app.can_manage_platform_admin_users(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app.has_platform_role(array['super_admin', 'build_team_admin'], target_user_id);
$$;

grant execute on function app.can_manage_platform_admin_users(uuid) to authenticated;

create or replace function public.platform_list_admin_users()
returns table (
  user_id uuid,
  role text,
  membership_is_active boolean,
  first_name text,
  last_name text,
  display_name text,
  email text,
  username text,
  profile_is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app.is_platform_admin(auth.uid()) then
    raise exception 'Insufficient permissions to view platform admin users.'
      using errcode = '42501';
  end if;

  return query
  select
    pam.user_id,
    pam.role::text,
    pam.is_active,
    p.first_name,
    p.last_name,
    p.display_name,
    p.email,
    p.username,
    p.is_active
  from public.platform_admin_memberships pam
  left join public.profiles p on p.id = pam.user_id
  order by coalesce(p.display_name, p.email, pam.user_id::text), pam.role::text;
end;
$$;

grant execute on function public.platform_list_admin_users() to authenticated;

create or replace function public.platform_find_auth_user_by_email(
  user_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  existing_user_id uuid;
begin
  if not app.can_manage_platform_admin_users() then
    raise exception 'Insufficient permissions to manage platform admin users.'
      using errcode = '42501';
  end if;

  normalized_email := nullif(trim(lower(coalesce(user_email, ''))), '');
  if normalized_email is null then
    return null;
  end if;

  select u.id
    into existing_user_id
    from auth.users u
   where lower(u.email) = normalized_email
   order by u.created_at asc
   limit 1;

  return existing_user_id;
end;
$$;

grant execute on function public.platform_find_auth_user_by_email(text) to authenticated;

create or replace function public.platform_create_auth_user(
  user_email text,
  user_password text,
  user_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  normalized_password text;
  new_user_id uuid;
  existing_user_id uuid;
begin
  if not app.can_manage_platform_admin_users() then
    raise exception 'Insufficient permissions to manage platform admin users.'
      using errcode = '42501';
  end if;

  normalized_email := nullif(trim(lower(coalesce(user_email, ''))), '');
  normalized_password := nullif(trim(coalesce(user_password, '')), '');

  if normalized_email is null then
    raise exception 'Email is required.'
      using errcode = '22023';
  end if;
  if normalized_password is null then
    raise exception 'Temporary password is required.'
      using errcode = '22023';
  end if;
  if length(normalized_password) < 8 then
    raise exception 'Temporary password must be at least 8 characters.'
      using errcode = '22023';
  end if;

  select u.id
    into existing_user_id
    from auth.users u
   where lower(u.email) = normalized_email
   order by u.created_at asc
   limit 1;

  if existing_user_id is not null then
    return existing_user_id;
  end if;

  new_user_id := gen_random_uuid();

  begin
    insert into auth.users (
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    values (
      new_user_id,
      'authenticated',
      'authenticated',
      normalized_email,
      app.hash_password(normalized_password),
      timezone('utc', now()),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      coalesce(user_metadata, '{}'::jsonb),
      timezone('utc', now()),
      timezone('utc', now()),
      '',
      '',
      '',
      ''
    );
  exception
    when not_null_violation then
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        normalized_email,
        app.hash_password(normalized_password),
        timezone('utc', now()),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        coalesce(user_metadata, '{}'::jsonb),
        timezone('utc', now()),
        timezone('utc', now()),
        '',
        '',
        '',
        ''
      );
  end;

  return new_user_id;
end;
$$;

grant execute on function public.platform_create_auth_user(text, text, jsonb) to authenticated;

create or replace function public.platform_upsert_user_profile(
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
  if not app.can_manage_platform_admin_users() then
    raise exception 'Insufficient permissions to manage platform admin users.'
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

  insert into public.profiles as p (
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
    coalesce(
      normalized_display_name,
      trim(coalesce(normalized_first_name, '') || ' ' || coalesce(normalized_last_name, ''))
    ),
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
            when $8 is null then p.must_change_password
            else excluded.must_change_password
          end;

  return target_user_id;
end;
$$;

grant execute on function public.platform_upsert_user_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean
) to authenticated;
