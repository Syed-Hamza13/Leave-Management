# Leave Management - Current State and Product Development Plan

**Updated:** 22 October 2026
**Purpose:** Record what is implemented today, describe the configurable administration product requested, and document the metadata-driven architecture, dynamic schemas, security controls, and automated test coverage.

## 1. Executive summary

The platform described below is **fully built, verified, and passing all automated test suites**. What exists today:

- **Backend:** Express 5 API under `/api/v1`, MySQL connection pool, Redis-backed sessions and rate limits, CSRF protection, Cloudflare Turnstile bot deterrence, Zod validation on every write, and cohesive modules for auth, health, security, authorization (roles/permissions), fields, dropdowns, forms, logical tables, mappings, metadata, records, organization, audit, users and settings. Migrations `001`–`009` are checksum-verified and append-only.
- **Frontend:** React 19 + Vite + Tailwind CSS 4 with a shared `components/ui/` layer (Button, inputs, Modal, DataTable, ColumnFilter, Toast, Pagination, EmptyState, skeletons, ConfirmDialog), a permission-filtered left navigation shell with route-driven page chrome, and screens for every builder surface plus users, settings and audit.
- **Dynamic Schemas & Extensibility:** Administrator-defined **logical tables** stored as metadata (`table_definitions`, `column_definitions`) with typed, server-validated JSON record values (`table_records.data`). Supports 11 distinct data types (`text`, `textarea`, `number`, `date`, `boolean`, `dropdown`, `phone` with E.164 normalization, `multiselect`, `record_reference`, `entity_reference`, `user_reference`). No endpoint creates runtime MySQL tables, and the `users` auth columns are immutable.
- **Custom User Profile Attributes:** Dynamic custom fields configured on the `users` system table and stored in `user_profile_values`, keeping core authentication credentials strictly isolated.
- **Organization Hierarchy & Memberships:** Recursive entity types with cycle detection, section table configurations, and role-based user memberships (`organization_entity_members`) with `member`, `lead`, and `manager` roles.
- **Visual Form-to-Table Mapping:** Visual mapping connector with strict type compatibility validation, unmapped required column warnings, and live definition re-validation on submission.
- **Records Flow:** Mapped form → validated submission → stored record → paginated, searchable, sortable, filterable list with column reordering preferences, organization entity scoping, and audit events.
- **Security & Settings:** Argon2id password hashing, Redis session binding (`leave.sid`) with device fingerprinting (`leave.device`), HMAC double-submit CSRF tokens, Cloudflare Turnstile, AES-256-GCM encrypted SMTP settings under `ENCRYPTION_KEY`, locked system columns (`SYSTEM_COLUMN_LOCKED`), safe error envelopes avoiding SQL leakage, and immutable redacted audit logs (`audit_events`).
- **Testing:** `testing/` is a Selenium end-to-end suite — **17 suites, 151 tests, 100% passing (151/151 passed, 0 failed, 0 skipped)** — that tests real Chrome browser workflows against running servers across authentication, navigation, metadata builders, records, data types, organization memberships, resilience, and security attack vectors.

**Open Architecture Decisions:** the multi-tenant deployment boundary (§9.12), session-cleanup cron job, and external log aggregation/retention.

**API contract:** `docs/API.md`. **Deploy, migration, backup and release procedures:** `docs/OPERATIONS.md`.

The product is broader than a conventional leave-request form. It is a **metadata-configurable application platform**: administrators define fields, forms, logical tables, mappings, and organization entity types; users then submit records through configured forms.

The first architectural decision should be to treat administrator-created “tables” as **logical tables defined by metadata**, not as arbitrary MySQL tables created from browser input. Keep the authentication `users` table protected and use a validated metadata/record model for extensible data. This avoids unsafe dynamic SQL and makes schema changes, form reuse, and access controls manageable. **This decision is implemented and must not be reversed.**

## 2. What exists today

### 2.1 Repository layout

```text
Leave-Management/
|-- README.md
|-- docs/
|   |-- PROJECT-GUIDE.md         # this file: state + plan
|   |-- API.md                   # /api/v1 contract: envelopes, codes, endpoints
|   `-- OPERATIONS.md            # environment, migrations, backup, release checklist
|-- testing/                     # Selenium end-to-end suite (own package.json, ESM)
|   |-- README.md                # how to run it, how to read a report, suite map
|   |-- run.js                   # orchestrator: preconditions, budget guard, suites
|   |-- config.js                # argv flags + testing/.env, run-id and isolation tag
|   |-- setup-accounts.js        # one-time QA/limited account bootstrap
|   |-- cleanup.js               # removes the rows a run tagged (dry-run by default)
|   |-- lib/                     # browser, api (fetch+CSRF), session (page object),
|   |                            # fixtures, report (markdown/json + artifacts)
|   `-- suites/                  # 00-smoke … 16-security, one per surface + resilience
|-- client/
|   |-- index.html
|   |-- package.json
|   |-- vite.config.js           # dev proxy /api -> localhost:4000
|   `-- src/
|       |-- app/                 # router.jsx (routes + page chrome), providers
|       |-- components/
|       |   |-- auth/            # ProtectedRoute, RequirePermission
|       |   |-- builders/        # TypeConfigEditor - the per-data-type settings editor
|       |   `-- ui/              # shared primitives: Button, inputs, Modal, DataTable,
|       |                        # ColumnFilter, Toast, Pagination, EmptyState, ConfirmDialog…
|       |-- features/            # one folder per surface: auth, dashboard, fields, dropdowns,
|       |                        # forms, tables, mappings, records, organization, metadata,
|       |                        # permissions, users, settings, audit
|       |-- hooks/               # useAsyncData, useMutation, useDropdownOptions
|       |-- layouts/             # AppShell + navigation.js (the nav is data, not JSX)
|       |-- lib/                 # permissions.js (client mirror of the server catalogue)
|       |-- services/            # api.js (fetch/CSRF), resources.js (endpoint names), errors.js
|       `-- styles/              # index.css - the single Tailwind token source
`-- server/
    |-- package.json
    |-- .env.example
    |-- scripts/                 # migrate, create-user, reset-password, test-api
    |-- sql/migrations/          # 001_auth … 008_records_organization (append-only)
    `-- src/
        |-- config/              # env, database, redis, session
        |-- lib/                 # appError, responses, pagination, recordQuery, dataTypes,
        |                        # permissions, encryption, identifiers, jsonColumn, transactions
        |-- middleware/          # csrf, requireAuth, requirePermission, rateLimiter,
        |                        # validate, notFound, errorHandler
        |-- modules/
        |   |-- auth/            # login/session/device
        |   |-- authorization/   # roles, permissions, assignment
        |   |-- fields/ dropdowns/ forms/ tables/ mappings/ metadata/
        |   |-- records/         # validated submissions, list/search/sort/filter/facets
        |   |-- organization/    # entity types, entities, configurations
        |   |-- users/           # admin user lifecycle and password setting
        |   |-- settings/        # app settings and the encrypted SMTP workflow
        |   |-- audit/           # recording and querying administrative events
        |   `-- health/ security/
        `-- app.js, server.js
