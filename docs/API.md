# API contract — `/api/v1`

**Applies to:** the Express server in `server/` and the shared client helper in `client/src/services/`.
**Purpose:** this is the contract both sides code against. A response shape, an error code or a query parameter documented here is a promise: changing it is a breaking change and needs an update to this file, the server, and `client/src/services/`.

---

## 1. Transport conventions

| Concern | Contract |
|---|---|
| Base path | every route lives under `/api/v1` |
| Request body | `application/json`, parsed with a **1 MB** limit (`express.json({ limit: "1mb" })`) |
| Cookies | the API is session-cookie authenticated; browsers must send `credentials: "include"` |
| Session cookie | `leave.sid` (Redis-backed Express session) |
| Device cookie | `leave.device`, `httpOnly`, `sameSite=lax`, one-year max age |
| CSRF cookie | `csrf-token`, readable by the browser (`httpOnly: false`) |
| CSRF header | `x-csrf-token` on every non-`GET`/`HEAD`/`OPTIONS` request |
| CORS | `origin: env.FRONTEND_URL`, `credentials: true` |
| Security headers | Helmet defaults |
| Identifiers | numeric auto-increment IDs in paths (`:fieldId`, `:tableId`, …); Zod coerces them to positive integers |
| Keys | stable `snake_case` keys (`^[a-z][a-z0-9_]{1,62}$` for column/field keys). Labels are editable, keys are not |
| Timestamps | ISO-8601 strings in UTC (`2026-10-17T09:12:00.000Z`) |
| Unknown route | `404 { success: false, message: "Route not found: GET /api/v1/…" }` |

### Rate limits

Redis-backed, `standardHeaders: draft-8`, one shared window per surface:

| Limiter | Window | Limit | Applies to |
|---|---|---|---|
| global | 15 min | 300 | every request |
| login | 15 min | 100 | `POST /api/v1/auth/login` |
| sensitive `users` | 15 min | 20 | `POST /api/v1/admin/users`, `PUT /api/v1/admin/users/:userId/password` |
| sensitive `smtp` | 15 min | 20 | `POST /api/v1/admin/settings/smtp/test` |

A limited request gets `429 { success: false, message: "…" }`.

---

## 2. Response envelopes

### Success

Produced by `server/src/lib/responses.js`:

```jsonc
// ok()      200
{ "success": true, "data": { } }

// created() 201
{ "success": true, "data": { } }

// okList()  200
{ "success": true, "data": [ ], "meta": { "page": 1, "pageSize": 25, "total": 143, "totalPages": 6 } }

// okMessage() 200
{ "success": true, "message": "Saved.", "data": null }
```

Advisory payloads ride inside `data` — e.g. `data.warnings` (an array of strings) and `data.details.errors` (an array of strings) on definition and mapping endpoints.

**Documented exceptions** (historical auth shape — they return the user at the top level, not under `data`):

```jsonc
// POST /auth/login, GET /auth/me
{ "success": true, "user": { } }

// POST /auth/logout
{ "success": true, "message": "Logged out successfully" }

// GET /security/csrf
{ "success": true, "csrfToken": "…" }

// GET /health
{ "success": true, "status": "ok", "services": { "mysql": "up", "redis": "up" }, "timestamp": "…" }
```

`GET /api/v1/health` answers `200` when both dependencies are up and `503` (with `success: false`, `status: "degraded"`) otherwise, so it doubles as a readiness probe.

### Errors

`server/src/middleware/errorHandler.js` is the only place errors become HTTP responses:

```jsonc
{
  "success": false,
  "message": "Human-readable, safe to display.",
  "code": "STABLE_MACHINE_CODE",   // optional — branch on this, never on the message
  "errors": { "label": ["…"] },    // optional — per-field failures
  "details": { }                   // optional — collection-level results (e.g. mapping validation)
}
```

