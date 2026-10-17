# Operations — environment, migrations, recovery and release

**Applies to:** `server/` (Express + MySQL + Redis) and `client/` (Vite build served separately).
**Read before** running a migration in any shared environment, and before every release.

---

## 1. Environment

Configuration is parsed once in `server/src/config/env.js` with Zod; an invalid or missing value stops the process at boot rather than degrading silently.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` flips every cookie to `Secure`; the API must then be served over HTTPS |
| `HOST` / `PORT` | no | `0.0.0.0` / `4000` | the client dev server proxies `/api` to this port |
| `FRONTEND_URL` | **yes** | — | the only allowed CORS origin, must be an absolute URL |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | **yes** (port 3306) | — | MySQL 8, `utf8mb4_unicode_ci` |
| `REDIS_HOST` `REDIS_PORT` `REDIS_PASSWORD` | **yes** (port 6379) | — | sessions and rate-limit counters |
| `SESSION_SECRET` | **yes**, ≥ 32 chars | — | signs the `leave.sid` cookie |
| `CSRF_SECRET` | **yes**, ≥ 32 chars | — | derives the double-submit token from the session |
| `ENCRYPTION_KEY` | only when secret settings are saved | — | ≥ 32 chars; see §3 |
| `TEST_EMAIL` `TEST_PASSWORD` | for `npm run test-api` only | — | never a real account |

Copy `server/.env.example` to `server/.env` and fill it in. `.env` is not committed and never should be.

### Secret ownership

| Secret | Who holds it | Rotation effect |
|---|---|---|
| `SESSION_SECRET` | deployment owner, in the environment — not in the repository | every session becomes invalid; all users sign in again |
| `CSRF_SECRET` | deployment owner | tokens are regenerated on the next `GET /api/v1/security/csrf`; harmless |
| `ENCRYPTION_KEY` | deployment owner | **stored encrypted settings become undecryptable** — see §3 |

Generate a strong value with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

`ENCRYPTION_KEY` encrypts the SMTP credential stored in `app_settings`. If it changes or is lost, the stored password cannot be recovered: `GET /api/v1/admin/settings/smtp` keeps reporting `passwordConfigured: true`, but the test probe fails with `SECRET_DECRYPT_FAILED`. Recovery is administrative — re-enter the mail password in **Settings → Platform settings**, or clear the row:

```sql
UPDATE app_settings SET setting_value = JSON_REMOVE(setting_value, '$.password') WHERE setting_key = 'smtp';
```

Rotation procedure that keeps both old and new key versions readable is **not** implemented: the envelope records `v: 1` and `alg` but no key id, so plan rotation as "re-enter secrets afterwards".

---

## 2. Migrations

`server/sql/migrations/NNN_name.sql`, applied by `npm run migrate` (`scripts/migrate.js`).

| Migration | Creates / changes |
|---|---|
| `001_auth.sql` | `users` |
| `002_password_security.sql` | backfills `users.password_changed_at` from `created_at` (the column itself is created by `001_auth.sql`) |
| `003_user_sessions.sql` | `user_sessions` |
| `004_user_devices.sql` | `user_devices` |
| `005_session_device_binding.sql` | binds sessions to devices |
| `006_authorization.sql` | `roles`, `permissions`, `role_permissions`, `user_roles` |
| `007_metadata_definitions.sql` | field, dropdown, table/column, form and mapping definitions |
| `008_records_organization.sql` | `table_records`, organization entity types/entities/configurations, `audit_events`, `app_settings` (seeds the `smtp` row), `user_profile_values` |

### How the runner behaves

- Files matching `^\d+_.+\.sql$` are applied in **lexical order**, one connection, `multipleStatements: true`.
- `schema_migrations (migration, checksum, applied_at)` records one row per file; `checksum` is the **SHA-256 of the file text**.
- An already-applied file whose text changed fails the run with `Migration checksum mismatch: <file>` — this is the guard, not a bug.
- Applied files are otherwise skipped, so a run on an up-to-date database is a no-op ("Database is already up to date").
- There is **no down-migration and no dry run**. Recovery is restore-from-backup or a forward-fix migration.

### Rules

1. **Never edit an applied migration.** Add `009_…sql`. This is also `docs/PROJECT-GUIDE.md` §10.
2. Keep statements **replay-safe** (`CREATE TABLE IF NOT EXISTS`, `INSERT … ON DUPLICATE KEY UPDATE`) where possible: MySQL DDL is not transactional, so a failing file can half-apply without ever getting its `schema_migrations` row. Re-running the same file then replays every statement.
3. Destructive changes (dropped columns, retyped columns) ship as **expand → migrate → contract**: add the new shape in one release, backfill, remove the old shape in a later release.
4. Reference data (permissions, roles, the `smtp` settings row) is inserted inside the migration that creates its table, so a fresh environment is complete after `npm run migrate`.

### Before migrating anywhere shared

```powershell
# 1. back up (see §3), then confirm the dump is readable
# 2. rehearse against a copy, never against the live schema
mysqldump --single-transaction --routines --triggers --hex-blob -h HOST -P 3306 -U USER -p leave_management > rehearsal.sql
mysql -h HOST -P 3306 -U USER -p leave_management_rehearsal < rehearsal.sql
# 3. point a scratch .env at the copy and run
npm run migrate
# 4. check the result, then start the API and hit the health endpoint
mysql … -e "SELECT migration, applied_at FROM schema_migrations ORDER BY id"
curl http://localhost:4000/api/v1/health
```

Rehearsal passes when: the run applies only the new files, no checksum mismatch appears, `GET /api/v1/health` answers `200` with `mysql` and `redis` both `up`, and one known record and one known audit event still read back correctly.

---

## 3. Backup and restore

**Take a backup before every migration, every schema-affecting release, and before touching `app_settings`.**

```powershell
# consistent InnoDB snapshot without locking the table
mysqldump --single-transaction --routines --triggers --hex-blob `
  -h $env:DB_HOST -P $env:DB_PORT -U $env:DB_USER -p leave_management `
  > backup_LeaveManagement_$(Get-Date -Format yyyyMMdd_HHmmss).sql
