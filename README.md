# Leave Management

A configurable administration platform for leave and office data: definitions
(fields, dropdowns, forms, logical tables, mappings) are created by an admin, and
data is entered through mapped forms and stored in metadata-driven tables.

## Project status

Phases 1–7 are implemented: session/CSRF authentication with device-bound sessions,
server-side RBAC, the metadata builders with schema versioning, the record engine
(search, filter, sort, facets), the organization module, user administration,
encrypted SMTP settings, the audit trail, and one React admin surface built on
shared UI primitives with permission-aware navigation. Migrations `001`–`008` are
append-only and checksum-verified.

Remaining work is quality and decisions, not missing screens — see the roadmap and
gap list in the project guide.

## Documentation

- [docs/PROJECT-GUIDE.md](./docs/PROJECT-GUIDE.md) — current state, architecture decisions, phased roadmap and gaps
- [docs/API.md](./docs/API.md) — the `/api/v1` contract: envelopes, status codes, error codes, endpoints
- [docs/OPERATIONS.md](./docs/OPERATIONS.md) — environment variables, migrations, backup/restore, release checklist

## Local development

The server needs MySQL and Redis, plus values configured from `server/.env.example`.

From `server/`:

```powershell
npm install
npm run migrate
npm run dev            # API on http://localhost:4000
```

From `client/`:

```powershell
npm install
npm run dev            # app on http://localhost:5173, proxies /api to :4000
```

## Testing

`testing/` holds the Selenium end-to-end suite. It drives a visible Chrome window
against the running dev servers, so both must be up before it runs.

```powershell
cd testing
npm install
copy .env.example .env    # then fill in the QA admin account
npm test                  # full suite, headed browser
npm run smoke             # connectivity check only
```

Every run writes a report to `testing/reports/` (`run-*.md`, `run-*.json`,
`LATEST.*`) with failures grouped by the part of the system they came from, plus
screenshots and captured console/network errors as evidence. Test data is tagged
with the run id and accounts use a throwaway domain, so the suite never touches
your own account.
