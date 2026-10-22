# Leave Management & Dynamic Data Platform

A highly configurable, metadata-driven enterprise administration and leave management system built on Node.js (Express 5), MySQL 8, Redis, React 19, and Tailwind CSS 4. 

The application is designed around a **dynamic schema engine**: administrators can define custom fields, dropdown option sets, interactive forms, logical tables, form-to-table mappings, organization entity types, and custom user profile attributes at runtime without altering database DDL or risking data integrity.

---

## Key Highlights

- **Dynamic Schema Architecture**: Create logical tables, custom data types, validation rules, and relations on the fly. No MySQL `CREATE TABLE` or `ALTER TABLE` commands are executed at runtime.
- **Visual Form-to-Table Mapping**: Map form fields to logical table columns with real-time type compatibility checks, unmapped required column detection, and live re-validation.
- **Enterprise-Grade Security**: Argon2id password hashing, Redis-backed sessions with device fingerprint binding, HMAC double-submit CSRF protection, Cloudflare Turnstile bot deterrence, AES-256-GCM encrypted secret storage, and locked core authentication tables.
- **Organization Hierarchy & Role Membership**: Recursive entity types (e.g. Division → Department → Team) with depth guards, profile sections, and role-based user memberships (`organization_entity_members`).
- **Complete Audit Trail**: Immutable logging of administrative actions, user changes, settings updates, and record mutations with automatic redaction of sensitive credentials.
- **100% Automated Selenium E2E Coverage**: 17 complete test suites and 151 end-to-end tests validating smoke, authentication, navigation, metadata builders, records, data types, resilience, and security attack vectors.

---

## System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        React 19 Admin Shell                            │
│  Navigation (RBAC Filtered) | Form Builders | Visual Mapping Connector │
│      DataTable & Column Customizer | Member Panels | Audit Trail       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON / CSRF / Cookies
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          Express 5 API Gateway                         │
│  Helmet | Rate Limiters | Redis Session + Device | CSRF | Turnstile    │
│            RequireAuth | RequirePermission | Safe Error Envelope       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┼───────────────────────────────┐
    ▼                               ▼                               ▼
┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
│   Metadata Service    │   │    Record Engine      │   │     Security & RBAC   │
│ • Fields & Dropdowns  │   │ • Typed Data Coercion │   │ • Argon2id & Sessions │
│ • Forms & Tables      │   │ • Mapped Ingestion    │   │ • AES-256-GCM Secrets │
│ • Column Preferences  │   │ • JSON Document Store │   │ • RBAC Permissions   │
│ • Compatibility Logic │   │ • Search/Filter/Sort  │   │ • Redacted Audit Log  │
└───────────┬───────────┘   └───────────┬───────────┘   └───────────┬───────────┘
            │                           │                           │
            └───────────────────────────┼───────────────────────────┘
                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Persistence & State Store                        │
│    MySQL 8 (Metadata, Records, Users, Entities, Audit, App Settings)   │
│              Redis (Session Store, Rate Limits, CSRF tokens)           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Dynamic & Customizable Capabilities

The platform allows administrators to tailor every business workflow without developer intervention:

### 1. Metadata-Driven Logical Tables
- Define custom logical tables (`table_definitions`) and columns (`column_definitions`).
- Columns support rich data types: `text`, `textarea`, `number`, `date`, `boolean`, `dropdown`, `phone` (with E.164 formatting & validation), `multiselect`, `record_reference`, `entity_reference`, and `user_reference`.
- Records are stored as structured, validated JSON payloads inside `table_records.data`, indexed by `table_id`, `schema_version`, `status`, and `organization_entity_id`.
- System tables (`users`) are marked `is_system = 1` and protected with `SYSTEM_TABLE_READONLY` and `SYSTEM_COLUMN_LOCKED`.

### 2. Form Builder & Visual Mapping Engine
- **Reusable Field Definitions**: Create a field definition once (with labels, keys, constraints, and default values) and reuse it across multiple forms.
- **Form Layouts**: Reorder fields via drag-and-drop or accessible keyboard controls; configure per-form label and requirement overrides.
- **Form-to-Table Mappings (`form_table_mappings`)**: Map form input keys to logical table column keys. The engine validates type compatibility, warns on unmapped required columns, and verifies live definition existence during submission.

### 3. Relations & References
- **Record References**: Link records across logical tables with configurable cardinality (single vs multi-select).
- **Entity References**: Relate records to specific organization entities (teams, departments).
- **User References**: Connect records directly to active user accounts.

