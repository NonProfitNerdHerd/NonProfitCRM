# CRM Import Module + Unified Donations Workflow

## 1) Full functional specification for Import Module

### Purpose
Create a metadata-driven import system that safely ingests spreadsheet data (CSV/XLS/XLSX), stages rows, validates entity business rules, detects duplicates, resolves relationships, commits via explicit mode, and supports rollback with auditable row-level change logs.

### Supported entities
- Contact
- Organization Contact
- Donations
- Organizations
- Projects
- Tasks
- Campaigns
- Memberships
- Future entities via `IMPORT_ENTITY_CONFIG`

### Key capabilities
- Multi-format upload (`.csv`, `.xlsx`, `.xls`)
- Header detection + sample preview
- Header-to-field mapping grid
- Field classification (`basic`, `externalKey`, `relationshipKey`)
- Relationship settings per key
- Duplicate detection (batch + CRM)
- Duplicate decision workspace
- Staging rows before commit
- Commit modes (`insert`, `update`, `upsert`, `dry_run`)
- Audit log events for validation/commit/rollback
- Row-level rollback using before/after snapshots

### Wizard flow
1. Select import type and source system
2. Upload file and parse sheet data
3. Map source headers to CRM fields
4. Configure relationship behavior
5. Validate rows + review duplicates
6. Commit with mode + matching strategy
7. View result counts and rollback capability

### Validation rules
- Required field checks from metadata
- Type checks (`email`, `currency`, `date`, `boolean`)
- External key matching checks
- Relationship resolution checks
- Duplicate detection checks
- Entity-specific rules (for donations: non-negative amount)

### Duplicate workflow
- Candidate detection:
  - In-batch key collisions
  - Existing CRM key collisions
- Decisions:
  - `create_new`, `update_existing`, `merge`, `skip`, `hold`
- Decision persistence:
  - row-level decision state
  - dedicated decision history table

### Staging / commit / rollback lifecycle
- Stage:
  - create `import_jobs` batch
  - persist mapped rows into `import_staging_rows`
- Validate:
  - write `row_status`, `validation_errors`, `relationship_resolution`, `duplicate_candidates`
- Commit:
  - execute insert/update/upsert (or dry run)
  - persist before/after row changes in `import_row_change_log`
- Rollback:
  - reverse inserted rows
  - restore updated rows with snapshots
  - stamp rollback metadata

---

## 2) Full functional specification for unified donation workflow

### Goal
Use one donation workflow across:
- Financial → Donations
- Contact Profile → Donations tab

### Shared behavior
- Same API endpoints:
  - `GET /api/donations`
  - `POST /api/donations`
  - `PATCH /api/donations/[id]`
- Same validation schema (`donationSchema`)
- Same service methods:
  - `createDonationForStaff`
  - `updateDonationForStaff`
- Same UI component path:
  - `DonationsManagement` (modal form + detail flow)

### Required fields supported
- Contact (required; fixed/locked in contact context)
- Organization ID (optional)
- Campaign allocations
- Amount and donation date
- Payment method + conditional check/transaction fields
- Notes
- Source system
- External donation ID
- Recurring flag

---

## 3) Page-by-page UI design

### `/staff/imports`
- Card page with 7-step wizard
- Step chips across top
- Mapping table and relationship rules editors
- Validation summary cards
- Duplicate decision actions inline
- Commit panel with mode and match-by fields
- Results table with rollback action

### `/staff/financial/donations`
- Full donations management table
- Filters (campaign/payment/date/donor)
- Add Donation button
- Donation Information action per row
- Unified modal behavior

### `/staff/contacts/[id]` → Donations tab
- Reuses unified donations manager
- Data scoped to contact via `contactId`
- Add Donation button
- Donation Information action
- Contact fixed in modal (pre-selected/locked)

---

## 4) Component hierarchy

### Import module
- `ImportsPage`
  - `ImportWizard`
    - Step selector
    - Upload parser region
    - Mapping grid
    - Relationship rules editor
    - Validation + duplicate workspace
    - Commit options
    - Results + rollback panel

### Donations module
- Financial donations page
  - `DonationsManagement`
    - filter panel
    - donations table
    - donation create/edit/detail modal flow
- Contact workbench donations tab
  - `DonationsManagement` (fixed contact mode)

---

## 5) Shared donation form architecture

- Canonical form shape in UI state:
  - contact, organization, date, amount, payment, source metadata, recurring, allocations
- Canonical payload shape in API:
  - validated via `donationSchema`
- Canonical persistence path:
  - `createDonationForStaff`

---

## 6) Shared donation detail architecture

- One modal/view flow from `DonationsManagement` for both contexts
- Reads same donation row shape and related entities
- Edit mode routes through same `PATCH /api/donations/[id]` endpoint

---

## 7) Import engine design

### Core tables
- `import_jobs` (batch control)
- `import_staging_rows` (row-level staged data and validation state)
- `import_duplicate_decisions` (decision log)
- `import_row_change_log` (before/after for rollback)

### Core services
- `stageImportBatch`
- `validateImportBatch`
- `setDuplicateDecision`
- `commitImportBatch`
- `getImportBatchResults`
- `rollbackImportBatch`

---

## 8) Duplicate detection design

- Match key strategy:
  - defaults from entity metadata (`defaultMatchBy`)
  - override by user input
- Detection tiers:
  1) in-file duplicate key collisions
  2) existing CRM collisions by match fields
- Captured as `duplicate_candidates` per staged row

---

## 9) Relationship resolution design

- Relationship rules in metadata:
  - key
  - related entity/field
  - relationship type
  - no-match behavior
  - multi-match behavior
- Resolution output persisted into `relationship_resolution` per row

---

## 10) Rollback engine design

- Change entries created at commit time:
  - action type (`inserted`, `updated`)
  - target table + row id
  - `before_data` + `after_data`
- Rollback process:
  - reverse order replay
  - delete inserted rows
  - restore updated rows
  - mark rollback status and audit event

---

## 11) API/service layer design

### Import APIs
- `GET /api/imports/wizard/metadata`
- `POST /api/imports/wizard/stage`
- `POST /api/imports/wizard/validate`
- `POST /api/imports/wizard/duplicate-decision`
- `POST /api/imports/wizard/commit`
- `GET /api/imports/wizard/results`
- `POST /api/imports/wizard/rollback`

### Donation APIs
- `GET /api/donations` (supports `contactId` filtering)
- `POST /api/donations`
- `PATCH /api/donations/[id]`

---

## 12) Data model schema (high-level)

### Added
- `import_staging_rows`
- `import_duplicate_decisions`
- `import_row_change_log`
- `import_jobs` rollback/mode columns
- external key columns on importable entities
- `donations.crm_organization_id`

### Existing leveraged
- `import_jobs`, `import_mappings`
- `donations`, `donation_allocations`
- `audit_log`

---

## 13) Frontend scaffolding plan

1. Metadata-driven step wizard shell
2. File parser abstraction for CSV/XLS/XLSX
3. Mapping grid with auto-map and field classification
4. Relationship settings editor
5. Validation and duplicate workspace
6. Commit mode panel
7. Results + rollback panel
8. Shared donations manager reuse for contact + financial contexts

---

## 14) Backend/service scaffolding plan

1. Import engine module with staging/validation/commit/rollback functions
2. API route split by wizard lifecycle
3. Entity metadata config for extensibility
4. Row-level change logs for deterministic rollback
5. Donation service consolidation under `lib/data/donations.ts`
6. API alignment so both financial and contact flows hit the same donation endpoints