| Status | When | Shape |
|---|---|---|
| `400` | Zod validation failed | `{ success: false, message: "Validation failed", errors }` — `errors` is Zod's `flatten().fieldErrors`, so **values are arrays of strings** |
| `400` | Application rule rejected (`badRequest`) | `{ success: false, message, code, errors? }` — `errors` here is usually a **flat key → string** map |
| `401` | No session, revoked/expired session, disabled account, password changed since the session started | `{ success: false, message, code? }` |
| `403` | Missing permission, or invalid CSRF token | `{ success: false, message, code? }` |
| `404` | Unknown route, or `notFound()` application error | `{ success: false, message, code? }` |
| `409` | Conflict — duplicate key, referenced item, stale definition | `{ success: false, message, code }` |
| `422` | Well-formed request the server refuses (invalid record values, failed SMTP probe) | `{ success: false, message, code, errors?, details? }` |
| `500` | Unexpected failure | `{ success: false, message: "Internal server error" }` — internal detail never leaves the server |

Because `errors` arrives both as a Zod array map (definition endpoints) and as a flat message map (record endpoints), the client normalizes both to one string per key in `fieldErrors()` (`client/src/services/errors.js`).

---

## 3. List query contract

Every list endpoint accepts the same query parameters; unknown keys are ignored, malformed values are rejected.

| Parameter | Meaning | Bounds |
|---|---|---|
| `page` | 1-based page | ≥ 1 |
| `pageSize` | rows per page | 1–200, default **25** |
| `search` | free-text match on the endpoint's documented columns | ≤ 200 chars → `SEARCH_TOO_LONG` |
| `sort` | `key:direction`, comma-separated for up to 3 terms | direction `asc` \| `desc`; keys are allow-listed per endpoint → `INVALID_SORT_KEY`, `INVALID_SORT_DIRECTION`, `SORT_LIMIT_EXCEEDED` |
| `status` | resource status filter | `active` \| `archived` (some endpoints add more) |

Records additionally accept:

| Parameter | Meaning |
|---|---|
| `filters` | **one JSON array**, URL-encoded: `[{"column":"leave_days","operator":"gte","value":5}]`, max 12 → `FILTER_LIMIT_EXCEEDED`, `INVALID_COLUMN`, `INVALID_FILTER_OPERATOR`, `INVALID_FILTER_VALUE` |
| `organizationEntityId` | restrict rows to one organization entity |

Filter operators by storage type:

| Storage | Operators (arity) |
|---|---|
| `string` | `contains`, `equals`, `notEquals`, `startsWith`, `endsWith` (1), `in` (many), `isEmpty`, `isNotEmpty` (0) |
| `number` | `equals`, `notEquals`, `gt`, `gte`, `lt`, `lte` (1), `between` (2), `isEmpty`, `isNotEmpty` (0) |
| `date` | `equals`, `before`, `after` (1), `between` (2), `isEmpty`, `isNotEmpty` (0) |
| `boolean` | `isTrue`, `isFalse`, `isEmpty` (0) |
| `reference` | `in` (many), `isEmpty`, `isNotEmpty` (0) |

Sorting and filtering only ever name **keys**. The server maps a key onto its own SQL expression or JSON path, so no client string is concatenated into SQL.

### Data types

`text`, `textarea`, `number`, `date`, `email`, `dropdown`, `checkbox`, `toggle`, `record_reference` — discoverable at `GET /api/v1/admin/metadata/data-types`, which is the authoritative list of per-type configuration settings and filter operators.

---

## 4. Authorization

`requireAuth` establishes identity; `requirePermission(...keys)` is **any-of** the listed keys and resolves the permission set from the database per request, so role changes take effect immediately. Every `/api/v1/admin/*`, `/api/v1/authorization/*` (except `/permissions`), `/api/v1/tables/*` and `/api/v1/organization/*` route is guarded by both, and all of them are mounted after the CSRF gate.