```

Verify the file is non-empty and contains `CREATE TABLE \`users\`` before treating the backup as taken. Keep at least one pre-migration dump per release, and record where it lives — an unlocatable backup is not a backup.

```powershell
# restore into an empty or throwaway database
mysql -h HOST -P 3306 -U USER -p leave_management < backup_LeaveManagement_20261017_0930.sql
```

**Restore drill (do it once per environment, then on every major release):** restore the dump into a scratch database, point a local server at it, sign in with the QA account, list records, read the audit trail. Anything that fails is the rollback plan's missing piece.

### What is not in the MySQL dump

| Store | Contents | On loss |
|---|---|---|
| Redis `leave-session:*` | active sessions | everyone signs out; no data loss. Sessions also live in MySQL `user_sessions`, which is authoritative for revocation |
| Redis `leave-ratelimit:*` | rate-limit windows | counters reset; nothing to back up |

Do not back up Redis for disaster recovery, and never restore it onto a live database.

### Rollback

There is no `migrate:undo`. Choose in this order:

1. **Forward-fix** — a new migration that repairs the data or adds back what was dropped. Preferred; keeps history honest.
2. **Restore** — roll the application code back and restore the pre-migration dump. Accepts the data written since the backup as lost, so it needs a decision from whoever owns the data, not just the deployer.

Write the choice down before migrating when the migration is destructive.

---

## 4. Startup, readiness and liveness

`src/server.js` validates the environment, connects Redis, builds the Express app, then listens. Redis must be reachable before the app is created — `createGlobalRateLimiter()` throws if it is not — so a process that starts has Redis. MySQL is pooled lazily, so a successful boot does **not** prove the database is reachable; that is what the health endpoint is for.

| Probe | Endpoint | Interpretation |
|---|---|---|
| readiness | `GET /api/v1/health` | `200` `status: "ok"` when MySQL **and** Redis answer; `503` `status: "degraded"`, `success: false` with the failing service named in `services` |
| liveness | TCP connect to `PORT` | the process accepts connections; there is no separate `/livez`, and the health check is dependency-bound, so **do not use it as a liveness probe** — a dead MySQL would restart a healthy process |

If a platform needs liveness separately, point it at the port rather than at `/api/v1/health`.

---

## 5. Logging and redaction

Logs are `console` output; there is no log pipeline yet.

Never logged, by design:

- session identifiers, the `leave.sid`/`leave.device`/`csrf-token` cookie values, CSRF tokens — the login flow no longer prints any of them; the `user_sessions` table is the record
- passwords, Argon2 hashes, the SMTP credential
- MySQL statement text: `errorHandler` logs `{ name, code, message (sqlMessage), route, stack }` rather than the raw error, because `err.sql` holds the fully interpolated statement including record values
- audit summaries: `recordAudit()` drops any key matching the secret pattern (`password`, `secret`, `token`, `hash`, `credential`) before the row is written

Always safe in logs: request method + path, permission-denied reasons, session-validation reason codes (`DEVICE_MISMATCH`, `EXPIRED`, `REVOKED`, …), migration names, startup banner (`NODE_ENV`, host, port, frontend origin).

PII to be aware of: `audit_events.summary` holds business values (record values, emails on user administration), and `user_sessions`/`audit_events` store IP addresses and user agents. Retention is currently unbounded — decide a purge window before real employee data enters the system.

---

## 6. Security posture to keep in mind operationally

