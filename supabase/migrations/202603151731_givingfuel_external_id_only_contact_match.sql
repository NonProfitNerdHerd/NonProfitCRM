update public.integration_connections ic
set
  sync_settings_json = jsonb_set(
    coalesce(ic.sync_settings_json, '{}'::jsonb),
    '{fallbackContactMatch}',
    to_jsonb('external_id_only'::text),
    true
  ),
  updated_at = timezone('utc', now())
from public.integration_definitions idf
where ic.integration_definition_id = idf.id
  and idf.provider_key = 'webconnex';