| Constant | Key |
|---|---|
| `FIELDS_VIEW` / `FIELDS_MANAGE` | `admin.fields.view` / `admin.fields.manage` |
| `DROPDOWNS_VIEW` / `DROPDOWNS_MANAGE` | `admin.dropdowns.view` / `admin.dropdowns.manage` |
| `FORMS_VIEW` / `FORMS_MANAGE` | `admin.forms.view` / `admin.forms.manage` |
| `TABLES_VIEW` / `TABLES_MANAGE` | `admin.tables.view` / `admin.tables.manage` |
| `MAPPINGS_VIEW` / `MAPPINGS_MANAGE` | `admin.mappings.view` / `admin.mappings.manage` |
| `USERS_VIEW` / `USERS_MANAGE` | `admin.users.view` / `admin.users.manage` |
| `ORGANIZATION_VIEW` / `ORGANIZATION_MANAGE` | `admin.organization.view` / `admin.organization.manage` |
| `SETTINGS_VIEW` / `SETTINGS_MANAGE` | `admin.settings.view` / `admin.settings.manage` |
| `AUDIT_VIEW` | `admin.audit.view` |
| `RECORDS_VIEW` / `RECORDS_CREATE` / `RECORDS_UPDATE` / `RECORDS_DELETE` | `records.view` / `.create` / `.update` / `.delete` |

| Role | Holds |
|---|---|
| `super_admin` | everything, including settings and secrets |
| `admin` | everything except `admin.settings.manage` |
| `manager` | view all configuration, `admin.users.view`, manage organization, view/create/update records |
| `employee` | `admin.forms.view`, `admin.organization.view`, `records.view`, `records.create` |

A permission failure is `403 { code: "PERMISSION_DENIED" }`. On a fresh installation the first account to sign in is promoted to `super_admin` (`ensureBootstrapAdministrator`); every later account is assigned roles explicitly.

---

## 5. Endpoint reference

### Auth, health and security (no `requireAuth` unless noted)

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/v1/health` | — | `200` ok / `503` degraded |
| `GET` | `/api/v1/security/csrf` | — | returns `{ csrfToken }` |
| `POST` | `…/auth/login` | — | login rate limiter + CSRF; body `{ email, password }` |
| `POST` | `…/auth/logout` | session | CSRF; revokes the current session only |
| `GET` | `…/auth/me` | session | sanitized profile |

### Fields — `/api/v1/admin/fields`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/` | `FIELDS_VIEW` \| `FIELDS_MANAGE` |
| `GET` | `/:fieldId` | view \| manage |
| `GET` | `/:fieldId/usage` | view \| manage |
| `POST` | `/` | `FIELDS_MANAGE` |
| `PATCH` | `/:fieldId` | `FIELDS_MANAGE` |
| `DELETE` | `/:fieldId` | `FIELDS_MANAGE` — archives; blocked when in use |

### Dropdowns — `/api/v1/admin/dropdowns`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/`, `/:dropdownId`, `/:dropdownId/options` | view \| manage |
| `POST` | `/`, `/:dropdownId/options` | `DROPDOWNS_MANAGE` |
| `PATCH` | `/:dropdownId`, `/:dropdownId/options/:optionId` | `DROPDOWNS_MANAGE` |
| `PUT` | `/:dropdownId/options/order` | `DROPDOWNS_MANAGE` — full ordered set |
| `DELETE` | `/:dropdownId`, `/:dropdownId/options/:optionId` | `DROPDOWNS_MANAGE` |

### Forms — `/api/v1/admin/forms`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/`, `/:formId`, `/:formId/usage` | view \| manage |
| `GET` | `/:formId/render` | view \| manage — the renderer contract: fields, order, per-form overrides, option sets |
| `POST` | `/` | `FORMS_MANAGE` |
| `PATCH` | `/:formId` | `FORMS_MANAGE` |
| `PUT` | `/:formId/fields/order` | `FORMS_MANAGE` — full ordered set |
| `DELETE` | `/:formId` | `FORMS_MANAGE` |

### Logical tables — `/api/v1/admin/tables`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/`, `/:tableId`, `/:tableId/usage`, `/:tableId/columns` | view \| manage |
| `POST` | `/`, `/:tableId/columns` | `TABLES_MANAGE` |
| `PATCH` | `/:tableId`, `/:tableId/columns/:columnId` | `TABLES_MANAGE` |
| `PUT` | `/:tableId/columns/order` | `TABLES_MANAGE` — full ordered set |
| `DELETE` | `/:tableId`, `/:tableId/columns/:columnId` | `TABLES_MANAGE` — archives; system tables/columns are read-only |

