update public.integration_connections ic
set
  auth_type = case
    when lower(coalesce(ic.auth_type, '')) in ('', 'none', 'no_auth', 'noauth', 'public', 'unauthenticated')
      then 'api_key_header'
    else ic.auth_type
  end,
  api_key_reference = case
    when coalesce(ic.api_key_reference, '') = '' then 'WEBCONNEX_API_KEY'
    else ic.api_key_reference
  end,
  configuration_json = jsonb_set(
    coalesce(ic.configuration_json, '{}'::jsonb),
    '{authHeaderName}',
    to_jsonb('apiKey'::text),
    true
  ),
  updated_at = timezone('utc', now())
from public.integration_definitions idf
where ic.integration_definition_id = idf.id
  and idf.provider_key = 'webconnex';
