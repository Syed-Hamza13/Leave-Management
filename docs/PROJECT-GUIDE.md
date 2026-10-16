# Leave Management - Current State and Product Development Plan

**Updated:** 16 October 2026
**Purpose:** Record what is implemented today, describe the configurable administration product requested, and give a safe, incremental path from the authentication foundation to that product. Proposed features below are plans, not claims about shipped code.

## 1. Executive summary

The repository has a working application shell and an authentication foundation:

- **Backend:** Express 5 API, MySQL connection pool, Redis-backed sessions and rate limits, CSRF protection, request validation with Zod, auth/health/security modules, and a checksum-verified SQL migration runner.
- **Frontend:** React 19 + Vite + Tailwind CSS 4, router, login screen, auth provider, protected routes, shared API helper, and a basic authenticated dashboard.
- **Authentication data:** `users`, session registry, and device registry tables are managed through numbered migrations.
- **Not implemented yet:** dynamic field/dropdown/form/table builders, configurable records, form-to-table mappings, organization entities, administration user-management UI/API, authorization roles/permissions, reusable design-system components, and product-level test coverage.

The next product is broader than a conventional leave-request form. It is a **metadata-configurable application platform**: administrators define fields, forms, logical tables, mappings, and organization entity types; users then submit records through configured forms.

The first architectural decision should be to treat administrator-created “tables” as **logical tables defined by metadata**, not as arbitrary MySQL tables created from browser input. Keep the authentication `users` table protected and use a validated metadata/record model for extensible data. This avoids unsafe dynamic SQL and makes schema changes, form reuse, and access controls manageable.

## 2. What exists today

### 2.1 Repository layout

```text
Leave-Management/
|-- README.md
|-- docs/
|   `-- PROJECT-GUIDE.md
|-- client/
|   |-- index.html
|   |-- package.json
|   `-- src/
|       |-- app/                 # App composition and routes
|       |-- components/auth/     # ProtectedRoute
|       |-- features/
|       |   |-- auth/            # AuthProvider and LoginPage
|       |   `-- dashboard/       # Initial dashboard
|       |-- layouts/             # AppShell
|       |-- services/            # Shared API helper
|       `-- styles/
`-- server/
    |-- package.json
    |-- .env.example
    |-- scripts/                 # Migration, user, password, API scripts
    |-- sql/migrations/           # Numbered SQL migrations
    `-- src/
        |-- config/              # Environment, DB, Redis, session
        |-- middleware/          # CSRF, auth, rate limits, errors
        `-- modules/
            |-- auth/            # Controller/service/repository/validation
            |-- health/
            `-- security/
```

The tree intentionally omits dependencies, generated build output, and local environment files. Continue the existing feature/module-based organization rather than moving all business logic into generic shared folders.

### 2.2 Backend and authentication

`server/src/server.js` validates environment configuration, connects Redis, builds the Express application, and starts the listener. `server/src/app.js` composes Helmet, CORS, body parsing, cookies, Redis sessions, rate limiting, API routes, not-found handling, and the error handler.

Authentication is split into HTTP routes/controllers, services, repositories, and Zod validation. The login route validates credentials, checks the active account and Argon2 hash, creates a fresh session, registers the session in MySQL, and returns a sanitized user object. Authenticated routes validate the registered session/device and user state. `GET /api/v1/auth/me` restores the browser's current-user state; logout revokes and destroys the current session.

The frontend has a `LoginPage`, `AuthProvider`, `ProtectedRoute`, router, and a fetch helper that sends cookies, fetches/attaches CSRF tokens for mutations, retries once on the recognized invalid-token response, and reports HTTP failures as errors. The dashboard and `AppShell` are deliberately minimal foundations, not the planned administration UX.

### 2.3 Existing API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Report MySQL and Redis dependency health |
| `GET` | `/api/v1/security/csrf` | Create/refresh the CSRF context and return its token |
| `POST` | `/api/v1/auth/login` | Validate credentials and establish a session |
| `GET` | `/api/v1/auth/me` | Return the current active user's sanitized profile |
| `POST` | `/api/v1/auth/logout` | Revoke and destroy the current session |

### 2.4 Persistence and dependencies

- MySQL is the source of truth for users and the relational session/device registry.
- Redis backs Express sessions and rate-limit state.
- `server/sql/migrations/001_auth.sql` through `005_session_device_binding.sql` create/extend the authentication schema. `server/scripts/migrate.js` applies ordered SQL files, stores SHA-256 checksums, and rejects edits to already-applied migrations.
- The client uses React, React Router, Vite, and Tailwind CSS 4. The current client scripts are `dev`, `build`, `lint`, and `preview`; no unit-test runner is configured.
- The server has operational scripts and an integration-style `test-api.js`; its package does not currently expose a unit-test script.

