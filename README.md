# NonprofitCRM Multi-Tenant SaaS Foundation

Production-ready MVP foundation for a **shared-application, shared-database** nonprofit platform built with:

- Next.js (App Router) + TypeScript
- Supabase (Postgres, Auth, Storage-ready)
- Tailwind CSS
- React Hook Form + Zod
- Vercel deployment model

---

## 1) Architecture First: Why Shared App + Shared DB

This project is intentionally designed as a **single codebase + single frontend deployment + single Postgres database** that serves multiple nonprofits (tenants).

### Why this is the right MVP pattern

- **All nonprofits get updates instantly:** one deployment, no per-tenant app forks.
- **Lower operational overhead:** no per-tenant infra orchestration.
- **Fast product iteration:** schema and feature evolution happen centrally.
- **Strong isolation:** tenant boundaries enforced in Postgres via `organization_id` + RLS, not only UI filtering.

### Tenant isolation model

- Every tenant-owned row includes `organization_id`.
- Users authenticate via Supabase Auth (`auth.uid()`).
- User access to org data is determined through `organization_memberships`.
- Every policy checks active membership and permission context.

### RLS as primary security boundary

- Row Level Security is enabled on all tenant-owned tables.
- `USING` and `WITH CHECK` policies enforce org membership and permission checks.
- Guessed IDs cannot bypass tenant checks because RLS evaluates row-by-row in Postgres.

### Portal identity restrictions

- Portal users are linked directly to `contacts.portal_user_id`.
- Portal queries are constrained by both:
  - active org membership
  - contact linkage (`contact_id = app.current_contact_id(organization_id)` or `portal_user_id = auth.uid()`)
- Portal users only see records classified as `portal_visible`.

### Role templates + permission enforcement

- `role_templates` are default bundles (Volunteer, Data Entry, Staff Non-PII, Staff PII, Administrator, Executive Staff).
- `permissions` are the enforcement unit.
- `organization_memberships.role_template_id` grants a set of permissions via `role_template_permissions`.
- App logic and SQL policies evaluate `has_permission(org_id, permission_key)` rather than role names.

### Visibility classification enforcement

Enum: `visibility_classification`

- `staff_public`
- `staff_restricted`
- `pii_protected`
- `portal_visible`
- `internal_only`

Applied to `notes`, `tasks`, `communication_log`, `notifications`, and report field metadata where needed.

### PII controls

PII is controlled in layered fashion:

1. **RLS:** blocks unauthorized rows and tenant leakage.
2. **Secure views/query models:** `contacts_safe_view`, `notes_safe_view`, `tasks_safe_view` redact sensitive fields/content when permissions are missing.
3. **Service layer:** report/export field filtering blocks unauthorized PII fields and non-exportable fields.
4. **UI:** hides unavailable controls, but is not trusted as a security boundary.

### Reporting and export governance

- Report metadata in `report_fields` controls selectable/filterable/sortable/exportable behavior.
- `required_permission_key` + `is_pii` gate fields per user.
- Report execution and exports are logged in `report_runs` and `audit_log`.
- CSV and Excel exports apply same authorization filtering as previews.

### Import and migration architecture

- Import pipeline tables:
  - `import_jobs`
  - `import_mappings`
- Status lifecycle: `uploaded → mapped → validated → processing → completed/failed`
- CSV foundation for contacts + donations.
- Idempotent upsert support through external IDs:
  - `contacts`: `(organization_id, external_source, external_source_id)`
  - `donations`: `(organization_id, source_platform, external_transaction_id)`
- Source lineage retained for systems like Kindful, WebConnex, and similar exports.

### Future extensibility

This foundation is designed for future:

- integration APIs/webhooks
- campaign/fund/designation modules
- recurring billing and payment gateway adapters
- workflow automations
- advanced report domains
- custom role overrides and temporary elevation models

---

## 2) Project Structure

```text
.
├── src/
│   ├── app/
│   │   ├── (staff)/staff/...               # staff/admin UI
│   │   ├── (portal)/portal/...             # constituent portal UI
│   │   └── api/...                         # route handlers (contacts/imports/reports/portal)
│   ├── components/
│   │   ├── layout/                         # side nav + headers
│   │   ├── forms/                          # RHF + Zod forms
│   │   └── ui/                             # reusable UI primitives
│   ├── lib/
│   │   ├── auth/                           # session + permission guards
│   │   ├── data/                           # service/repository layer
│   │   ├── supabase/                       # server/client/middleware clients
│   │   └── validation/                     # Zod schemas
│   └── types/
│       └── database.ts
├── supabase/
│   ├── migrations/
│   │   ├── 202603130001_initial_schema.sql
│   │   ├── 202603130002_rls_policies.sql
│   │   └── 202603130003_grants.sql
│   └── seed.sql
└── README.md
```

---

## 3) Database Coverage

Implemented required tables:

- organizations
- profiles
- organization_memberships
- role_templates
- permissions
- role_template_permissions
- contacts
- households
- contact_relationships
- notes
- tasks
- donations
- membership_types
- memberships
- import_jobs
- import_mappings
- communication_log
- notifications
- report_fields
- saved_reports
- report_runs
- audit_log

Each tenant-owned table includes `organization_id`.

---

## 4) Security Enforcement Matrix

### Enforced by RLS

- tenant boundary isolation by `organization_id`
- membership validation (`app.has_active_membership`)
- permission checks (`app.has_permission`)
- portal self-scoping for contact-linked records
- visibility restrictions for notes/tasks/comms/notifications

### Enforced by secure views/query model

- `contacts_safe_view`: PII field redaction without `can_view_pii`
- `notes_safe_view` / `tasks_safe_view`: body/description redaction for PII content

### Enforced by service layer

- report field authorization (`required_permission_key`, `is_pii`)
- export restrictions (`is_exportable`, export permission)
- import processing rules and idempotent upserts
- audit event creation for sensitive flows

### Enforced by UI and route guards

- staff/portal route segmentation
- permission-guarded pages and APIs
- form validation with RHF + Zod

---

## 5) Setup

### Prerequisites

- Node 20+
- Supabase project

### Environment

Copy and fill env vars:

```bash
cp .env.example .env.local
```

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (reserved for future privileged background tasks)
- `NEXT_PUBLIC_APP_URL`

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

### Supabase migrations

Run migrations in order:

1. `supabase/migrations/202603130001_initial_schema.sql`
2. `supabase/migrations/202603130002_rls_policies.sql`
3. `supabase/migrations/202603130003_grants.sql`
4. `supabase/seed.sql`

---

## 6) Key MVP Capabilities Included

- staff console foundation (dashboard, contacts, donations, memberships, tasks, imports, reports, admin, audit)
- portal foundation (dashboard, profile, donations, membership, communications, settings)
- permission-driven role model
- sensitivity-aware records and report metadata
- report builder foundation with CSV/Excel export
- import/migration foundation for contacts + donations
- audit logging hooks for sensitive actions

---

## 7) Notes for Next Iterations

- add background queue workers for large imports/report exports
- add field-level masking by role overrides
- add user permission overrides (`user_permission_overrides`)
- add organization custom role templates
- add webhook/API key management for integrations
- add richer saved report filters, joins, and scheduled delivery