| Control | Current setting |
|---|---|
| Session lifetime | 8 hours (`leave.sid`, `httpOnly`, `sameSite=lax`, `Secure` in production) |
| Device binding | `leave.device`, 1 year, `httpOnly`; a session is invalidated when the device credential does not match the bound user |
| Password policy | 8–128 chars, upper + lower + number + special, no spaces; Argon2id `memoryCost 65536, timeCost 3, parallelism 4` |
| Automatic invalidation | changing a password or disabling an account ends that account's sessions — `requireAuth` compares `authenticatedAt` with `password_changed_at` |
| Rate limits | global 300/15 min, login 100/15 min, sensitive 20/15 min per surface (`docs/API.md` §1) |
| Body size | 1 MB |
| CSRF | double-submit on every mutating request; the client retries once after a rejected token |
| Bootstrap admin | on a fresh install the **first successful login** is promoted to `super_admin`; later accounts get roles only by explicit assignment |
| Last administrator | the server refuses to demote or disable the last active administrator |

`npm run create-user` (interactive) creates an account with **no roles**; assign them through **Administration → Users** or `PUT /api/v1/authorization/users/:userId/roles`. `npm run reset-password -- <email> <new-password>` sets a password directly in the database and stamps `password_changed_at`, so that account's sessions close on its next request.

---

## 7. Release checklist

Copy this list into the release notes and tick it in order.

**Preparation**
- [ ] Branch/commit for the release is identified, and `git status` is clean
- [ ] `docs/PROJECT-GUIDE.md` and `docs/API.md` describe what actually ships (no stale claims)
- [ ] Any new endpoint is documented in `docs/API.md` with its permission and error codes
- [ ] Migration plan reviewed: is it additive, replay-safe, and does it need expand → migrate → contract?

**Build and static checks**
- [ ] `client/`: `npm run lint` passes with no errors
- [ ] `client/`: `npm run build` succeeds; note the bundle size (`… kB │ gzip: … kB`) and compare with the previous release
- [ ] `server/`: `node --check` on every changed file (or a boot against a scratch environment)

**Data**
- [ ] Backup taken, file verified, location recorded
- [ ] Migration rehearsed on a restored copy of that backup, not on the live schema
- [ ] Rollback choice written down (forward-fix or restore)

**Deploy**
- [ ] Environment variables present and validated: `FRONTEND_URL`, DB, Redis, `SESSION_SECRET`, `CSRF_SECRET`, and `ENCRYPTION_KEY` if secret settings are in use
- [ ] `npm run migrate` **before** starting the new code
- [ ] Application restarted
- [ ] `GET /api/v1/health` answers `200` with `mysql: "up"`, `redis: "up"`

**Post-release verification (in the deployed environment, with the QA account)**
- [ ] Sign in, `GET /api/v1/auth/me` returns the profile, roles shown as expected
- [ ] One read per surface: fields, dropdowns, forms, tables, mappings, records, organization, users, settings, audit
- [ ] One write per surface: create a record through a mapped form and see it in the list
- [ ] The new record's action appears in **Audit trail** with the right actor
- [ ] A manager/employee account is still refused admin mutations (`403 PERMISSION_DENIED`)
- [ ] `npm run test-api` passes, or the manual CSRF/session path it covers was exercised
- [ ] Server logs reviewed once for stack traces, and for any leaked session identifier or SQL text
- [ ] Settings → *Test mail server* only if SMTP is in scope for this release

**Sign-off**
- [ ] Acceptance recorded: who signed off, what was verified, what was knowingly deferred

---

## 8. Deliberately open

These are not oversights; each needs a decision from the people who own the product or the deployment.

| Item | Why it is open |
|---|---|
| Automated test suite | `docs/PROJECT-GUIDE.md` §8 allows a test runner only after the design **and the dependency change** are agreed. Today's verification is lint + build + `npm run test-api` against the live dev server |
| End-to-end test | same decision; also needs an environment policy for disposable data |
| Initial-route bundle | the production bundle is one ~502 kB (gzip ~142 kB) chunk. Route-level code splitting is available in Vite but changes first-paint behaviour, so it is a measured follow-up rather than an unverified blind edit |
| Multi-tenant boundary | if a deployment ever hosts more than one organization, every unique key, query and permission check needs an organization id. Deciding after real data exists is expensive (`PROJECT-GUIDE.md` §9.12) |
| Custom user profile attributes | `user_profile_values` exists and is **read** by the dropdown in-use guard, but nothing writes to it — there is no API or UI for custom profile fields. Build that only if admins actually need them (`PROJECT-GUIDE.md` §4.2) |
| `user_sessions.device_id` | kept deliberately while the device-cookie migration settles |
| Session cleanup job | not built yet; revoked rows accumulate in `user_sessions` |
| Client router duplication | both `react-router` and `react-router-dom` are listed in `client/package.json`; `react-router-dom@7` is what the code imports. Removing the duplicate needs a verified install, not a blind edit |
| Log pipeline / metrics | logging is `console`; no aggregation, retention or alerting is configured |
