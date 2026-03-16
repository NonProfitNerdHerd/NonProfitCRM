# Kindful Integration (Read-Only Inbound Sync)

This document describes the Kindful integration as an inbound-only service into NerdCore. Kindful is treated as source-only until decommissioned.

## Read-only policy

- No write-back logic to Kindful.
- No `PUT`, `PATCH`, or `DELETE` calls to Kindful.
- Metadata helper calls are GET-only.
- Contact/transaction retrieval uses Kindful Customer API query endpoints (POST-based query semantics, read-only behavior).

## Endpoints used

Primary:

- `POST /admin/oauth2/api/v1/contacts/query`
- `POST /admin/oauth2/api/v1/transactions/query`
- `GET /admin/oauth2/api/v1/imports/stats`
- `GET /admin/oauth2/api/v1/imports/{jobId}`

Optional/dedicated (attempted when available in tenant/API plan):

- `GET /admin/oauth2/api/v1/notes`
- `GET /admin/oauth2/api/v1/activities`

If dedicated notes/activities endpoints are unavailable, sync falls back to extracting note/activity payloads from contact and transaction records.

## Entities synchronized inbound

1. Contacts / Customers
2. Transactions / Donations
3. Notes
4. Activities

## Entity mapping and links

- Contacts upsert into `contacts` and `contact_external_ids`.
- Transactions upsert into `donations` and `transaction_external_ids`.
- Notes upsert into `notes` and `note_external_ids`.
  - linked to `contact_id` and/or `entity_type/entity_id` (`contact`/`donation`) when resolvable.
- Activities upsert into `activity_log` and `activity_external_ids`.
  - linked to `related_contact_id` and entity (`contact` or `donation`) when resolvable.

## Idempotency and deduplication

- External IDs are always checked first.
- Fallback matching uses normalized values (email/phone/name/address logic for contacts).
- Ambiguous records are queued to review queue rather than auto-merged.
- Upserts are safe to replay.

## Sync strategy

Each entity tracks independent sync state:

- `kindfulLastContactsSyncDate`
- `kindfulLastTransactionsSyncDate`
- `kindfulLastNotesSyncDate`
- `kindfulLastActivitiesSyncDate`

Entity modes:

- `kindfulContactsMode`, `kindfulTransactionsMode`, `kindfulNotesMode`, `kindfulActivitiesMode`
- `backfill` on first run, then `incremental`

Checkpoints are persisted in `integration_sync_checkpoints` by scope (`contacts`, `transactions`, `notes`, `activities`).

## Schema changes

Migrations:

- `supabase/migrations/202603171500_kindful_integration_migration_service.sql`
- `supabase/migrations/202603171700_kindful_notes_activities_support.sql`

Additional inbound tracking tables:

- `note_external_ids`
- `activity_external_ids`
- `raw_source_payloads` snapshots for troubleshooting and reconciliation

All tables use RLS constrained to integration managers (`can_manage_integrations`).

## Services

- `src/lib/integrations/kindful-api-client.ts`
- `src/lib/integrations/kindful-contact-sync-service.ts`
- `src/lib/integrations/kindful-transaction-sync-service.ts`
- `src/lib/integrations/kindful-note-sync-service.ts`
- `src/lib/integrations/kindful-activity-sync-service.ts`
- `src/lib/integrations/kindful-sync-service.ts`

## Known API limitations / assumptions

1. Kindful list/query endpoints for contacts/transactions are POST-based query operations (read-only semantics), not simple GET list endpoints.
2. Notes/activities endpoint availability may vary by Kindful account/docs version; fallback extraction from contact/transaction payloads is implemented.
3. Some notes/activities may not include stable source IDs; deterministic hashes are used for idempotent external ID tracking.
