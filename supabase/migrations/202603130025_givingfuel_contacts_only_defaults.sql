update public.integration_definitions
set
  name = 'GivingFuel Contacts',
  description = 'GivingFuel contacts sync using Webconnex v2 public customers API.',
  category = 'contacts',
  updated_at = timezone('utc', now())
where provider_key = 'webconnex';

update public.integration_connections ic
set
  name = 'GivingFuel Contacts',
  base_url = 'https://api.webconnex.com/v2/public',
  auth_type = 'api_key_header',
  configuration_json = (
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(ic.configuration_json, '{}'::jsonb),
              '{contactsPath}',
              to_jsonb('/search/customers'::text),
              true
            ),
            '{testPath}',
            to_jsonb('/search/customers'::text),
            true
          ),
          '{authHeaderName}',
          to_jsonb('apiKey'::text),
          true
        ),
        '{defaultLimit}',
        to_jsonb(100),
        true
      ),
      '{staticQueryParams}',
      jsonb_build_object('product', 'givingfuel.com'),
      true
    )
  ),
  sync_settings_json = (
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(ic.sync_settings_json, '{}'::jsonb),
          '{contactSyncEnabled}',
          to_jsonb(true),
          true
        ),
        '{donationSyncEnabled}',
        to_jsonb(false),
        true
      ),
      '{fullSyncEnabled}',
      to_jsonb(false),
      true
    )
  ),
  updated_at = timezone('utc', now())
from public.integration_definitions idf
where ic.integration_definition_id = idf.id
  and idf.provider_key = 'webconnex';
