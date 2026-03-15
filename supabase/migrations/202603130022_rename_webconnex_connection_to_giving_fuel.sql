update public.integration_definitions
set
  name = 'Giving Fuel',
  description = 'Giving Fuel (Webconnex product) API synchronization for contacts and donations/transactions.',
  updated_at = timezone('utc', now())
where provider_key = 'webconnex';

update public.integration_connections ic
set
  name = 'Giving Fuel',
  updated_at = timezone('utc', now())
from public.integration_definitions idf
where ic.integration_definition_id = idf.id
  and idf.provider_key = 'webconnex'
  and lower(coalesce(ic.name, '')) in ('webconnex', 'giving fuel', '');