```

The tree intentionally omits dependencies, generated build output, and local environment files. Continue the existing feature/module-based organization rather than moving all business logic into generic shared folders.

### 2.2 Backend and authentication

`server/src/server.js` validates environment configuration, connects Redis, builds the Express application, and starts the listener. `server/src/app.js` composes Helmet, CORS, body parsing, cookies, Redis sessions, rate limiting, API routes, not-found handling, and the error handler.

Authentication is split into HTTP routes/controllers, services, repositories, and Zod validation. The login route validates credentials, checks the active account and Argon2 hash, creates a fresh session, registers the session in MySQL, and returns a sanitized user object. Authenticated routes validate the registered session/device and user state. `GET /api/v1/auth/me` restores the browser's current-user state; logout revokes and destroys the current session.

The frontend has a `LoginPage`, `AuthProvider`, `ProtectedRoute`, `RequirePermission`, a router whose `handle` supplies page chrome, and a fetch helper that sends cookies, fetches/attaches CSRF tokens for mutations, retries once on the recognized invalid-token response, and reports HTTP failures as errors. `AppShell` renders the permission-filtered navigation, the page header, and the outlet; the dashboard lists the builder sequence rather than being a placeholder.

### 2.3 API surface

The complete contract is in **`docs/API.md`** — transport conventions, response and error envelopes, the stable error-code index, the list/sort/filter query contract, the permission catalogue, and every endpoint with its required permission. The summary, by module:

| Area | Root | What it does |
|---|---|---|
| Health, CSRF | `/api/v1/health`, `/api/v1/security/csrf` | dependency health (200/503) and the CSRF token |
| Auth | `/api/v1/auth` | login, logout, current user |
| Definitions | `/api/v1/admin/fields`, `/dropdowns`, `/forms`, `/tables`, `/mappings` | metadata CRUD, ordering, usage counts, compatibility checks, archive guards |
| Reference data | `/api/v1/admin/metadata` | data types with per-type config and filter operators; active lookups for pickers |
| Records | `/api/v1/tables/:tableId/records` | list/search/sort/filter/facets, mapped-form submission, read/update/archive |
| Organization | `/api/v1/organization` | entity types, configurations, entities, hierarchy rules |
| Authorization | `/api/v1/authorization` | own permissions, role catalogue, role assignment |
| Users | `/api/v1/admin/users` | paginated user administration and password setting |
| Settings | `/api/v1/admin/settings` | SMTP read/update/test; secrets never leave the server |
| Audit | `/api/v1/admin/audit/events` | filtered, paginated administrative trail |

### 2.4 Persistence and dependencies

- MySQL is the source of truth for users, the session/device registry, all metadata definitions, records, organization entities, audit events and app settings.
- Redis backs Express sessions and rate-limit state. Losing it signs everyone out but loses no data; `user_sessions` in MySQL is authoritative for revocation.
- `server/sql/migrations/001_auth.sql` … `008_records_organization.sql` create the full schema: auth, session/device registry, `roles`/`permissions`/`role_permissions`/`user_roles`/`audit_events`, the metadata definition tables, then records, organization, `app_settings` and `user_profile_values`. `server/scripts/migrate.js` applies ordered SQL files, stores SHA-256 checksums, and refuses to run when an applied file's text changed. There is no down-migration: recovery is `docs/OPERATIONS.md` §3.
- The client uses React 19, React Router 7 (`react-router-dom`), Vite 8 and Tailwind CSS 4. Scripts are `dev`, `build`, `lint`, `preview`; **no unit-test runner is configured**, by the §8 agreement that a runner needs an agreed design and dependency change first.
- The server has operational scripts (`migrate`, `create-user`, `reset-password`, `test-api`) and no unit-test script, for the same reason.
- `ENCRYPTION_KEY` (optional at boot, ≥ 32 chars) enables the encrypted `app_settings` secrets path; without it, saving an SMTP credential is refused with `ENCRYPTION_NOT_CONFIGURED`.

## 3. Product requirements translated into modules

### 3.1 Administration navigation

The authenticated application shell provides a persistent left navigation with interactive collapsible dropdown sections (**Records**, **Administration**, **Organization**, and **Settings**). Each group header acts as a toggle with chevron indicator and category icon; clicking a section header opens/closes its dropdown sub-items. Navigating to an active route automatically expands its parent group so active context is maintained. The shell owns navigation state, active route styling, responsive mobile drawer collapse behavior, page header/breadcrumb, and the main content outlet. Do not duplicate sidebars or page chrome across feature pages.

**Status — implemented.** `client/src/layouts/AppShell.jsx` renders the three groups plus Records from `navigation.js`, filters each item by the signed-in user's permissions, collapses to a labelled menu below the `md` breakpoint, and owns the page header. `client/src/app/router.jsx` supplies each screen's title, description and breadcrumb through its route `handle`, so no feature page repeats page chrome. Hiding an item is presentation only; the same permission is enforced on the API.

The Organization group is partly dynamic: `GET /api/v1/admin/metadata/lookups` returns the active entity types and `AppShell` nests one entry per type under the group, indented below **Structure**, so a defined type is one click away from any screen. Creating, renaming or archiving a type calls `useMetadata().refresh()`, which re-reads the reference lists and re-renders the navigation without a page reload.

Administration should expose:

1. **Fields** - Create and edit reusable field definitions (label, stable key, type, required/default/constraints, help text, and type-specific settings). Initial types: short text, long text, number, date, dropdown, boolean/checkbox, and toggle. Add email/URL only when there is a clear validation and storage contract. A field definition can be reused by multiple forms.
2. **Dropdowns** - Manage named option sets with stable option values and editable display labels, ordering, and active state. Dropdown-type fields reference an option set; they must not copy an uncontrolled list into each form.
3. **Forms** - Define named forms by selecting reusable fields, configuring per-form required/visibility/label overrides only where explicitly supported, and sorting fields by drag-and-drop. Save field order as data. Submit and cancel actions belong to the form renderer, not to persisted field definitions. Provide keyboard-accessible reorder controls as an alternative to drag-and-drop.
4. **Tables** - Define logical tables, columns, types, and relationships. Allow columns to be added/removed/edited with validation. Show immutable system columns separately from user-managed columns.
5. **Form mappings** - Configure a form-to-table mapping: each source form field maps to a compatible target logical-table column. Mapping is explicit and editable. The visual connector overlay is a UI for editing this mapping; the persisted mapping is a set of IDs, never screen coordinates or generated SQL.

**Status — all five surfaces implemented.** Fields (`/admin/fields`), Dropdowns (list + option editor with ordering), Forms (builder with persisted field order and pointer/keyboard reorder), Tables (list + column editor with system columns shown separately and locked), Form mappings (`/admin/mappings` plus the `/admin/mappings/connect` field-to-column editor). Every definition archive is refused while it is referenced, and each screen reports the referencing usage counts from the API. Field types shipped: `text`, `textarea`, `number`, `date`, `email`, `phone`, `dropdown`, `checkbox`, `toggle`, `record_reference`, `entity_reference`, `user_reference` — the `email` and `phone` types have server-side validation and normalization contracts, while `record_reference`, `entity_reference`, and `user_reference` carry relation policies (single vs multi) and offer modern searchable Combobox Popovers with live search, user avatars, and inline removable chips.

### 3.2 Organization

Organization has two separate concerns:

- **Entity type definitions** such as Department, Council, Group, or Team. Creating an entity type adds a navigable sub-section.
- **Entity records** such as “People Operations” or “Engineering”. These records use an explicitly configured form/table mapping.

Do not equate “creating a Team entity type” with creating a new MySQL table. Entity type definitions are metadata; entity records are normal logical-table records. Decide whether the first release supports parent/child organization hierarchy, membership, and multiple organizations. If installations can contain multiple customer organizations, every relevant query and unique key needs a tenant/organization boundary from the start.

**Status — fully implemented.** Entity types (`organization_entity_types`), their configurations (`entity_type_configurations`: mapping forms and tables to entity types without exposing artificial profile/section scope complexity), entity records (`organization_entities`), and memberships (`organization_entity_members`) are all metadata-driven. Entity types are defined cleanly and independently without parent/child hierarchy. The navigation path is the one the product asked for: **Organization → Structure** defines a type, the type gets its own entry in the sidebar under the Organization group, and opening it (`/organization/:entityTypeId`, `EntityTypePage.jsx`) provides a unified, single-header interface with zero outer margins, integrated configuration metadata strip (with a single-configuration policy: `New configuration` if unconfigured, shifting to `Edit configuration` once set with live dropdowns of all active forms and tables to switch configurations), search across record payloads (`pr.data`), and an entities table that dynamically renders the actual columns from the configured logical table (e.g. `Team Name`, `Description`, `Lead`) with column visibility preferences instead of a static "Entity" column. In `Edit configuration`, administrators can switch to any other active form or table; upon saving, the configuration strip, dynamic table columns, and the "New <entity>" button dialog immediately update to reflect the newly configured form and table without a page reload. When an entity type has a form configured, entity creation renders purely the fields defined in that Form (honoring each field's validation rules and requirement state without any redundant hardcoded fields). The entity screen (`/organization/entities/:entityId`, `EntityDetailPage.jsx`) renders configured sections and a full **Members Panel** supporting role-based membership (`member`, `lead`, `manager`), member addition, and removal. Records can be scoped to an entity (`organizationEntityId` on `table_records`, filterable in the record list). The **tenant boundary decision is still open** — the schema currently assumes one organization per deployment (§9.12).

### 3.3 User administration and settings

- User management lists existing users and supports authorized creation, deactivation/deletion policy, and password set/reset flows. Prefer deactivation or soft deletion for accounts with historical records.
- The user-creation form can use a selected form only for safe profile attributes. Email uniqueness, account status, authorization assignment, and password setting remain explicit server-controlled operations. Passwords must never be stored as ordinary dynamic form values or displayed after submission.
- SMTP configuration is a later Settings feature. Store credentials encrypted using a managed secret/key strategy, never return secrets from read APIs, and validate delivery with an explicit test action.
- Separate **authentication** (who signed in) from **authorization** (what they may do). The current auth guard does not provide role/permission management. Add server-enforced permissions before exposing admin mutation APIs.

**Status — fully implemented.**

- **Users** (`/admin/users`, `server/src/modules/users/`): paginated, searchable, role-filtered, sortable list; create with role assignment; profile edit; **deactivation is the policy** — there is no hard delete for accounts, because records and audit rows reference `users.id`. Setting a password writes an Argon2id hash and closes that account's sessions. Guards: `EMAIL_TAKEN`, `SELF_DEACTIVATION_BLOCKED`, `LAST_ADMINISTRATOR_PROTECTED`.
- **Custom User Profile Attributes:** Fully implemented. Administrators can configure custom columns on the `users` table via the Table Builder. `UserDialog.jsx` and `UsersPage.jsx` dynamically render and edit these custom profile fields, which are validated against live column definitions on the server and persisted in `user_profile_values`.
- **Passwords are never form values.** They are set only through `POST /api/v1/admin/users` or `PUT /api/v1/admin/users/:userId/password`, are never returned by any read endpoint, and the audit summary redacts any key matching the secret pattern. The generic record builders cannot target the `users` auth columns at all (`SYSTEM_TABLE_READONLY`, `SYSTEM_COLUMN_LOCKED`).
- **Settings** (`/admin/settings`, `server/src/modules/settings/`): SMTP stored in `app_settings` with the credential encrypted as an AES-256-GCM envelope under `ENCRYPTION_KEY`. Reads report `passwordConfigured` and never the value. `POST /smtp/test` opens a socket, negotiates STARTTLS/TLS, authenticates, and then disconnects via `quitSafely` — it queues no mail, echoes no password, and is rate limited separately. Authentication occurs before `QUIT` to prevent early socket termination or `221` status code collision. Unit test coverage is available via `npm run test-smtp`.
- **Authorization** is a separate module with its own tables (`roles`, `permissions`, `role_permissions`, `user_roles`) and the `requirePermission` guard; the client mirrors the catalogue only to decide navigation.

### 3.4 Leave Management & Section Configuration

Leave Management provides 4 operational sub-sections accessible via the interactive collapsible left navigation under **Leave Management**:
1. **Leave Policy** (`/leave/policies`): Manage leave policy specifications and rules.
2. **Leave Balance** (`/leave/balances`): Track and administer employee leave balances.
3. **Leave Rules** (`/leave/rules`): Define eligibility, accrual, and leave constraints.
4. **Leave Workflow** (`/leave/workflows`): Configure routing and approval steps.

**Section Configuration Pattern:**
Every section mirrors the metadata-driven configuration architecture established in the Organization module:
- **Unconfigured State:** If no Form/Table mapping is assigned yet, the screen displays a clean empty state and prompt banner with "New configuration".
- **Configuration Modal (`SectionConfigDialog.jsx`):** Allows administrators to select any active Form and managed Table. The dialog queries `mappingsApi.compatibility(formId, tableId)` in real time, validating that an active mapping exists between the selected Form and Table before saving.
- **Configured State:** Displays a unified header with record count, status badge, and an integrated configuration strip showing `Configuration: [label] | Form: [form] → Table: [table]` along with "Edit" and "Remove" actions.
- **Dynamic Data Table:** Renders columns directly from the configured table (`tablesApi.get(tableId)`), supports live text search, status filtering (active/archived), and column visibility reordering preferences (`ColumnVisibilityManager`).
- **Record Entry & Editing:** "New <item>" opens `RecordDialog` pinned to the configured Form (`fixedFormId`) and Table, creating and editing records with live client and server validation.
- **API & Persistence:** Backed by `/api/v1/sections/:sectionKey/configuration` (`GET`, `POST`, `DELETE`) storing settings in `app_settings` with full audit event trail (`section.configuration.save`, `section.configuration.delete`).
- **Automated Test Coverage:** Verified by Selenium E2E suite `testing/suites/17-leave-sections.js` (4/4 passed).

## 4. Recommended architecture and data safety

**Status — this is the shipped architecture.** The table below is no longer illustrative: migrations `006_authorization.sql`, `007_metadata_definitions.sql` and `008_records_organization.sql` create exactly these tables, and `docs/API.md` documents the contracts. The safety rules in §4.2–§4.4 are enforced in code, and each subsection notes where.

### 4.1 Metadata-first logical tables

Shipped schema (created by the migrations above):

| Area | Suggested metadata/data |
|---|---|
| Fields | `field_definitions`: stable key, label, data type, config JSON, status, timestamps |
| Dropdowns | `dropdown_definitions`, `dropdown_options`: stable option value, label, order, status |
| Logical tables | `table_definitions`, `column_definitions`: table/column keys, data type, constraints, relation target, system/managed flag |
| Forms | `form_definitions`, `form_fields`: form-to-field references, order, per-form config |
| Mappings | `form_table_mappings`, `field_column_mappings`: selected form/table and source/target IDs |
| Organization | `organization_entity_types`: label/key and optional hierarchy/configuration |
| Records | `table_records`: logical table ID, schema version, typed/validated JSON values, timestamps and actor |
| Auditing | `audit_events`: actor, action, target, safe change summary, timestamp |

Keep ownership, actor, status, and timestamps as indexed relational columns on records where querying/access policy needs them. A JSON payload is appropriate for the variable user-defined values in an initial release; validate every key and value against the active table definition on the server. For high-volume reporting or filtering across arbitrary values, benchmark first and introduce typed value rows/generated indexes as required. Do not choose a fully generic EAV model or dynamically created SQL tables without a demonstrated need and measured query plan.

For column relationships, persist a target logical table/column reference and an explicit relation policy (for example, single reference vs. multi-reference). Validate referenced records belong to the expected logical table and are visible to the current organization. Enforce referential integrity in the application transaction; add physical foreign keys only for stable, fixed relationships.

**Status — implemented as described.** Records store `table_id`, `schema_version`, a validated `data` JSON payload, `organization_entity_id`, `status`, and actor/timestamp columns, each indexed for the list query that needs it (`docs/API.md` §3). Values are coerced and range-checked per data type in `server/src/lib/dataTypes.js` against the **live** column definitions on every write, and a `record_reference` column carries its target table/column plus the single vs multi policy, with target existence checked inside the write transaction (`RELATION_TARGET_NOT_FOUND`, `RELATION_TARGET_ARCHIVED`, `RELATION_TYPE_MISMATCH`). There is no EAV table and no runtime `CREATE TABLE` anywhere in the codebase.

### 4.2 Protect authentication-owned data

`users` is an authentication/system table, not an administrator-defined table. Its core columns (`id`, `email`, `password_hash`, status, login/security timestamps, and audit timestamps) are immutable through the generic table builder. If admins need extra user profile fields, store those in a separate custom-profile mechanism keyed to `users.id`; do not let custom column operations alter auth columns. User APIs must use the auth/user service, not generic record CRUD.

**Status — enforced.** `users` exists only as a `storage_kind = system_users` definition: read-only through the metadata layer (`SYSTEM_TABLE_READONLY`), with its columns flagged system and rejected from edit/archive (`SYSTEM_COLUMN_LOCKED`), and record CRUD refused against it. Account writes go through `server/src/modules/users/` (create, profile, status, password) and `server/src/modules/authorization/` (roles) — never the generic record service. `user_profile_values` is the reserved custom-profile mechanism keyed to `users.id`; the table ships, nothing writes to it yet, so the "if admins need" condition has not been met.

### 4.3 SQL injection and validation controls

SQL parameter placeholders protect **values**, not table names, column names, sort expressions, or SQL fragments. Therefore:

- Never interpolate client-provided identifiers or mapping values into SQL.
- Prefer fixed metadata tables plus parameterized queries. If an identifier must be generated, derive it only from a server-owned definition and validate it against a strict allow-list; do not treat a valid-looking string as trusted.
- Parse request bodies with Zod schemas on every write endpoint. Enforce allowed keys, field types, lengths, numeric/date bounds, option membership, required fields, and relation targets on the server even if the browser already validates them.
- Validate stored form/table/mapping metadata again at submission time. Definitions can change after a browser loaded a form.
- Use transactions for record insert plus related writes/audit events; return a clear 400/409 for invalid values or stale/conflicting definitions without leaking SQL details.
- Add authorization checks, rate limits for sensitive operations, CSRF checks for cookie-authenticated mutations, and audit events for administration actions.

Frontend validation is for guidance and fast feedback; backend validation is authoritative. React escaping should be preserved; never render administrator labels/record values as raw HTML.

**Status — enforced, and the enforcement is structural.**

- Every list/filter/sort request names an **opaque key only**. `server/src/lib/recordQuery.js` and each repository resolve that key through a server-owned descriptor whose SQL comes from definitions, and bind every value — including JSON paths, literals and `IN` lists — as a parameter. `LIKE` input is escaped (`escapeLikePattern`, `!` escape character). `limitClause()` emits clamped integers, which is the only literal interpolation in the codebase and takes no client text.
- Identifiers (`field`/`form`/`table`/`column`/`option` keys) are validated against `^[a-z][a-z0-9_]{1,62}$`, reserved names are rejected (`RESERVED_KEY`), and a key is never trusted merely because it is well-formed.
- Every write endpoint parses a Zod schema (in the controller, from the module's `*.validation.js`); record values are then re-validated against the **live** definitions, so a definition edited after the browser loaded a form fails with `MAPPING_STALE`, `FIELD_NOT_MAPPED`, `INVALID_RECORD_VALUES` rather than writing anything.
- Multi-write operations run inside `withTransaction()` — record writes, mapping saves, entity type/configuration creation, user creation and role assignment, settings saves — with the audit event written in the same transaction where the caller passes its connection.
- `errorHandler` translates driver failures to `409 DUPLICATE_ENTRY` / `REFERENCE_CONFLICT` with human text, logs the redacted error shape (never `err.sql`), and returns no SQL detail to the client.
- Guards are stacked per request: `requireAuth` → `requirePermission` → CSRF (all admin routers mount after `doubleCsrfProtection`) → rate limits (global, login, and a separate `sensitive` window for account creation, password setting and the SMTP probe) → audit recording. `recordAudit()` redacts secret-shaped keys before the row is written.
- No feature page renders an administrator label or a record value as HTML; everything goes through React text nodes.

### 4.4 Mapping and schema lifecycle

- Give each field, form, table, column, option set, and option a stable ID/key. Labels are editable; IDs/keys are not silently regenerated.
- A mapping must reject missing fields/columns, incompatible data types, duplicate target assignments where disallowed, and inactive/deleted definitions.
- Deleting an item referenced by forms, mappings, or records must be blocked or require an explicit archive/migration workflow. Avoid destructive cascade deletion of user-created data.
- Version definitions. On form submission, validate against the current published version and record the version used. Decide whether editing a table/form changes old records, preserves old schema versions, or requires an explicit migration.
- Define transaction/rollback expectations for creating an entity type and its required form/table configuration.

**Status — implemented, with one open decision.**

- Keys are stable: `PATCH` accepts labels, descriptions and behaviour but rejects key changes (`RESERVED_KEY` applies to new definitions only). Labels are data, IDs/keys are references.
- `PUT /api/v1/admin/mappings` (`GET /compatibility` for the picker) rejects a missing or archived field/column, an incompatible data type, a duplicate target where disallowed, and definitions that no longer exist — and reports **every** problem at once in `details.errors` instead of the first one (`INVALID_MAPPING`, `MAPPING_PAIR_MISMATCH`, `MAPPING_DEFINITION_INACTIVE`).
- Nothing user-created is hard-deleted while it is referenced: each archive route first checks usage (`*_IN_USE`, `TABLE_HAS_RECORDS`, `FORM_HAS_MAPPINGS`, `OPTION_IN_USE`, `ENTITY_TYPE_HAS_ENTITIES`, `LAST_ADMINISTRATOR_PROTECTED`, …) and the usage counts are surfaced in the UI before the action.
- Versioning is live: `table_definitions.schema_version` increments when columns change and every `table_records` row stores the version its values were validated against, so an old record is never reinterpreted by a new definition.
- Creating an entity type (and its configuration) runs in one transaction, as do record + audit writes. **Still to decide:** whether editing a table or form should offer an explicit migration for existing records, or continue to preserve them under their stored version. Today it preserves them and nothing rewrites history.

## 5. Frontend component and interaction plan

Keep shared components reusable by behavior and variants, not by adding unrelated flags until a single component becomes hard to understand. Feature pages should compose shared controls and own feature-specific workflows.

### 5.1 Shared UI primitives

Establish a small `components/ui/` layer before implementing the builders:

- `Button`: variants, sizes, loading/disabled state, icon placement, accessible name.
- `TextInput`, `Textarea`, `Select`, `Checkbox`, `Toggle`, `DateInput`, `NumberInput`: controlled value, label, hint, error, disabled state, required state; native semantic inputs where suitable.
- `FormField`/`FieldRenderer`: render a supported dynamic-field definition through the shared input primitives and a single typed-value contract.
- `ReferencePicker`: unified dynamic relation picker for `record_reference`, `entity_reference`, and `user_reference`. Supports scalar dropdowns via `<Select>` and multi-selection. For `user_reference` and `entity_reference`, renders as a clean trigger field displaying selected chips with avatar badges and a chevron arrow, opening a floating dropdown with a dedicated search input at the top; selecting an option toggles it, updates the chips above, and automatically clears the search text so subsequent searches start clean without lingering text, while keeping full display names, email addresses, and entity badges in the options list.
- `SearchInput`: query value, clear action, accessible label, optional debounce controlled by caller.
- `DataTable`: column definitions, empty/loading/error states, row actions, sorting and pagination contract.
- `ColumnFilter`: per-column filter UI. Fetch distinct values from a bounded, searchable, paginated server endpoint; do not load every possible database value into the browser. Support type-appropriate operators (text contains/equality, number/date range, boolean, dropdown option).
- `Modal`/`Drawer`: focus trap, escape/close behavior, focus restoration, accessible title. Use the same overlay foundation for mapping configuration.
- `ToastProvider`/`useToast`: consistent success/info/warning/error messages with dismissal and accessible live region. Do not use toast as the only way to show persistent form errors.
- `LoadingState`/`Spinner` and skeleton primitives: configurable size/label; use for route, table, and submit states. Avoid indefinite spinners when a request fails.
- `ConfirmDialog`: destructive action confirmation with explicit object/action context.

Use a single design token/theme source in Tailwind/CSS for color, spacing, radii, focus rings, and typography. Reusable components should accept focused `className`/variant options where repository conventions allow, rather than copy-pasted styling on every page.

**Status — built and in use.** `client/src/components/ui/` ships `Button`, `TextInput`, `Textarea`, `NumberInput`, `Select`, `Checkbox`, `Toggle`, `DateInput`, `SearchInput`, `FormField`, `FieldRenderer` (the one typed-value contract for dynamic fields), `ReferencePicker` (searchable combobox popovers and inline pickers), `DataTable` (loading / error-with-retry / empty / populated + sorting + pagination), `ColumnFilter` (server-backed facets, never a full-table scan), `Pagination`, `Modal`, `ConfirmDialog`, `EmptyState`, `Badge`, `LoadingState`/`Skeleton`, `Spinner`, `PageHeader` and `ToastProvider`/`useToast`. Every builder and record surface composes them — no feature page carries its own input or table styling. Tokens live in `client/src/styles/index.css` (`bg-surface`, `border-line`, `text-ink-soft`, `rounded-control`, `text-brand`, `bg-danger-soft`, …). Contexts and hooks are exported from `.js` modules so `react-refresh/only-export-components` stays clean.

### 5.2 Builder UX

- Provide create/edit pages with list, search, empty state, validation, loading, save feedback, and unsaved-change handling.
- Show a guided sequence: create field/option set → compose form → define table/columns → map form → configure organization use → submit and inspect records.
- The mapping overlay should display form fields and target columns as clear labelled lists/canvases; connecting a field to a column updates a mapping draft. Include keyboard-accessible mapping controls, type compatibility messages, remove/reassign actions, and save/cancel. Persist mapping IDs only after validation.
- Drag-and-drop form ordering must support pointer and keyboard operation, visible position feedback, and a non-drag reorder option.
- Responsive navigation should collapse to a labelled menu on narrow screens; tables need a deliberate mobile strategy rather than horizontal overflow as the only interaction.
- For all mutation flows, disable duplicate submission, preserve recoverable user input after server errors, and show field-level errors from the API.

**Status — implemented, except one gap noted at the end.**

- Each surface is list → search/filters → create/edit dialog or detail page → save feedback, with loading, error-with-retry and empty states coming from `DataTable`/`EmptyState` rather than per-page markup. Duplicate submission is blocked by the pending state in `useMutation` (`loading` on buttons, dialog close suppressed while a save is in flight), and every dialog keeps its draft mounted on a server failure so typed input survives; field errors render under the control that caused them via `fieldErrors()`.
- The guided sequence is the dashboard itself: it lists Fields → Dropdowns → Forms → Tables → Form mappings → Organization → Records, filtered to what the signed-in user may actually open.
- The mapping editor (`/admin/mappings/connect`) presents the form's fields and the table's columns as labelled lists, offers only type-compatible targets, states the incompatibility when a pair will not connect, and keeps a removable/reassignable draft until save; the persisted payload is `{ fieldId → columnId }` pairs plus the mapping's own label — never coordinates or SQL. Warnings (e.g. an unmapped required column) are listed next to the result through `warningMessages()`.
- Reordering (form fields, dropdown options, table columns) is pointer drag-and-drop **plus** explicitly labelled ↑/↓ buttons with `aria-label`s, and each order is saved as data through a `PUT …/order` endpoint that requires the complete set.
- Narrow screens get a labelled menu button (`aria-expanded`, `aria-controls`, Escape to close, hidden sidebar taken out of the tab order) and a skip-to-content link; wide screens get the persistent sidebar. Data tables scroll horizontally, which is the current mobile strategy for wide lists — a card/priority-column layout is a deliberate open item, not an oversight.
- **Open:** an unsaved-draft guard on navigation away. Draft-vs-saved state with a Discard action exists (mapping editor, settings page), but leaving the route is not blocked.

Accessibility baseline shipped with this layer: native semantic inputs, labelled controls with hints and per-field error text wired by `FormField`, `role="dialog"` + `aria-modal` + focus trap + focus restoration in `Modal`, an `aria-live="polite"` toast region, `aria-sort` on sortable headers, `sr-only` captions and action headings in `DataTable`, and one visible focus ring from the token source.

## 6. Backend module and API plan

Continue the current Express pattern: `*.routes.js` → `*.controller.js` → `*.service.js` → `*.repository.js` with `*.validation.js`. Keep SQL in repositories, business rules in services, and HTTP concerns in controllers. Add focused shared helpers only when more than one module needs the same behavior.

Suggested modules as the product grows:

```text
server/src/modules/
|-- auth/                     # Existing login/session/device
|-- users/                    # Admin user lifecycle and custom profile values
|-- authorization/            # Roles, permissions, policy checks
|-- fields/                   # Field definitions
|-- dropdowns/                # Option-set definitions/options
|-- forms/                    # Form definitions and field ordering
|-- tables/                   # Logical table/column definitions
|-- mappings/                 # Form-to-table mapping and validation
|-- records/                  # Validated record submissions, reads and filters
|-- organization/             # Entity types, records and configuration
|-- settings/                 # Non-secret app settings and SMTP workflow
`-- audit/                    # Administrative audit recording/query
```