### Mappings — `/api/v1/admin/mappings`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/` | view \| manage |
| `GET` | `/compatibility?formId=&tableId=` | view \| manage — compatible field/column pairs |
| `GET` | `/for/:formId/:tableId` | view \| manage |
| `PUT` | `/` | `MAPPINGS_MANAGE` — creates or replaces the pair's mapping; rejects missing/incompatible/inactive entries and reports every problem in `details.errors` |
| `GET` | `/:mappingId` | view \| manage |
| `PATCH` | `/:mappingId` | `MAPPINGS_MANAGE` |
| `DELETE` | `/:mappingId` | `MAPPINGS_MANAGE` |

### Metadata (reference data, session only)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/admin/metadata/data-types` | types, storage kind, per-type config, filter operators |
| `GET` | `/api/v1/admin/metadata/lookups` | active fields, dropdowns, forms, tables and columns for pickers |

### Records (data plane) — `/api/v1/tables`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/:tableId/records` | `RECORDS_VIEW` |
| `GET` | `/:tableId/records/facets` | `RECORDS_VIEW` — bounded distinct values for a column filter |
| `POST` | `/:tableId/records` | `RECORDS_CREATE` — `{ values, formId?, organizationEntityId? }`; with `formId` the keys are form field keys resolved through the mapping |
| `GET` | `/:tableId/records/:recordId` | `RECORDS_VIEW` |
| `PATCH` | `/:tableId/records/:recordId` | `RECORDS_UPDATE` |
| `DELETE` | `/:tableId/records/:recordId` | `RECORDS_DELETE` — archives the row |

A record accepts at most **200** values, revalidated against the live column definitions on every write.

### Organization — `/api/v1/organization`

| Method | Path | Permission |
|---|---|---|
| `GET` / `POST` | `/entity-types` | `ORGANIZATION_VIEW` / `ORGANIZATION_MANAGE` |
| `GET` / `PATCH` / `DELETE` | `/entity-types/:entityTypeId` | view / manage / manage |
| `GET` / `POST` | `/entity-types/:entityTypeId/configurations` | view / manage |
| `PATCH` / `DELETE` | `/configurations/:configurationId` | manage |
| `GET` / `POST` | `/entities` | view / manage |
| `GET` / `PATCH` / `DELETE` | `/entities/:entityId` | view / manage / manage (archive) |

### Authorization — `/api/v1/authorization`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/permissions` | session — the caller's own keys and roles |
| `GET` | `/roles` | `USERS_VIEW` |
| `PUT` | `/users/:userId/roles` | `USERS_MANAGE` — replaces the role set; blocked when it would demote the last administrator or lock the caller out (`SELF_DEMOTION_BLOCKED`) |

### Audit — `/api/v1/admin/audit`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/events` | `AUDIT_VIEW` — newest first (`id DESC`), filters `action`, `entityType`, `entityId`, `actorUserId`, `from`, `to` (both `YYYY-MM-DD`); `summary` is redacted on write |

### Users — `/api/v1/admin/users`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/` | `USERS_VIEW` \| `USERS_MANAGE` — searchable by email/name, filterable by `status` and `role`, sortable |
| `GET` | `/:userId` | view \| manage |
| `POST` | `/` | `USERS_MANAGE` — `{ email, firstName, lastName?, password, roleKeys, status? }` |
| `PATCH` | `/:userId` | `USERS_MANAGE` — profile and/or `status`; at least one key required |
| `PUT` | `/:userId/password` | `USERS_MANAGE` — sets a new password and revokes that account's sessions |

The password hash is never returned. Setting a password or deactivating an account invalidates existing sessions.

### Settings — `/api/v1/admin/settings`