## 3. Product requirements translated into modules

### 3.1 Administration navigation

The authenticated application shell should provide a persistent left navigation with top-level **Administration**, **Organization**, and **Settings** groups. The shell owns navigation state, active route styling, responsive collapse behavior, page header/breadcrumb, and the main content outlet. Do not duplicate sidebars or page chrome across feature pages.

Administration should expose:

1. **Fields** - Create and edit reusable field definitions (label, stable key, type, required/default/constraints, help text, and type-specific settings). Initial types: short text, long text, number, date, dropdown, boolean/checkbox, and toggle. Add email/URL only when there is a clear validation and storage contract. A field definition can be reused by multiple forms.
2. **Dropdowns** - Manage named option sets with stable option values and editable display labels, ordering, and active state. Dropdown-type fields reference an option set; they must not copy an uncontrolled list into each form.
3. **Forms** - Define named forms by selecting reusable fields, configuring per-form required/visibility/label overrides only where explicitly supported, and sorting fields by drag-and-drop. Save field order as data. Submit and cancel actions belong to the form renderer, not to persisted field definitions. Provide keyboard-accessible reorder controls as an alternative to drag-and-drop.
4. **Tables** - Define logical tables, columns, types, and relationships. Allow columns to be added/removed/edited with validation. Show immutable system columns separately from user-managed columns.
5. **Form mappings** - Configure a form-to-table mapping: each source form field maps to a compatible target logical-table column. Mapping is explicit and editable. The visual connector overlay is a UI for editing this mapping; the persisted mapping is a set of IDs, never screen coordinates or generated SQL.

### 3.2 Organization

Organization has two separate concerns:

- **Entity type definitions** such as Department, Council, Group, or Team. Creating an entity type adds a navigable sub-section.
- **Entity records** such as “People Operations” or “Engineering”. These records use an explicitly configured form/table mapping.

Do not equate “creating a Team entity type” with creating a new MySQL table. Entity type definitions are metadata; entity records are normal logical-table records. Decide whether the first release supports parent/child organization hierarchy, membership, and multiple organizations. If installations can contain multiple customer organizations, every relevant query and unique key needs a tenant/organization boundary from the start.

### 3.3 User administration and settings

- User management lists existing users and supports authorized creation, deactivation/deletion policy, and password set/reset flows. Prefer deactivation or soft deletion for accounts with historical records.
- The user-creation form can use a selected form only for safe profile attributes. Email uniqueness, account status, authorization assignment, and password setting remain explicit server-controlled operations. Passwords must never be stored as ordinary dynamic form values or displayed after submission.
- SMTP configuration is a later Settings feature. Store credentials encrypted using a managed secret/key strategy, never return secrets from read APIs, and validate delivery with an explicit test action.
- Separate **authentication** (who signed in) from **authorization** (what they may do). The current auth guard does not provide role/permission management. Add server-enforced permissions before exposing admin mutation APIs.

## 4. Recommended architecture and data safety

### 4.1 Metadata-first logical tables

Recommended baseline schema (names are illustrative; finalize through migrations):

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

### 4.2 Protect authentication-owned data

`users` is an authentication/system table, not an administrator-defined table. Its core columns (`id`, `email`, `password_hash`, status, login/security timestamps, and audit timestamps) are immutable through the generic table builder. If admins need extra user profile fields, store those in a separate custom-profile mechanism keyed to `users.id`; do not let custom column operations alter auth columns. User APIs must use the auth/user service, not generic record CRUD.

### 4.3 SQL injection and validation controls

SQL parameter placeholders protect **values**, not table names, column names, sort expressions, or SQL fragments. Therefore:

- Never interpolate client-provided identifiers or mapping values into SQL.
- Prefer fixed metadata tables plus parameterized queries. If an identifier must be generated, derive it only from a server-owned definition and validate it against a strict allow-list; do not treat a valid-looking string as trusted.
- Parse request bodies with Zod schemas on every write endpoint. Enforce allowed keys, field types, lengths, numeric/date bounds, option membership, required fields, and relation targets on the server even if the browser already validates them.
- Validate stored form/table/mapping metadata again at submission time. Definitions can change after a browser loaded a form.
- Use transactions for record insert plus related writes/audit events; return a clear 400/409 for invalid values or stale/conflicting definitions without leaking SQL details.
- Add authorization checks, rate limits for sensitive operations, CSRF checks for cookie-authenticated mutations, and audit events for administration actions.