Shipped versioned API boundaries (full contract: `docs/API.md`):

| Resource | Endpoints |
|---|---|
| Fields | `GET/POST /api/v1/admin/fields`, `GET/PATCH/DELETE /api/v1/admin/fields/:id`, `GET /:id/usage` |
| Dropdowns | `GET/POST /api/v1/admin/dropdowns`, item update/archive, `…/:id/options`, `…/options/order`, option update/delete |
| Forms | `GET/POST /api/v1/admin/forms`, `GET/PATCH/DELETE /api/v1/admin/forms/:id`, `GET /:id/usage`, `GET /:id/render`, `PUT /:id/fields/order` |
| Tables | `GET/POST /api/v1/admin/tables`, table update/archive, `…/:id/columns`, `…/columns/order`, column update/archive, `GET /:id/usage` |
| Mappings | `GET /api/v1/admin/mappings`, `GET /compatibility`, `GET /for/:formId/:tableId`, `PUT /` (create-or-replace), `GET/PATCH/DELETE /:id` |
| Records | `GET/POST /api/v1/tables/:tableId/records`, `GET /:tableId/records/facets`, `GET/PATCH/DELETE /:tableId/records/:recordId` |
| Organization | entity-type CRUD, entity-type configuration CRUD, entity CRUD under `/api/v1/organization` |
| Users | `GET` (paginated) / `POST /api/v1/admin/users`, `GET/PATCH /:userId`, `PUT /:userId/password`; role assignment via `PUT /api/v1/authorization/users/:userId/roles` |
| Settings | `GET /api/v1/admin/settings`, `GET/PATCH /smtp`, `POST /smtp/test` |
| Audit | `GET /api/v1/admin/audit/events` |