| Method | Path | Permission |
|---|---|---|
| `GET` | `/` | `SETTINGS_VIEW` — `{ smtp, secretStorageConfigured }` |
| `GET` | `/smtp` | `SETTINGS_VIEW` — stored values plus `passwordConfigured: boolean`; **the credential itself is never returned** |
| `PATCH` | `/smtp` | `SETTINGS_MANAGE` — only the keys you send change; `password` is write-only, `clearPassword: true` removes it |
| `POST` | `/smtp/test` | `SETTINGS_MANAGE` — opens a connection and attempts auth against the stored host; queues no mail and echoes no password |

`GET /api/v1/admin/settings/smtp` therefore answers:

```jsonc
{
  "success": true,
  "data": {
    "host": "smtp.example.org", "port": 587, "secure": false,
    "username": "alerts@example.org", "fromAddress": "alerts@example.org",
    "authMode": "password", "passwordConfigured": true
  }
}
```

---

## 6. Error code index

Codes are stable and machine-readable; group them by what the caller should do.

**Session and identity (401/403):** `SESSION_INVALID`, `USER_MISMATCH`, `DEVICE_MISSING`, `DEVICE_MISMATCH`, `DEVICE_NOT_BOUND`, `DEVICE_USER_MISMATCH`, `DEVICE_VALIDATION_FAILED`, `EXPIRED`, `REVOKED`, `PERMISSION_DENIED`.

**Not found (404):** `FIELD_NOT_FOUND`, `DROPDOWN_NOT_FOUND`, `FORM_NOT_FOUND`, `TABLE_NOT_FOUND`, `COLUMN_NOT_FOUND`, `OPTION_NOT_FOUND`, `MAPPING_NOT_FOUND`, `ENTITY_TYPE_NOT_FOUND`, `ENTITY_NOT_FOUND`, `CONFIGURATION_NOT_FOUND`, `RECORD_NOT_FOUND`, `USER_NOT_FOUND`, `PARENT_ENTITY_NOT_FOUND`, `PARENT_TYPE_NOT_FOUND`, `RELATION_TARGET_NOT_FOUND`, `TARGET_TABLE_NOT_FOUND`.

**Conflict / in use (409):** `DUPLICATE_ENTRY`, `REFERENCE_CONFLICT`, `EMAIL_TAKEN`, `FIELD_KEY_TAKEN`, `DROPDOWN_KEY_TAKEN`, `FORM_KEY_TAKEN`, `TABLE_KEY_TAKEN`, `COLUMN_KEY_TAKEN`, `ENTITY_TYPE_KEY_TAKEN`, `ENTITY_NAME_TAKEN`, `CONFIGURATION_LABEL_TAKEN`, `DUPLICATE_OPTION_VALUE`, `FORM_HAS_MAPPINGS`, `TABLE_HAS_MAPPINGS`, `TABLE_HAS_RECORDS`, `DROPDOWN_IN_USE`, `OPTION_IN_USE`, `MAPPING_IN_USE`, `PROFILE_CONFIGURATION_IN_USE`, `FORM_IN_ORGANIZATION_USE`, `TABLE_IN_ORGANIZATION_USE`, `TABLE_IS_REFERENCED`, `ENTITY_TYPE_HAS_ENTITIES`, `ENTITY_TYPE_HAS_CHILDREN`, `ENTITY_HAS_CHILDREN`, `LAST_ADMINISTRATOR_PROTECTED`, `SELF_DEACTIVATION_BLOCKED`, `SELF_DEMOTION_BLOCKED`.

**Lifecycle and archived references (409/422):** `FIELD_ARCHIVED`, `DROPDOWN_ARCHIVED`, `FORM_ARCHIVED`, `TABLE_ARCHIVED`, `MAPPING_ARCHIVED`, `ENTITY_ARCHIVED`, `ENTITY_TYPE_ARCHIVED`, `RECORD_ARCHIVED`, `RELATION_TARGET_ARCHIVED`, `TARGET_TABLE_ARCHIVED`, `MAPPING_STALE`, `MAPPING_DEFINITION_INACTIVE`, `DROPDOWN_UNAVAILABLE`.