### 4. Custom User Profile Attributes
- Extend standard user accounts with arbitrary custom fields (`user_profile_values`).
- Custom attributes are configured as user column definitions, maintaining strict separation from core authentication fields (`email`, `password_hash`).

### 5. Organization Structure & Memberships
- Define clean, independent entity types (`organization_entity_types`) such as Teams, Departments, or Units.
- **Unified Single Header**: Zero outer margins, edge-to-edge layout integrating breadcrumb, status, key, entry metrics, and primary actions.
- **Single Configuration & Full Editability**: Each entity type has at most one linked Form & Table configuration. When unconfigured, administrators can link a pair (`New configuration`); once configured, the action seamlessly shifts to `Edit configuration` (which provides live dropdowns of all available active forms and managed tables to switch or re-map configurations) or remove. Upon saving, the header strip, table columns, and entry form dialog instantly adapt to the newly configured form & table.
- **Dynamic Configured Table Columns**: Rather than a static or hardcoded "Entity" column, the entity screen dynamically renders the real columns from the configured logical table (e.g. `Team Name`, `Description`, `Lead`), with individual data-type formatting, deep JSON payload search (`pr.data`), and full column visibility/reordering preferences.
- Form & Table mappings (`entity_type_configurations`) bind forms and managed tables directly to entities without artificial scope complexity.
- Manage user memberships (`organization_entity_members`) directly from entity lists and detail pages with explicit roles (`member`, `lead`, `manager`).

### 6. Interactive Data Grids & Column Customization
- Excel-style filtering with type-specific operators (`contains`, `equals`, `greater_than`, `is_one_of` facets).
- Column reordering, visibility toggling, and per-table persisted preferences.

---

## Security Model

Security is built into the architecture at every layer:

- **Password Security**: Passwords are hashed with Argon2id using unique cryptographic salts. Password changes immediately invalidate all active sessions for that account.
- **Session & Device Binding**: Sessions are stored in Redis (`leave.sid`) and bound to a secure, signed device cookie (`leave.device`). Hijacked session cookies from unfamiliar devices are rejected.
- **HMAC Double-Submit CSRF Protection**: All state-modifying requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid `x-csrf-token` header matching the signed HMAC CSRF cookie.
- **Bot Deterrence (Cloudflare Turnstile)**: Authentication endpoints support optional Turnstile verification to stop automated brute-force attacks.
- **Secret Encryption at Rest**: Outbound mail credentials (SMTP) are encrypted using authenticated **AES-256-GCM** with an external `ENCRYPTION_KEY`. Read endpoints return only whether a credential is configured (`passwordConfigured: true`), never the secret itself.
- **SQL Injection Immunization**: No client-supplied identifiers or column names are ever interpolated into SQL statements. All database operations use parameterized queries or server-validated allow-lists.
- **Locked System Columns**: System entities and authentication columns cannot be modified, deleted, or targeted by generic record builders (`SYSTEM_COLUMN_LOCKED`).
- **Safe Error Envelopes**: Errors return a standardized `{ success: false, message, code }` envelope. SQL syntax, database errors, table names, and stack traces are suppressed in production.
- **Tiered Rate Limiting**: Redis-backed sliding-window rate limiters with standard `draft-8` response headers prevent brute-force attacks on sensitive endpoints.
- **Immutable Audit Logging**: Administrative mutations, user updates, and record actions are recorded in `audit_events` with automatic redaction of sensitive keys (`password`, `token`, `secret`).

---

## Repository Structure

```text
Leave-Management/
├── client/                     # React 19 Frontend (Vite, Tailwind CSS 4)
│   ├── src/
│   │   ├── app/                # Router, providers, error boundaries
│   │   ├── components/         # Shared UI primitives (Button, Modal, DataTable, etc.)
│   │   ├── features/           # Feature modules: auth, forms, tables, records, org, users, settings
│   │   ├── hooks/              # Custom hooks (useAsyncData, useMutation, useDropdownOptions)
│   │   ├── layouts/            # AppShell & navigation data model
│   │   ├── lib/                # Client permissions catalogue
│   │   └── services/           # API transport, resource definitions, error parsing
├── server/                     # Express 5 Backend
│   ├── sql/migrations/         # Append-only, checksum-verified SQL migrations (001–009)
│   ├── src/
│   │   ├── config/             # Environment, database, Redis, and session config
│   │   ├── lib/                # Encryption, responses, record query builder, data types, RBAC
│   │   ├── middleware/         # Auth, permissions, CSRF, rate limiter, error handler
│   │   └── modules/            # Domain modules: auth, fields, forms, tables, records, org, users, audit
│   └── scripts/                # Database migrations and administrative CLI utilities
├── testing/                    # Automated Selenium E2E Test Suite
│   ├── suites/                 # 17 Test Suites (00-smoke through 16-security)
│   ├── lib/                    # WebDriver session wrapper, API client, reporting, fixtures
│   └── reports/                # Test execution markdown reports and screenshots
└── docs/                       # Project Documentation
    ├── API.md                  # Comprehensive /api/v1 contract, endpoints & error codes
    ├── OPERATIONS.md           # Deployment runbook, migrations, environment & backups
    └── PROJECT-GUIDE.md        # Architecture specification, roadmap & implementation log
```