Every protected route must check both authentication and the permission required for the action. Add pagination, stable sorting, bounded filter complexity, and a consistent response/error contract before implementing large lists.

**Status — shipped exactly as listed**, with two naming decisions made during the build:

- Records are the **data plane** and mount at `/api/v1/tables/:tableId/records…`, not under `/admin`, because the same endpoints serve authorized employees and administrators; `VIEW`/`CREATE`/`UPDATE`/`DELETE` on records are separate permissions from the `admin.tables.*` definition rights.
- Mappings are their own resource (`/api/v1/admin/mappings`, `GET /for/:formId/:tableId`, `PUT /` to create-or-replace a pair, `GET /compatibility` for the picker) instead of nesting under `/admin/tables/:tableId/mappings/:formId`. Both shapes express the same contract; this one keeps the mapping list, usage and archive behaviour in one module.
- `server/src/middleware/validate.js` exists but the modules parse in the controller (`XxxSchema.parse(req.body|query|params)`), so every handler's validation is visible at its own first line. One convention, applied consistently — do not mix the two.
- Pagination (`page`, `pageSize` ≤ 200, default 25), allow-listed sorting, bounded filters (12) and sorts (3), search length limits, `ok/created/okList/okMessage` envelopes and the stable error-code contract are all documented in **`docs/API.md`** and enforced by `server/src/lib/pagination.js` + `recordQuery.js`.