**Definition and mapping rules (400/422):** `UNSUPPORTED_DATA_TYPE`, `INVALID_TYPE_CONFIG`, `INVALID_DEFAULT_VALUE`, `REQUIRED_WITHOUT_DEFAULT`, `INVALID_KEY`, `RESERVED_KEY`, `FIELD_TYPE_LOCKED`, `COLUMN_TYPE_LOCKED`, `SYSTEM_COLUMN_LOCKED`, `SYSTEM_TABLE_LOCKED`, `SYSTEM_TABLE_READONLY`, `FIELD_NOT_MAPPED`, `FIELD_MISMATCH`, `COLUMN_MISMATCH`, `OPTION_MISMATCH`, `INVALID_MAPPING`, `MAPPING_PAIR_MISMATCH`, `DUPLICATE_FORM_FIELD`, `INCOMPLETE_FIELD_ORDER`, `INCOMPLETE_COLUMN_ORDER`, `INCOMPLETE_OPTION_ORDER`, `INVALID_DISPLAY_COLUMN`, `SELF_RELATION_BLOCKED`, `RELATION_TYPE_MISMATCH`, `RELATION_TARGET_REQUIRED`.

**Record values and queries (400/422):** `INVALID_RECORD_VALUES`, `INVALID_RECORD_REFERENCE`, `INVALID_COLUMN`, `INVALID_FILTER_OPERATOR`, `INVALID_FILTER_VALUE`, `INVALID_SORT_KEY`, `INVALID_SORT_DIRECTION`, `SORT_LIMIT_EXCEEDED`, `FILTER_LIMIT_EXCEEDED`, `FILTER_VALUE_LIMIT`, `FACET_UNSUPPORTED`, `SEARCH_TOO_LONG`.

**Organization hierarchy (400/422):** `HIERARCHY_TOO_DEEP`, `PARENT_TYPE_CYCLE`, `PARENT_ENTITY_CYCLE`, `PARENT_TYPE_SELF_REFERENCE`, `PARENT_ENTITY_SELF_REFERENCE`, `PARENT_TYPE_ARCHIVED`, `PARENT_ENTITY_ARCHIVED`, `PARENT_ENTITY_TYPE_MISMATCH`, `PARENT_TYPE_NOT_CONFIGURED`, `ORGANIZATION_ENTITY_INVALID`, `PROFILE_NOT_CONFIGURED`, `PROFILE_ALREADY_CONFIGURED`.

**Users and secrets (400/409/503):** `PASSWORD_POLICY`, `UNKNOWN_ROLE`, `VALIDATION_FAILED`, `NO_CHANGES`, `ENCRYPTION_NOT_CONFIGURED`, `SECRET_MALFORMED`, `SECRET_DECRYPT_FAILED`.

**SMTP probe (422):** `SMTP_HOST_REQUIRED`, `SMTP_HOST_INVALID`, `SMTP_CREDENTIALS_REQUIRED`, `SMTP_HOST_NOT_FOUND`, `SMTP_CONNECTION_REFUSED`, `SMTP_CONNECTION_FAILED`, `SMTP_TIMEOUT`, `SMTP_CLOSED`, `SMTP_PROTOCOL`, `SMTP_TLS_FAILED`, `SMTP_STARTTLS_REJECTED`, `SMTP_AUTH_UNAVAILABLE`, `SMTP_AUTH_REJECTED`.

---

## 7. Client-side contract

`client/src/services/api.js` is the only place that talks HTTP:

- prefixes `/api/v1`, always sends cookies, sets `Content-Type: application/json` when there is a body;
- fetches a CSRF token on demand for any mutating method and **retries once** when the server answers `403` with `message: "Invalid CSRF token"`;
- throws an `Error` carrying `status`, `code` and `data` (the parsed envelope), so screens read failures through the helpers in `client/src/services/errors.js`:

| Helper | Reads |
|---|---|
| `errorMessage(error, fallback)` | `error.data.message` → `error.message` |
| `fieldErrors(error)` | `error.data.errors`, arrays and flat maps both |
| `warningMessages(payload)` | `payload.data.warnings` |
| `detailErrors(error)` | `error.data.details.errors` |

`client/src/services/resources.js` is the only place that names endpoints; feature screens never call `fetch` directly. Hiding a navigation item is presentation only — every mutation is re-authorized by the server.
