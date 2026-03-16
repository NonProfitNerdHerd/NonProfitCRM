create or replace function public.admin_create_auth_user(
  org_id uuid,
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
begin
  if not app.has_permission(org_id, 'can_manage_users') then
    raise exception 'Insufficient permissions to manage users.'
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

  if exists (select 1 from auth.users where lower(email) = normalized_email) then
    raise exception 'A user with this email already exists in authentication.'
      using errcode = '23505';
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
      crypt(normalized_password, gen_salt('bf')),
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
        crypt(normalized_password, gen_salt('bf')),
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

grant execute on function public.admin_create_auth_user(uuid, text, text, jsonb) to authenticated;

create or replace function public.admin_set_auth_user_password(
  org_id uuid,
  target_user_id uuid,
  new_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_password text;
begin
  if not app.has_permission(org_id, 'can_manage_users') then
    raise exception 'Insufficient permissions to manage users.'
      using errcode = '42501';
  end if;

  normalized_password := nullif(trim(coalesce(new_password, '')), '');
  if normalized_password is null then
    raise exception 'Temporary password is required.'
      using errcode = '22023';
  end if;
  if length(normalized_password) < 8 then
    raise exception 'Temporary password must be at least 8 characters.'
      using errcode = '22023';
  end if;

  update auth.users
     set encrypted_password = crypt(normalized_password, gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, timezone('utc', now())),
         updated_at = timezone('utc', now())
   where id = target_user_id;

  if not found then
    raise exception 'Authentication user was not found.'
      using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.admin_set_auth_user_password(uuid, uuid, text) to authenticated;