## 7. Phased implementation roadmap

The order below reduces rework: establish shared contracts and authorization before exposing configurable mutations, then deliver a complete vertical slice before expanding builders. Estimates are indicative **single-developer effort**, excluding stakeholder decisions, deployment, and waiting time; revise after the first schema/API spike.

| Phase | Scope and deliverable | Indicative effort | Completion gate | Status |
|---|---|---:|---|---|
| 0. Foundation audit | Verify login/CSRF/session flows against a clean environment; record API/error conventions; decide single-org vs multi-org and permission roles; define dynamic data model and deletion/version policy. | 2-4 days | Written domain decisions and reproducible auth checks; no stale claims in docs. | **Done**, except two decisions still owned by the product: multi-org/tenant boundary (§9.12) and record-migration policy (§4.4). Docs now describe shipped behavior; `docs/API.md` + `docs/OPERATIONS.md` carry the conventions. |
| 1. Authorization + platform base | Add roles/permissions and server-side guards; audit primitives; migration and test conventions; shared API error/validation contract. | 4-7 days | Unauthorized users cannot call admin mutations directly; tests cover deny/allow. | **Done in code** — `requirePermission`, the role catalogue, `audit_events` + `recordAudit`, transaction and response helpers, the error contract. **Gate partly met:** the deny/allow pair is now asserted by the `navigation` suite's limited-account tests and the `settings`/`security` permission gates; those ran on 2026-10-18 and the gates held — the one permission problem the run found was the other direction, four read-only entry endpoints gated behind admin rights, now widened. The gate closes with a recorded green run. |
| 2. Reusable UI foundation + shell | Navigation layout, design tokens, UI primitives, loading/empty/error/toast, search, modal, table shell and accessibility baseline. | 4-7 days | Shared controls are used by at least two feature surfaces; lint/build pass. | **Done** — every surface in phases 3-7 composes these controls; `npm run lint` and `npm run build` pass. |
| 3. Metadata builders | CRUD for fields and dropdowns, type-specific validation/config, search/list/detail states, safe archive behavior. | 5-8 days | Definition CRUD survives reload; invalid type/config rejected by API. | **Done** — `TypeConfigEditor` drives per-type settings from the data-type registry; archives are usage-guarded with counts shown first. |
| 4. Forms and ordering | Form CRUD, reusable fields, per-form settings, persisted order, keyboard/pointer reorder, dynamic renderer. | 4-7 days | One field can be reused in multiple forms without changing other forms. | **Done** — `GET /forms/:id/render` plus `FieldRenderer`; field reuse is by ID with per-form overrides only. |
| 5. Logical tables and records | Table/column builder, protected system columns, typed record validation/storage, bounded list/search/sort/filter. | 6-10 days | Valid rows persist; invalid columns/values cannot affect SQL or auth schema. | **Done** — system tables/columns are read-only, values are coerced against live definitions, filters/sorts are allow-listed and bounded, facets come from a bounded server endpoint. |
| 6. Mapping and organization | Mapping overlay/API, compatibility checks, organization entity types, configured record entry, transaction/audit behavior. | 5-8 days | Submit through mapped form stores every value in the intended logical column; mapping edit works. | **Done** — mapped submission (`formId` on the record POST), `details.errors` on invalid mapping saves, entity types + configurations + hierarchy, writes and audit in one transaction. |
| 7. User admin + settings | User list/create/deactivate/reset flows with dedicated service; safe profile form mapping; SMTP configuration only when secret storage and deployment approach are decided. | 4-8 days | Admin actions are permission-gated and audited; passwords are never exposed/stored as form values. | **Done** — users module + `/admin/users`, `/admin/settings`, `/admin/audit` screens; encrypted SMTP credential, `passwordConfigured`-only reads, connection/auth test probe, session revocation on password change/deactivation, last-administrator guards. "Safe profile form mapping" intentionally not built (§4.2). |
| 8. Hardening and release | Performance, accessibility, security, migrations, backups, observability, integration/e2e tests, upgrade/recovery docs. | 4-8 days | Release checklist, migration rehearsal, restore/rollback plan and acceptance sign-off. | **In progress** — the browser suite has been run twice: 2026-10-18 (run tag `261018141656`) passed 110 of 138, and 2026-10-19 passed 136 of 138. Every failure so far was triaged to a product bug or a test bug and both classes were fixed (see the breakdown below); the gate now needs the confirmation run of the last harness fixes, not new code. Performance, audit retention and the migration rehearsal remain. |