Frontend validation is for guidance and fast feedback; backend validation is authoritative. React escaping should be preserved; never render administrator labels/record values as raw HTML.

### 4.4 Mapping and schema lifecycle

- Give each field, form, table, column, option set, and option a stable ID/key. Labels are editable; IDs/keys are not silently regenerated.
- A mapping must reject missing fields/columns, incompatible data types, duplicate target assignments where disallowed, and inactive/deleted definitions.
- Deleting an item referenced by forms, mappings, or records must be blocked or require an explicit archive/migration workflow. Avoid destructive cascade deletion of user-created data.
- Version definitions. On form submission, validate against the current published version and record the version used. Decide whether editing a table/form changes old records, preserves old schema versions, or requires an explicit migration.
- Define transaction/rollback expectations for creating an entity type and its required form/table configuration.

## 5. Frontend component and interaction plan

Keep shared components reusable by behavior and variants, not by adding unrelated flags until a single component becomes hard to understand. Feature pages should compose shared controls and own feature-specific workflows.

### 5.1 Shared UI primitives

Establish a small `components/ui/` layer before implementing the builders:

- `Button`: variants, sizes, loading/disabled state, icon placement, accessible name.
- `TextInput`, `Textarea`, `Select`, `Checkbox`, `Toggle`, `DateInput`, `NumberInput`: controlled value, label, hint, error, disabled state, required state; native semantic inputs where suitable.
- `FormField`/`FieldRenderer`: render a supported dynamic-field definition through the shared input primitives and a single typed-value contract.
- `SearchInput`: query value, clear action, accessible label, optional debounce controlled by caller.
- `DataTable`: column definitions, empty/loading/error states, row actions, sorting and pagination contract.
- `ColumnFilter`: per-column filter UI. Fetch distinct values from a bounded, searchable, paginated server endpoint; do not load every possible database value into the browser. Support type-appropriate operators (text contains/equality, number/date range, boolean, dropdown option).
- `Modal`/`Drawer`: focus trap, escape/close behavior, focus restoration, accessible title. Use the same overlay foundation for mapping configuration.
- `ToastProvider`/`useToast`: consistent success/info/warning/error messages with dismissal and accessible live region. Do not use toast as the only way to show persistent form errors.
- `LoadingState`/`Spinner` and skeleton primitives: configurable size/label; use for route, table, and submit states. Avoid indefinite spinners when a request fails.
- `ConfirmDialog`: destructive action confirmation with explicit object/action context.

Use a single design token/theme source in Tailwind/CSS for color, spacing, radii, focus rings, and typography. Reusable components should accept focused `className`/variant options where repository conventions allow, rather than copy-pasted styling on every page.

### 5.2 Builder UX

- Provide create/edit pages with list, search, empty state, validation, loading, save feedback, and unsaved-change handling.
- Show a guided sequence: create field/option set → compose form → define table/columns → map form → configure organization use → submit and inspect records.
- The mapping overlay should display form fields and target columns as clear labelled lists/canvases; connecting a field to a column updates a mapping draft. Include keyboard-accessible mapping controls, type compatibility messages, remove/reassign actions, and save/cancel. Persist mapping IDs only after validation.
- Drag-and-drop form ordering must support pointer and keyboard operation, visible position feedback, and a non-drag reorder option.
- Responsive navigation should collapse to a labelled menu on narrow screens; tables need a deliberate mobile strategy rather than horizontal overflow as the only interaction.
- For all mutation flows, disable duplicate submission, preserve recoverable user input after server errors, and show field-level errors from the API.

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

Potential versioned API boundaries (exact resource names may evolve):

| Resource | Example endpoints |
|---|---|
| Fields | `GET/POST /api/v1/admin/fields`, `GET/PATCH/DELETE /api/v1/admin/fields/:id` |
| Dropdowns | `GET/POST /api/v1/admin/dropdowns`, item/option update routes |
| Forms | `GET/POST /api/v1/admin/forms`, `GET/PATCH/DELETE /api/v1/admin/forms/:id` |
| Tables | `GET/POST /api/v1/admin/tables`, table/column update and archive routes |
| Mappings | `GET/PUT /api/v1/admin/tables/:tableId/mappings/:formId` |
| Records | `POST /api/v1/tables/:tableId/records`, paginated list and filter-facet routes |
| Organization | entity-type CRUD plus scoped entity-record routes |
| Users | paginated list, create, deactivate, and explicit password reset/set routes |

