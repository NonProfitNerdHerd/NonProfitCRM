update public.integration_connections ic
set
  configuration_json = (
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(ic.configuration_json, '{}'::jsonb),
            '{contactsPath}',
            to_jsonb('/v2/public/search/customers'::text),
            true
          ),
          '{transactionsPath}',
          to_jsonb('/v2/public/search/transactions'::text),
          true
        ),
        '{testPath}',
        to_jsonb('/v2/public/search/customers'::text),
        true
      ),
      '{authHeaderName}',
      to_jsonb('apiKey'::text),
      true
    )
  ) || jsonb_build_object('staticQueryParams', jsonb_build_object('product', 'givingfuel.com')),
  updated_at = timezone('utc', now())
from public.integration_definitions idf
where ic.integration_definition_id = idf.id
  and idf.provider_key = 'webconnex';