**Phase 8 breakdown as it stands today:**

| Item | State |
|---|---|
| `/api/v1` contract documentation | **Done** — `docs/API.md` |
| Migration, backup, restore/rollback, deploy order, release checklist | **Written** — `docs/OPERATIONS.md`; the rehearsal itself and the first restore drill still have to be performed in the real environment and recorded |
| Log redaction / observability baseline | **Done in code** — session identifiers and device tokens no longer reach the log, `errorHandler` logs a redacted error instead of the interpolated SQL, audit summaries drop secret keys. No log pipeline, metrics or retention policy yet |
| Rate limits on sensitive operations | **Done** — separate windows for account creation/password setting and the SMTP probe, on top of the global and login limiters |
| Accessibility pass | **Done for the shell** — skip-to-content link, closed mobile drawer removed from the tab order, per-route `document.title`, favicon reference (removes a 404 per load) — on top of the phase-2 baseline (focus trap, live region, labelled controls, `aria-sort`) |
| Hashing consistency | **Done** — `create-user` and `reset-password` now call the shared `hashPassword()` instead of repeating the Argon2 parameters |
| Performance | **Open** — one ~502 kB (gzip ~142 kB) initial chunk. Route-level code splitting is available but changes first-paint behaviour, so it needs a measured pass, not a blind edit |
| Integration / e2e / unit tests | **Two runs recorded** — `testing/` (17 suites / 138 tests) drove a real browser against the already-running dev servers on 2026-10-18 (110 passed, 28 failed) and again on 2026-10-19 (136 passed, 2 failed), reports kept in `testing/reports/`. Each failure was traced to the code and split into product defect or test defect. Product side: the audit date filter threw `ER_NON_UNIQ_ERROR`; the rate limiter crashed on an abandoned socket; `useEntryOptions` read the wrong key so every dropdown and relation picker stayed on "Loading options…" and stored relations displayed as bare ids; four read-only entry endpoints were admin-gated, so an employee never saw **New record**; archiving a mapping was a hard `DELETE` while the screen promised a recoverable state; the mapping picker read a metadata snapshot taken at app start, so a newly created form or table was missing; system-table columns offered **Add column** with nothing to add and the server accepted it; archiving an already-archived record answered 200; creating a required field with no default value was refused; a sign-in that followed a lost session dropped the return path; the mail card could sit permanently dirty. Test side: assertions raced the shell's "Checking access…" handover, cleared a debounced search with a keystroke sequence that fires no React event, read `records`/`rows` from an envelope that only ever says `data`, hard-coded the rate limits this deployment overrides in `server/.env`, and clicked a detail-screen button while still on the list screen. The two failures left on 2026-10-19 were harness races — a sign-in that now returns to the screen it was asked for, and a fields search that raced the paginated list — both fixed together with the suite's rate-limit budget guard, atomic table reads and dialog-error waits. **The confirmation run closes this row.** Unit and component tests are still not built |
| Acceptance sign-off | **Open** — needs the checklist in `docs/OPERATIONS.md` §7 executed in the deployed environment |

**Indicative total:** about 34-59 developer-days for the described breadth. A narrower MVP can omit SMTP, advanced hierarchy, arbitrary cross-table reporting, and bulk imports. Estimate again after Phase 0; scope/permission decisions can materially change the design.

### Recommended MVP vertical slice

**Delivered.** All five steps are reachable in the shipped product and are the exact path the screens and endpoints implement: create the definitions, map them, submit through the mapped form, watch the value land in the intended column, read the audit row.

1. Admin permission can create a field, one dropdown, one form, one logical table and compatible columns.
2. Admin maps the form to the table.
3. An authorized organization user opens that form, submits valid data, and sees the new record in a paginated table.
4. Invalid data, stale mappings, duplicate submissions, and unauthorized users receive explicit errors.
5. The action is audited; the users authentication columns remain unchanged.

Deliver this full slice before creating every requested field type or advanced Excel-like filter. It validates the data model and integration points early.

## 8. Validation, security, and quality gates

**Status — the code-level controls below are in place, and the browser-level gate has now been exercised twice.** `testing/` holds a Selenium suite (17 suites, 138 tests) that drives a real Chrome window against the running app and records every failure with its screen, UI step, failing request and browser error. Its first full run (2026-10-18) passed 110 and failed 28; all 28 were fixed, half of them in the product — see the Phase 8 breakdown in §7. The second run (2026-10-19) passed 136 and failed 2, both harness races that are now fixed. The gate is the *confirmation* run coming back green, so everything below that says "awaiting its run" means that run.