Every protected route must check both authentication and the permission required for the action. Add pagination, stable sorting, bounded filter complexity, and a consistent response/error contract before implementing large lists.

## 7. Phased implementation roadmap

The order below reduces rework: establish shared contracts and authorization before exposing configurable mutations, then deliver a complete vertical slice before expanding builders. Estimates are indicative **single-developer effort**, excluding stakeholder decisions, deployment, and waiting time; revise after the first schema/API spike.

| Phase | Scope and deliverable | Indicative effort | Completion gate |
|---|---|---:|---|
| 0. Foundation audit | Verify login/CSRF/session flows against a clean environment; record API/error conventions; decide single-org vs multi-org and permission roles; define dynamic data model and deletion/version policy. | 2-4 days | Written domain decisions and reproducible auth checks; no stale claims in docs. |
| 1. Authorization + platform base | Add roles/permissions and server-side guards; audit primitives; migration and test conventions; shared API error/validation contract. | 4-7 days | Unauthorized users cannot call admin mutations directly; tests cover deny/allow. |
| 2. Reusable UI foundation + shell | Navigation layout, design tokens, UI primitives, loading/empty/error/toast, search, modal, table shell and accessibility baseline. | 4-7 days | Shared controls are used by at least two feature surfaces; lint/build pass. |
| 3. Metadata builders | CRUD for fields and dropdowns, type-specific validation/config, search/list/detail states, safe archive behavior. | 5-8 days | Definition CRUD survives reload; invalid type/config rejected by API. |
| 4. Forms and ordering | Form CRUD, reusable fields, per-form settings, persisted order, keyboard/pointer reorder, dynamic renderer. | 4-7 days | One field can be reused in multiple forms without changing other forms. |
| 5. Logical tables and records | Table/column builder, protected system columns, typed record validation/storage, bounded list/search/sort/filter. | 6-10 days | Valid rows persist; invalid columns/values cannot affect SQL or auth schema. |
| 6. Mapping and organization | Mapping overlay/API, compatibility checks, organization entity types, configured record entry, transaction/audit behavior. | 5-8 days | Submit through mapped form stores every value in the intended logical column; mapping edit works. |
| 7. User admin + settings | User list/create/deactivate/reset flows with dedicated service; safe profile form mapping; SMTP configuration only when secret storage and deployment approach are decided. | 4-8 days | Admin actions are permission-gated and audited; passwords are never exposed/stored as form values. |
| 8. Hardening and release | Performance, accessibility, security, migrations, backups, observability, integration/e2e tests, upgrade/recovery docs. | 4-8 days | Release checklist, migration rehearsal, restore/rollback plan and acceptance sign-off. |

**Indicative total:** about 34-59 developer-days for the described breadth. A narrower MVP can omit SMTP, advanced hierarchy, arbitrary cross-table reporting, and bulk imports. Estimate again after Phase 0; scope/permission decisions can materially change the design.

### Recommended MVP vertical slice

1. Admin permission can create a field, one dropdown, one form, one logical table and compatible columns.
2. Admin maps the form to the table.
3. An authorized organization user opens that form, submits valid data, and sees the new record in a paginated table.
4. Invalid data, stale mappings, duplicate submissions, and unauthorized users receive explicit errors.
5. The action is audited; the users authentication columns remain unchanged.

Deliver this full slice before creating every requested field type or advanced Excel-like filter. It validates the data model and integration points early.

## 8. Validation, security, and quality gates

### Backend

- Unit-test field-type validators, mapping compatibility, permission policies, and record validation.
- Integration-test migrations against MySQL; test repositories/services with isolated data and rollback/cleanup.
- Test CSRF, session expiry/revocation, permission denial, duplicate keys, oversized bodies, invalid IDs, relation targets, and concurrent edits.
- Exercise injection payloads in labels, keys, filters, sort requests, and record values. Verify identifiers are never directly interpolated and query errors do not expose SQL.
- Use transactions for record plus audit writes. Plan for MySQL DDL non-transactional behavior and migrations that may partially apply; back up before production migrations.
- Establish rate limits for login and sensitive admin actions; review PII retention, logs, password reset policy, secrets, and audit visibility.

### Frontend

- Component tests for field rendering, validation feedback, loading/error/empty states, keyboard interaction and accessible labels.
- Feature tests for builder CRUD, mapping edits, record submission, duplicate-submit prevention, and permission-aware navigation. Hiding a menu item is not authorization.
- End-to-end test login → admin config → organization form submit → record list, including failed validation and stale/expired session.
- Run `npm run lint` and `npm run build` in `client/`; add a test script/runner only when the test design and dependency change are agreed.