---

## Local Development Setup

### Prerequisites
- Node.js (v20+)
- MySQL Server (v8.0+)
- Redis Server (v7.0+)

### 1. Backend Setup
```powershell
cd server
copy .env.example .env          # Configure DB, Redis, and ENCRYPTION_KEY
npm install
npm run migrate                 # Runs checksum-verified migrations 001–009
npm run dev                     # Starts Express server on http://localhost:4000
```

### 2. Frontend Setup
```powershell
cd client
npm install
npm run dev                     # Starts Vite dev server on http://localhost:5173
```

---

## Automated End-to-End Testing (Selenium)

The `testing/` package provides comprehensive browser-driven end-to-end testing against the live development servers.

### Running Tests

Ensure both `server` and `client` are running before executing tests.

```powershell
cd testing
npm install
copy .env.example .env          # Set E2E admin credentials (e2e.admin@leave.test)
npm run setup                   # Prepares test accounts in MySQL

# Run all test suites in headless mode
npm run headless

# Run all test suites in a visible Chrome browser
npm test

# Run a specific suite
node run.js --headless --suite "data types"
node run.js --headless --suite "records"
node run.js --headless --suite "organization"
node run.js --headless --suite "security"

# Fast connectivity smoke test
npm run smoke

# Clean up tagged test data
npm run cleanup                 # Dry run report
npm run cleanup:apply           # Deletes tagged rows
```

### Complete Test Suites Status (151 / 151 Passed)

| Suite | Scope | Tests | Status |
|---|---|:---:|:---:|
| `00-smoke` | Basic API & Web App connectivity | 3 | Passing (3/3) |
| `01-auth` | Login, logout, session persistence & cookie security | 12 | Passing (12/12) |
| `02-navigation` | Sidebar links, route protection, breadcrumbs & skip link | 8 | Passing (8/8) |
| `03-fields` | Field definition CRUD, validation, data types & archive rules | 8 | Passing (8/8) |
| `04-dropdowns` | Option set management, option reordering & lifecycle | 6 | Passing (6/6) |
| `05-forms` | Form builder, field selection, drag-and-drop & label overrides | 7 | Passing (7/7) |
| `06-tables` | Logical tables, column editor, locked system columns & ordering | 9 | Passing (9/9) |
| `07-mappings` | Visual form-to-table connector & compatibility verification | 5 | Passing (5/5) |
| `08-records` | Data ingestion, Excel-style facets, search, sort & pagination | 10 | Passing (10/10) |
| `09-organization` | Entity types, configurations, entity tree & memberships | 11 | Passing (11/11) |
| `10-users` | User management, RBAC assignment & custom profile attributes | 16 | Passing (16/16) |
| `11-settings` | SMTP encrypted configuration, validation & connection probe | 9 | Passing (9/9) |
| `12-audit` | Redacted audit event query engine & actor tracking | 9 | Passing (9/9) |
| `13-vertical-slice`| End-to-end lifecycle: Definition → Submission → Audit | 7 | Passing (7/7) |
| `14-data-types` | Extended data types: phone, references, booleans & multiselect | 14 | Passing (14/14) |
| `15-resilience` | Network delay, double-clicks, empty states & expired sessions | 8 | Passing (8/8) |
| `16-security` | SQL injection, XSS escaping, CSRF bypass & secret leakage | 9 | Passing (9/9) |
| **Total** | **Comprehensive Full-Spectrum Test Coverage** | **151** | **100% Passed (151/151)** |

---

## Documentation Links

- **[docs/PROJECT-GUIDE.md](./docs/PROJECT-GUIDE.md)**: In-depth architectural decisions, data model specs, security rules, and development roadmap.
- **[docs/API.md](./docs/API.md)**: Full REST API specification with request/response schemas, permission keys, and error codes.
- **[docs/OPERATIONS.md](./docs/OPERATIONS.md)**: Production deployment, checksum-verified migrations, backup/restore, secret rotation, and operational runbook.