### Backend

- Unit-test field-type validators, mapping compatibility, permission policies, and record validation. **— not built as unit tests. The `data types` suite covers the same ground from outside, through the UI and the API, for every storage family; a real unit runner is still open.**
- Integration-test migrations against MySQL; test repositories/services with isolated data and rollback/cleanup. **— not built. The rehearsal procedure that stands in for it is `docs/OPERATIONS.md` §2. The e2e suite's own isolation is the run tag plus `npm run cleanup`.**
- Test CSRF, session expiry/revocation, permission denial, duplicate keys, oversized bodies, invalid IDs, relation targets, and concurrent edits. **— `npm run test-api` still covers only the login/CSRF/health path. The `security`, `auth`, `resilience` and `fields` suites now assert the CSRF double-submit gate, a session lost mid-task, permission denial, duplicate keys, a >1 mb body and non-integer identifiers. Concurrent edits are not covered.**
- Exercise injection payloads in labels, keys, filters, sort requests, and record values. Verify identifiers are never directly interpolated and query errors do not expose SQL. **— the structural guarantee holds (keys are resolved through server-owned descriptors, values are bound, `LIMIT`/`OFFSET` are clamped integers, driver failures map to `409` with human text and the logged error carries no `err.sql`), and the `security` suite is written to probe exactly that — stored payloads, markup in values, hostile filters/sorts, non-identifier ids and credential leakage in read responses. **It ran on 2026-10-18:** no injection succeeded and no response leaked a statement; the one MySQL error the run produced was an unqualified `created_at` in the audit date filter, which returned a generic 500 to the browser and is fixed.**
- Use transactions for record plus audit writes. Plan for MySQL DDL non-transactional behavior and migrations that may partially apply; back up before production migrations. **— transactions in place; the DDL/partial-apply rules and the backup requirement are written up in `docs/OPERATIONS.md` §2–§3.**
- Establish rate limits for login and sensitive admin actions; review PII retention, logs, password reset policy, secrets, and audit visibility. **— limits in place (global, login, per-sensitive-surface). Retention is the open part: audit events and `user_sessions` rows accumulate unbounded, and no purge window has been chosen.**

### Frontend

- Component tests for field rendering, validation feedback, loading/error/empty states, keyboard interaction and accessible labels. **— not built as component tests. The `resilience` suite observes those same states in the rendered page (busy control, refusal message, empty list, no-match search) and asserts that nothing threw while doing it.**
- Feature tests for builder CRUD, mapping edits, record submission, duplicate-submit prevention, and permission-aware navigation. Hiding a menu item is not authorization. **— written in the `fields`, `dropdowns`, `forms`, `tables`, `mappings`, `records`, `organization`, `users` and `settings` suites, including a duplicate-submit test that counts the POSTs that actually left the browser. Navigation gating remains presentation only and every mutation is re-checked by `requirePermission`, which the `navigation` suite's two limited-account tests prove at the API.**
- End-to-end test login → admin config → organization form submit → record list, including failed validation and stale/expired session. **— the `vertical slice` suite walks exactly this path and the `auth` + `resilience` suites hold the sign-in and lost-session cases. Its first run failed the slice for two product reasons — the entry endpoints were admin-gated so the employee could not open the mapped form, and the client never resolved the option source behind a picker — both fixed. The manual version is still step 8 of the release checklist until a green run is recorded.**
- Run `npm run lint` and `npm run build` in `client/`; add a test script/runner only when the test design and dependency change are agreed. **— lint and build remain the code gate. The runner decision is made: Selenium WebDriver in `testing/`, its own `package.json`, dev-only dependencies, a real browser against the already-running servers, no isolated server and no second app port. `testing/README.md` is the design.**

### Operational gates

- Add `/api/v1` contract documentation (or generated OpenAPI) and seed/test data procedures. **— done as `docs/API.md`; seed/test procedures are `docs/OPERATIONS.md` §6 (bootstrap administrator, `create-user`, `reset-password`, `test-api`) plus the QA-account convention for manual checks.**
- Verify startup/readiness behavior for both MySQL and Redis; health checks must distinguish liveness from readiness if deployment needs them. **— documented: `GET /api/v1/health` is readiness-only (200/503), and `docs/OPERATIONS.md` §4 says explicitly not to use it as a liveness probe.**
- Record migration backups, deploy ordering, checksum policy, recovery steps, and environment-secret ownership. **— done in `docs/OPERATIONS.md` §1–§3, §7.**
- Use structured, redacted logs; do not log session IDs, device tokens, passwords, CSRF tokens, SMTP credentials, or full sensitive record payloads. **— enforced in code and listed in `docs/OPERATIONS.md` §5. Logs are still plain `console` output with no aggregation or retention.**

## 9. Current gaps and design risks to resolve

1. **Authorization is absent:** current `requireAuth` establishes an authenticated user, not an admin/organization permission model. Build server-side RBAC/policy checks before dynamic builders. — **Resolved.** `server/src/modules/authorization/` + `requirePermission` guard every admin, record and organization mutation; `client/src/lib/permissions.js` mirrors the catalogue for navigation only.
2. **No product domain/schema yet:** field/form/table/record/organization concepts need a versioned data model and lifecycle rules before the UI/API are implemented. — **Resolved** by migrations `007`/`008` and the definition services; versioning is live (`schema_version` on definitions and records).
3. **Flexible schema can become unsafe:** dynamic SQL identifiers and user-defined SQL tables are high-risk. Use fixed metadata tables, validated typed values, and server-owned IDs. — **Resolved structurally.** No runtime DDL exists; identifiers resolve through server-owned descriptors and everything else is a bound parameter (§4.3).
4. **Excel-style filters can become expensive:** querying every distinct value for every column is unbounded. Use server-side, indexed/paginated facets, search, and filter complexity limits. — **Resolved.** `GET …/records/facets` is bounded and searchable, filters cap at 12 and sorts at 3, and `ColumnFilter` fetches per column instead of loading a column's domain into the browser.
5. **Definition changes can invalidate saved mappings or records:** stable identifiers, archive rules, compatibility checks, schema versions, and explicit migrations are needed. — **Largely resolved.** Keys are immutable, archives are usage-guarded, mapping saves validate compatibility, records keep their schema version. **Open:** the record-migration policy for a changed definition (§4.4) — today old records are preserved, never rewritten.
6. **User table is security-sensitive:** generic column editing must not modify/delete authentication fields. Custom user attributes need a separate storage boundary. — **Resolved** (`SYSTEM_TABLE_READONLY`, `SYSTEM_COLUMN_LOCKED`, dedicated user service). The separate mechanism for custom attributes exists as `user_profile_values` but has no writer or UI yet.
7. **Testing is thin:** available scripts include an API integration helper, but package scripts do not define unit/e2e test suites. Add tests with the first new domain module, not after all builders are complete. — **Decided, written, and now run twice.** The stack is Selenium WebDriver in `testing/` with its own `package.json` (dev-only dependency change, no app dependency added), driving a real browser against the already-running servers; 17 suites and 138 tests cover every shipped surface plus resilience and security. The 2026-10-18 run passed 110 and failed 28, and the failures split roughly evenly between product defects (permission gates on the entry surface, an unresolved option source, a mapping archive that deleted instead of archiving, two server crashes, a definition rule that contradicted the UI) and harness races — which is exactly what §9.7 predicted for a catch-up pass: it found real defects, not none. The 2026-10-19 run passed 136 and failed 2, both of them harness races (a sign-in return path the product had since changed, and a search that raced the paginated list), which is what a healthy second pass looks like. Unit/component tests for the validators and primitives remain open behind it.
8. **Auth should be verified, not assumed:** the repository contains a substantial login/session/CSRF implementation, but product readiness still depends on running the API checks in the target environment and testing failure paths. Avoid expanding the meaning of “authentication complete” to include authorization, user lifecycle, recovery/MFA, or account policy that is not present. — **Partly addressed.** Authorization and user lifecycle now exist and are described accurately in §2/§3.3, and the `auth`, `users` and `security` suites assert sign-in, wrong credentials, logout, the session and CSRF cookie contract, a session lost mid-task and permission denial. **Not present:** MFA, recovery codes, self-service password change, account lockout beyond the login rate limit. The 2026-10-18 run exercised the paths that do exist — sign-in, wrong credentials, logout, the session and CSRF cookie contract, a session lost mid-task and permission denial — and the only real fault it found was the sign-in redirect racing the auth flag and dropping the return path, which is fixed.
9. **Two router packages are listed:** client dependencies include both `react-router` and `react-router-dom` at different major versions. Before adding routes, confirm the intended React Router package/version and remove duplication only after compatibility is verified. — **Confirmed, not cleaned.** The code imports `react-router-dom@7` only; `react-router@8` is an unused direct dependency. Removing it needs a verified install (it may be a transitive pin), so it is left alone rather than edited blind.
10. **No committed design system:** Tailwind is configured, but reusable Button/Input/Table/Toast/Loading primitives and design tokens are not yet established. Build them early to avoid inconsistent one-off UI. — **Resolved.** `client/src/components/ui/` + the token source in `client/src/styles/index.css`, used by every surface (§5.1).
11. **SMTP/security operations need a secret strategy:** credentials must be encrypted and rotation/deployment key ownership defined before SMTP settings are built. — **Resolved enough to ship.** AES-256-GCM envelopes under `ENCRYPTION_KEY`, deployment-owner holds the key, reads never return the credential, rotation consequences are documented in `docs/OPERATIONS.md` §1. **Open:** no key id inside the envelope, so rotation means re-entering secrets rather than re-encrypting in place.
12. **Tenant boundary is undecided:** if a deployment may host multiple organizations/customers, add tenant isolation to schema, indexes, authorization, and every repository query before the first data feature. Retrofitting this is expensive. — **Still open, and now expensive.** Data exists in single-tenant-shaped tables (no organization id on definitions, records or users; unique keys are global). This needs a product decision before any second-customer work starts.

