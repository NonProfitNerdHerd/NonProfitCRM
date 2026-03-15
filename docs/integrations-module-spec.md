# Administrator → Integrations Functional Specification

## 1) Module scope

The Integrations module is a reusable administration platform for third-party provider syncs.

- Entry point: `Administrator → Integrations`
- First provider: **Webconnex**
- Extensible for future providers: Kindful, Stripe, QuickBooks, Mailchimp, etc.

## 2) Administrator UX

### 2.1 Integrations Dashboard
Route: `/staff/admin/integrations`

Features:
- Summary cards:
  - Total Integrations
  - Enabled Integrations
  - Failed Jobs
  - Last 24h Sync Activity
- Integration list with:
  - Integration Name
  - Provider Type
  - Description
  - Status
  - Connection Status
  - Last Sync Date
  - Last Sync Result
  - Enabled/Disabled
  - Actions
- Per-row actions:
  - Open
  - Test Connection
  - Run Sync
  - Enable/Disable
- Search and status filter

### 2.2 Webconnex detail
Route: `/staff/admin/integrations/webconnex`

Tabs:
1. Overview
2. Configuration
3. Sync Settings
4. Field Mapping Summary
5. Sync History
6. Error Queue

Overview actions:
- Test Connection
- Run Contact Sync
- Run Donation Sync
- Run Full Sync
- Retry Failed
- Enable/Disable

## 3) Reusable architecture

### 3.1 Registry/metadata
- `IntegrationRegistryService`
- Reads active providers from `integration_definitions`

### 3.2 Configuration
- `IntegrationConfigurationService`
- Ensures per-org connection record exists
- Stores:
  - base URL
  - auth type
  - secret reference key
  - timeout/retry
  - sync settings
  - field mappings

### 3.3 Provider client layer
- `WebconnexApiClient`
- Responsibilities:
  - test connection
  - contacts endpoint calls
  - transactions endpoint calls
  - pagination
  - retries/backoff
  - timeout handling

### 3.4 Sync service layer
- `WebconnexSyncService`
  - orchestrates contact + donation sync
  - starts/completes jobs
  - updates connection health and checkpoint metadata
- `ContactSyncService`
  - idempotent upsert using `contact_external_references`
- `DonationSyncService`
  - idempotent upsert using `donation_external_references`
  - resolves contact by Webconnex external contact id first
- `IntegrationRetryService`
  - retries queued failures
- `IntegrationJobRunner`
  - provider-dispatch runner

### 3.5 Job/scheduler layer
- `IntegrationSchedulerService`
  - evaluates enabled connections with scheduled mode
  - supports hourly/daily/custom buckets
  - runs due jobs via provider runner
- Scheduled endpoint:
  - `POST /api/admin/integrations/scheduled`
  - token-gated with `INTEGRATION_SCHEDULER_TOKEN`

### 3.6 Logging/error layer
- `IntegrationLogService`
  - creates job records
  - writes row-level sync logs
  - writes/reads error queue

## 4) Data model

Migration: `202603130021_integrations_framework.sql`

Tables:
- `integration_definitions`
- `integration_connections`
- `integration_sync_jobs`
- `integration_sync_logs`
- `integration_error_queue`
- `contact_external_references`
- `donation_external_references`

Permission:
- Adds `can_manage_integrations`
- Assigned to `administrator` role template

RLS:
- RLS enabled for integration tables
- Access gated by:
  - active membership
  - `can_manage_integrations`

Seed:
- Inserts/updates definition for `webconnex`

## 5) API endpoint design

Implemented admin APIs:
- `GET /api/admin/integrations`
- `GET /api/admin/integrations/:integrationKey`
- `PUT /api/admin/integrations/:integrationKey/configuration` via `PUT /api/admin/integrations/:integrationKey`
- `POST /api/admin/integrations/:integrationKey/test-connection`
- `POST /api/admin/integrations/:integrationKey/sync/contacts`
- `POST /api/admin/integrations/:integrationKey/sync/donations`
- `POST /api/admin/integrations/:integrationKey/sync/all`
- `POST /api/admin/integrations/:integrationKey/sync/retry-failed`
- `GET /api/admin/integrations/:integrationKey/jobs`
- `GET /api/admin/integrations/:integrationKey/jobs/:jobId`
- `GET /api/admin/integrations/:integrationKey/errors`
- `POST /api/admin/integrations/:integrationKey/errors/:errorId/resolve`
- `POST /api/admin/integrations/scheduled` (scheduler execution hook)

## 6) Webconnex sync rules implemented

### Contact sync
- Primary match: `contact_external_references` by `(org, source_system=webconnex, external_record_id)`
- Optional fallback: email, if configured in sync settings
- Create/update CRM contacts
- Upsert external reference row
- Log result; enqueue errors on failures

### Donation sync
- Primary match: `donation_external_references` by external transaction ID
- Contact resolution:
  1. by Webconnex external contact id
  2. optional email fallback if configured
- Create/update CRM donations
- Upsert donation external reference row
- Log result; enqueue unresolved relationship failures

## 7) Security design

- Integrations pages/API guarded by `can_manage_integrations`
- API credentials are never exposed in UI
- UI stores only `api_key_reference` (env secret key reference)
- Provider client resolves secret server-side only
- Scheduler endpoint requires bearer token

## 8) Folder structure (recommended / implemented)

- `src/app/(staff)/staff/admin/integrations/...`
- `src/app/api/admin/integrations/...`
- `src/components/admin/integrations/...`
- `src/lib/integrations/...`
- `src/lib/data/integrations.ts`
- `supabase/migrations/202603130021_integrations_framework.sql`

## 9) Extensibility pattern

To add a new provider:
1. Insert provider in `integration_definitions`
2. Add provider API client in `src/lib/integrations`
3. Add provider sync service
4. Register in `IntegrationJobRunner`
5. Add provider-specific mapping defaults in configuration service
6. Reuse existing dashboard, job history, error queue, and scheduler