### Operational gates

- Add `/api/v1` contract documentation (or generated OpenAPI) and seed/test data procedures.
- Verify startup/readiness behavior for both MySQL and Redis; health checks must distinguish liveness from readiness if deployment needs them.
- Record migration backups, deploy ordering, checksum policy, recovery steps, and environment-secret ownership.
- Use structured, redacted logs; do not log session IDs, device tokens, passwords, CSRF tokens, SMTP credentials, or full sensitive record payloads.

## 9. Current gaps and design risks to resolve

1. **Authorization is absent:** current `requireAuth` establishes an authenticated user, not an admin/organization permission model. Build server-side RBAC/policy checks before dynamic builders.
2. **No product domain/schema yet:** field/form/table/record/organization concepts need a versioned data model and lifecycle rules before the UI/API are implemented.
3. **Flexible schema can become unsafe:** dynamic SQL identifiers and user-defined SQL tables are high-risk. Use fixed metadata tables, validated typed values, and server-owned IDs.
4. **Excel-style filters can become expensive:** querying every distinct value for every column is unbounded. Use server-side, indexed/paginated facets, search, and filter complexity limits.
5. **Definition changes can invalidate saved mappings or records:** stable identifiers, archive rules, compatibility checks, schema versions, and explicit migrations are needed.
6. **User table is security-sensitive:** generic column editing must not modify/delete authentication fields. Custom user attributes need a separate storage boundary.
7. **Testing is thin:** available scripts include an API integration helper, but package scripts do not define unit/e2e test suites. Add tests with the first new domain module, not after all builders are complete.
8. **Auth should be verified, not assumed:** the repository contains a substantial login/session/CSRF implementation, but product readiness still depends on running the API checks in the target environment and testing failure paths. Avoid expanding the meaning of “authentication complete” to include authorization, user lifecycle, recovery/MFA, or account policy that is not present.
9. **Two router packages are listed:** client dependencies include both `react-router` and `react-router-dom` at different major versions. Before adding routes, confirm the intended React Router package/version and remove duplication only after compatibility is verified.
10. **No committed design system:** Tailwind is configured, but reusable Button/Input/Table/Toast/Loading primitives and design tokens are not yet established. Build them early to avoid inconsistent one-off UI.
11. **SMTP/security operations need a secret strategy:** credentials must be encrypted and rotation/deployment key ownership defined before SMTP settings are built.
12. **Tenant boundary is undecided:** if a deployment may host multiple organizations/customers, add tenant isolation to schema, indexes, authorization, and every repository query before the first data feature. Retrofitting this is expensive.

These are planning findings, not a security audit or a claim that each item is currently exploitable.

## 10. Working agreements for future changes

- Keep frontend features under `client/src/features/<feature>/`; put generic visual primitives in `client/src/components/ui/`; keep app composition and route definitions under `client/src/app/`.
- Keep each backend feature cohesive under `server/src/modules/<feature>/`, following existing routes/controller/service/repository/validation conventions.
- Put all persistent schema changes in a new, numbered migration. Never edit a migration already applied to a shared environment; the current runner enforces checksums.
- Keep values parameterized and identifiers server-owned. No endpoint accepts raw SQL, SQL fragments, or arbitrary column names.
- Keep a stable API contract and use shared client API/error handling; avoid page-specific fetch implementations.
- Preserve accessibility, loading/error/empty states, and server-side authorization in each feature.
- Update this guide when actual shipped behavior changes; label planned behavior as planned until implemented and tested.

## 11. Local commands currently available

From `server/`:

```powershell
npm run migrate
npm run dev
npm run create-user
npm run test-api
```

From `client/`:

```powershell
npm run dev
npm run lint
npm run build
```

The server requires values from `server/.env.example`, a reachable MySQL and Redis instance, and a strong session/CSRF secret. The Vite development server proxies `/api` requests to the configured local API. Use disposable test users/data for integration checks; never put real secrets in the repository.

## 12. Summary

The repository is a useful modular authentication foundation and already has a basic authenticated React shell. The requested configurable platform should be built as a metadata-driven system, with authorization, schema/version lifecycle, protected auth data, reusable UI, and server-authoritative validation designed in before CRUD screens multiply. The safest first milestone is the end-to-end MVP vertical slice described above, followed by the remaining admin, organization, user-management, and settings workflows.