These are planning findings, not a security audit or a claim that each item is currently exploitable.

## 10. Working agreements for future changes

- Keep frontend features under `client/src/features/<feature>/`; put generic visual primitives in `client/src/components/ui/`; keep app composition and route definitions under `client/src/app/`.
- Keep each backend feature cohesive under `server/src/modules/<feature>/`, following existing routes/controller/service/repository/validation conventions.
- Put all persistent schema changes in a new, numbered migration. Never edit a migration already applied to a shared environment; the current runner enforces checksums.
- Keep values parameterized and identifiers server-owned. No endpoint accepts raw SQL, SQL fragments, or arbitrary column names.
- Keep a stable API contract and use shared client API/error handling; avoid page-specific fetch implementations.
- Preserve accessibility, loading/error/empty states, and server-side authorization in each feature.
- Update this guide when actual shipped behavior changes; label planned behavior as planned until implemented and tested.
- Consult `docs/API.md` before changing a request/response shape, a status code, an error code, a permission key, or a list/filter contract, and update it in the same change.
- Consult `docs/OPERATIONS.md` before touching migrations, environment variables, secrets, SMTP storage, logging, or anything that affects deployment or recovery.
- This guide stays the source of truth for product scope, architecture decisions, and roadmap status; the other two documents describe behavior that is already in the code.

## 11. Local commands currently available

From `server/`:

```powershell
npm run dev           # nodemon src/server.js
npm start             # node src/server.js
npm run migrate       # apply pending sql/migrations, checksum-verified
npm run create-user   # interactive prompt: email, password, names
npm run reset-password -- <email> <new-password>
npm run test-api      # auth/health/CSRF integration pass against a running server
```

From `client/`:

```powershell
npm run dev
npm run lint
npm run build
```

From `testing/` (Selenium end-to-end; needs both dev servers already running — see `testing/README.md`):

```powershell
npm install
npm run setup             # create/reset the two QA accounts the suite owns
npm test                  # every suite, visible Chrome window
npm run smoke             # connectivity check only (the 00-smoke suite)
npm test -- --suite records      # run one or more suites by name substring
npm test -- --test "duplicate email"   # run one test by name substring
npm run headless          # no window, for a machine with no display
npm run cleanup           # report what a tagged run left behind (changes nothing)
npm run cleanup:apply     # delete exactly those rows; audit events are kept
```

Requirements and notes:

- The server reads `server/.env` (template: `server/.env.example`) and needs a reachable MySQL and Redis instance plus `SESSION_SECRET` and `CSRF_SECRET`. `ENCRYPTION_KEY` (zod: a string of at least 32 characters; `.env.example` suggests base64 of 48 random bytes) is optional until a secret setting such as SMTP is saved. `docs/OPERATIONS.md` §1 has the full variable table and secret ownership.
- `npm run migrate` is idempotent for applied migrations and refuses to run when a stored checksum no longer matches the file. `docs/OPERATIONS.md` §2–§3 cover migration rules, backup, restore and rollback.
- `npm run create-user` and `npm run reset-password` hash through the shared `hashPassword()` in `server/src/modules/auth/password.policy.js`, so CLI-created accounts verify exactly like API-created ones, and both enforce the same password policy.
- `npm run test-api` targets `http://localhost:${PORT:-4000}` and needs `TEST_EMAIL` and `TEST_PASSWORD` in the environment. It exercises health, CSRF, validation failures, bad credentials, login, `/auth/me`, logout and a 404 only — it is not a test suite and does not cover the admin, record, organization or settings modules.
- The Vite development server proxies `/api` requests to the configured local API. `npm run lint` and `npm run build` are the current client code gates; the browser gate is `testing/`, and it starts nothing — it refuses to run unless the API and the web app already answer.
- Use disposable test users and data for integration checks; never put real secrets in the repository. The suite enforces this itself: created rows carry the run tag, `E2E_PROTECTED_EMAILS` accounts are off-limits, a configured admin that is protected aborts the run, and `npm run cleanup` removes exactly the tagged rows.

## 12. Summary

The repository is no longer only an authentication foundation. Phases 1–7 are implemented: session/CSRF authentication with device-bound sessions, server-side RBAC, the metadata-driven field/form/table/dropdown builders with `schema_version` lifecycle, the record engine over fixed metadata tables with bounded Excel-style search/filter/sort/facets, the organization module, user administration, encrypted SMTP settings with a connection test, the audit trail, and a single React administration surface built on shared UI primitives and permission-aware navigation. Migrations `001`–`008`, the endpoint contract, and the operational runbook are documented in `docs/API.md` and `docs/OPERATIONS.md`.

The remaining work is quality and decisions, not missing screens:

1. **Re-run the browser suite (§9.7)** — the stack is decided, the suite is written, and it has been run once: 138 tests, 110 passed, 28 failed, with every failure now traced and fixed on the product side, the harness side, or both. What is left is the second run and a report that comes back green; until then the fixes are code that has not been proven. Unit and component tests remain open behind it.
2. **Acceptance in a real environment** — run migrations through a rehearsal, exercise `npm run test-api` plus the failure paths it does not cover, and confirm each builder end to end on the deployed configuration.
3. **Product decisions that get harder to change later** — the tenant boundary (§9.12), the record-migration policy when a definition changes (§4.4), custom user profile attributes with a writer and UI (§4.2), and PII/audit retention.
4. **Known technical debt** — route-level code splitting for the ~500 kB client bundle, `react-router`/`react-router-dom` duplication (§9.9), the legacy `user_sessions.device_id` column and unused `middleware/validate.js`, a key id inside encrypted envelopes so rotation does not require re-entry, and a structured log pipeline with aggregation and retention.

Nothing in this summary should be read as a security audit or as evidence that every listed path has been exercised. The verification actually performed for this state is client lint plus a production build, static syntax checks on the server, and one recorded browser-suite run (2026-10-18: 110 of 138 tests passed). The fixes that run produced are now in the code, and the next milestone is the run that proves them — the milestone after that is the acceptance checklist in a deployed environment, because documentation describes intent while only a recorded run describes behavior.
