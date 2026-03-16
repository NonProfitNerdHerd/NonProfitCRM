# Kindful Integration + Migration Service

This document describes the production Kindful migration and transition sync implementation added to NerdCore.

## Goals covered

- Full backfill of contacts + transactions from Kindful.
- Ongoing incremental sync during migration overlap.
- Idempotent upserts with external ID priority.
- Duplicate/review safety queue for ambiguous matches.
- Dead-letter + replay flow for recoverable failures.
- Cutover readiness checks and freeze control.

## Kindful Customer API patterns used

The implementation is configured around documented Kindful Customer API paths:

- `POST /admin/oauth2/api/v1/contacts/query`
- `POST /admin/oauth2/api/v1/transactions/query`
- `GET /admin/oauth2/api/v1/imports/stats` (sync readiness)
- `GET /admin/oauth2/api/v1/imports/{jobId}` (import/job status)

Defaults are configurable in integration connection settings (no hardcoded lock-in).

## Authentication

- Uses Kindful Application Token via HTTP header.
- Default header mode:
  - `Authorization: Token token=<application_token>`
- Token is encrypted at rest in integration configuration.
- Token is never echoed back to UI once saved.

## Schema additions

Migration: `supabase/migrations/202603171500_kindful_integration_migration_service.sql`

Adds:

- `integration_sync_checkpoints`
- `integration_dead_letter_queue`
- `integration_review_queue`
- `raw_source_payloads`
- `transaction_external_ids`
- `campaign_external_ids`
- `tag_external_ids`
- `integration_cutover_reports`
- `resolve_transaction_by_external_id(...)` RPC
- `integration_definitions` row for provider key `kindful`

All tables include RLS + grants aligned to `can_manage_integrations`.

## Service architecture

Key files:

- Client/config:
  - `src/lib/integrations/kindful-config.ts`
  - `src/lib/integrations/kindful-api-client.ts`
- Mapping + dedupe helpers:
  - `src/lib/integrations/kindful-mapper.ts`
  - `src/lib/integrations/kindful-sync-support.ts`
- Sync engines:
  - `src/lib/integrations/kindful-contact-sync-service.ts`
  - `src/lib/integrations/kindful-transaction-sync-service.ts`
  - `src/lib/integrations/kindful-sync-service.ts`
- Wiring:
  - `src/lib/integrations/integration-job-runner.ts`
  - `src/lib/integrations/integration-configuration-service.ts`
  - `src/lib/integrations/integration-retry-service.ts`
  - `src/lib/data/integrations.ts`

## Matching / dedupe behavior

### Contacts (priority)

1. Kindful external ID (`contact_external_ids` / `contact_external_references`)
2. Exact email
3. Exact phone
4. Exact name + address / name + city+state/postal
5. If ambiguous -> `integration_review_queue` (no auto-merge)

### Transactions (priority)

1. Kindful transaction external ID (`transaction_external_ids` / `donation_external_references`)
2. Alternate transaction/link IDs from payload
3. Date + amount + donor match fallback
4. Ambiguous match -> `integration_review_queue`

## Sync modes

Connection sync settings drive mode:

- `kindfulContactsMode`: `backfill` | `incremental`
- `kindfulTransactionsMode`: `backfill` | `incremental`

Backfill mode defaults on first run, then rolls to incremental.

## Admin UI

Detail page for `kindful` provider includes:

- Integration Settings
- Initial Migration dashboard
- Ongoing Sync dashboard
- Error/Review queue management
- Dead-letter replay
- Cutover readiness + freeze approval

Component:

- `src/components/admin/integrations/kindful-integration-setup.tsx`

API routes:

- `GET/POST /api/admin/integrations/[integrationKey]/kindful/cutover`
- `GET /api/admin/integrations/[integrationKey]/kindful/review-queue`
- `POST /api/admin/integrations/[integrationKey]/kindful/review-queue/[reviewId]/resolve`
- `GET /api/admin/integrations/[integrationKey]/kindful/dead-letter`
- `POST /api/admin/integrations/[integrationKey]/kindful/dead-letter/[deadLetterId]/replay`

## Cutover flow

Readiness checks include:

- Contacts imported with Kindful external IDs
- Transactions imported with Kindful external IDs
- Open failed queue count
- Open review queue count
- Days since last Kindful-only payload activity

Approving cutover writes a report to `integration_cutover_reports` and disables the integration connection.
