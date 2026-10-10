# Leave Management - Project Guide

**Guide date:** 10 October 2026  
**Scope:** Current tracked project files and the behavior implemented in this repository.  
**Important:** This document describes the current state; it does not claim that planned leave-management features already exist.

## 1. Quick summary

This repository is an early foundation for a leave-management application:

- **Server:** Express API with environment validation, MySQL access, Redis-backed sessions and rate limiting, CSRF protection, health checks, and basic login/session endpoints.
- **Client:** React + Vite starter. `App.jsx` contains a static placeholder component, but its HTML entry file is empty, so the app currently has no working browser mount point; its router file is empty too.
- **Database:** One SQL schema exists, for the `users` table. There are no leave requests, departments, roles, approvals, holidays, or audit tables yet.
- **Current implemented features:** health check, CSRF-token issuance, login, current-user lookup, logout, and a command-line user creator.
- **Not implemented yet:** leave application and approval workflows, user-management screens, frontend authentication flow, authorization roles/permissions, and a database migration system.

So the project is a useful **authentication and infrastructure starting point**, not yet a complete leave-management product.

## 2. Current repository structure

```text
Leave-Management/
|-- README.md
|-- LICENSE
|-- folder structure.cmd
|-- docs/
|   `-- PROJECT-GUIDE.md
|-- client/
|   |-- index.html
|   |-- package.json
|   |-- package-lock.json
|   |-- vite.config.js
|   |-- eslint.config.js
|   |-- README.md
|   |-- .gitignore
|   |-- public/
|   |   |-- favicon.svg
|   |   `-- icons.svg
|   `-- src/
|       |-- main.jsx
|       |-- app/
|       |   |-- App.jsx
|       |   |-- App.css
|       |   `-- router.jsx
|       |-- services/
|       |   `-- api.js
|       |-- styles/
|       |   `-- index.css
|       `-- assets/
|           |-- hero.png
|           |-- react.svg
|           `-- vite.svg
`-- server/
    |-- package.json
    |-- package-lock.json
    |-- .env.example
    |-- .gitignore
    |-- sql/
    |   `-- 001_auth.sql
    |-- scripts/
    |   |-- create-user.js
    |   `-- test-api.js
    `-- src/
        |-- server.js
        |-- app.js
        |-- config/
        |   |-- env.js
        |   |-- database.js
        |   |-- redis.js
        |   `-- session.js
        |-- middleware/
        |   |-- csrf.js
        |   |-- errorHandler.js
        |   |-- notFound.js
        |   |-- rateLimiter.js
        |   `-- requireAuth.js
        `-- modules/
            |-- auth/
            |   |-- auth.routes.js
            |   |-- auth.controller.js
            |   |-- auth.service.js
            |   |-- auth.repository.js
            |   `-- auth.validation.js
            |-- health/
            |   |-- health.routes.js
            |   |-- health.controller.js
            |   `-- health.service.js
            `-- security/
                `-- security.routes.js
```

`node_modules/`, local environment files, and build output are not source files and are excluded by the respective `.gitignore` files. The two `package-lock.json` files lock each application's installed dependency tree.

## 3. Server: architecture and request lifecycle

### 3.1 Startup sequence

1. `server/src/server.js` loads `.env` values through `dotenv/config`.
2. Importing `config/env.js` validates the required configuration with Zod. Invalid/missing values stop the process.
3. `connectRedis()` connects to Redis. The server does not proceed if this connection fails.
4. `createApp()` builds the Express app and registers middleware and routes.
5. Express listens on the configured `HOST` and `PORT` (defaults: `0.0.0.0:4000`).

Redis is therefore required for the server to start. MySQL is configured as a pool but is not pinged during startup; it is checked by the health endpoint and when an authentication query is made.

### 3.2 Express middleware and route order

`server/src/app.js` registers the request pipeline in this order:

1. Disable the `X-Powered-By` header.
2. Add Helmet security headers.
3. Configure CORS for the single `FRONTEND_URL`, with credentials enabled.
4. Parse JSON (up to 1 MB) and URL-encoded request bodies.
5. Parse cookies, then attach the Redis-backed session.
6. Apply the global Redis-backed rate limiter (300 requests per 15 minutes).
7. Mount health, security, and auth routes under `/api/v1`.
8. Apply the general CSRF-protection middleware for requests that continue past those routes. Login/logout also install CSRF protection explicitly on their routes.
9. Return a JSON 404 for unmatched routes, then pass errors to the central error handler.

Middleware order matters: for example, session middleware must run before a route reads `req.session`, and Redis must be ready before rate-limiter instances are created.

### 3.3 Login and session data flow

```text
Browser/client
  | GET /api/v1/security/csrf
  v
Express -> session middleware -> security route
  | saves anonymous session in Redis
  | returns CSRF token and cookies
  v
Browser stores leave.sid cookie and sends token in X-CSRF-Token
  | POST /api/v1/auth/login { email, password }
  v
auth route -> login limiter -> CSRF check -> controller
  -> Zod validation -> regenerate session -> auth service
  -> repository SELECT from MySQL -> Argon2 password verification
  -> update last_login_at -> set session.user.id -> save session in Redis
  v
JSON user response + authenticated session cookie
```

The authenticated session stores only the user ID (`session.user.id`); profile fields are fetched from MySQL by `/auth/me`. The controller regenerates the session before checking the password, so even an unsuccessful login attempt replaces the prior anonymous session. After successful login the session ID changes, so clients should fetch a fresh CSRF token before a later CSRF-protected request such as logout.

#### Current API endpoints

| Method | Path | Purpose | Main behavior |
|---|---|---|---|
| `GET` | `/api/v1/health` | Dependency health | Pings MySQL and Redis; returns HTTP 200 when both are up, otherwise 503. |
| `GET` | `/api/v1/security/csrf` | Start/refresh CSRF context | Saves an anonymous session and returns a CSRF token. |
| `POST` | `/api/v1/auth/login` | Sign in | Requires CSRF token; validates input; verifies active user and Argon2 hash; establishes session. |
| `GET` | `/api/v1/auth/me` | Get signed-in user | Requires a session user ID; loads the current active user from MySQL. |
| `POST` | `/api/v1/auth/logout` | Sign out | Requires CSRF and authentication; destroys the server-side session and clears `leave.sid`. |

### 3.4 How data is stored

`server/sql/001_auth.sql` creates one table, `users`:

- `id`: auto-increment unsigned integer primary key.
- `email`: required and unique.
- `password_hash`: required Argon2 hash; plaintext passwords should not be stored.
- `first_name`, `last_name`, `status`: profile and account status (`active` by default).
- `last_login_at`, `password_changed_at`, `created_at`, `updated_at`: timestamps.
- `idx_users_status`: index for status lookups.

The SQL file must currently be applied manually to the configured MySQL database. No migration runner or schema version table is present.

Redis stores Express sessions with the `leave-session:` prefix. Rate limiting also uses Redis, so the service is being used for more than just session persistence. The Redis connection settings come from environment variables.

### 3.5 Server file-by-file guide

#### Entrypoints and app wiring

- `server/src/server.js` - Loads environment values, connects Redis, creates the Express app, and starts listening. Startup failures are logged and terminate the process.
- `server/src/app.js` - Central Express composition point: security/CORS/body/session/rate-limit middleware, API mounting, not-found and error handling.

#### Configuration

- `server/src/config/env.js` - Zod schema and validation for runtime configuration. Defaults are provided for environment, host, ports, and Redis password; frontend URL, database/Redis hosts and credentials, and a 32-character session secret are required.
- `server/src/config/database.js` - Creates a MySQL connection pool and exports a ping helper. Auth repository functions use this pool.
- `server/src/config/redis.js` - Creates the Redis client, registers connection-state logging, and exports connect/ping helpers.
- `server/src/config/session.js` - Configures Express sessions to use Redis, names the cookie `leave.sid`, sets an eight-hour lifetime, and enables secure cookies in production.

#### Middleware

- `server/src/middleware/csrf.js` - Configures `csrf-csrf`; the request token is read from `X-CSRF-Token`. The CSRF cookie is readable by JavaScript, while the session cookie is HttpOnly.
- `server/src/middleware/errorHandler.js` - Logs errors and returns JSON. It avoids writing a second response if headers have already been sent and hides details for status 500.
- `server/src/middleware/notFound.js` - Returns JSON 404 including the requested method and URL.
- `server/src/middleware/rateLimiter.js` - Creates global and login-specific rate limiters backed by Redis. Login limit: 100 attempts per 15 minutes.
- `server/src/middleware/requireAuth.js` - Allows a request through only when `req.session.user.id` exists; otherwise returns 401.

#### Auth module

- `server/src/modules/auth/auth.routes.js` - Declares login, logout, and `/me` routes and attaches the relevant login limiter, CSRF check, and auth guard.
- `server/src/modules/auth/auth.controller.js` - HTTP boundary. Parses login input, manages session regeneration/save/destroy, calls the service, and shapes JSON responses.
- `server/src/modules/auth/auth.service.js` - Authentication rules: lowercases email, checks active status, verifies Argon2 password hashes, updates last login, and returns a sanitized user object.
- `server/src/modules/auth/auth.repository.js` - MySQL queries for finding users by email/ID and updating last-login time. Uses placeholders for query values.
- `server/src/modules/auth/auth.validation.js` - Zod login input schema: trimmed valid email (maximum 255 chars) and non-empty password (maximum 128 chars).

#### Health and security modules

- `server/src/modules/health/health.routes.js` - Maps `GET /` on the health router to its controller.
- `server/src/modules/health/health.controller.js` - Converts health status to the HTTP response and chooses 200 or 503.
- `server/src/modules/health/health.service.js` - Pings MySQL and Redis independently and reports each as up/down plus an overall status and timestamp.
- `server/src/modules/security/security.routes.js` - Implements `GET /csrf`; persists an anonymous session before generating and returning the CSRF token.

#### Database and operational scripts

- `server/sql/001_auth.sql` - Initial `users` table definition. It is not automatically executed.
- `server/scripts/create-user.js` - Interactive command-line utility to create a user and hash their password with Argon2id.
- `server/scripts/test-api.js` - Small end-to-end API test runner. Maintains a cookie jar and tests health, CSRF, login, `/me`, logout, and `/me` after logout. It needs `TEST_EMAIL` and `TEST_PASSWORD` in the local environment for authenticated checks.
- `server/package.json` - Server scripts and runtime dependencies. `dev` starts nodemon, `start` runs Node, `create-user` runs the user utility, and `test-api` runs the API script.
- `server/package-lock.json` - Exact resolved server dependency versions; normally updated by npm when dependency manifests change.
- `server/.env.example` - Names and example values for required server configuration. Copy to a local `.env` and replace placeholders; do not commit real credentials.
- `server/.gitignore` - Excludes dependency folders, environment files (except the example), logs, coverage, and build output.

## 4. Client: current behavior and connection to the server

### Current browser/API flow

- Vite serves the client on port 5173.
- `client/vite.config.js` proxies requests beginning with `/api` to `http://localhost:4000` during development.
- `client/src/services/api.js` sends requests to `/api/v1...` with `credentials: "include"` so browser cookies can travel with requests. It expects a JSON response and throws an `Error` when the response is not successful.
- `client/src/main.jsx` is intended to mount `App` into the HTML element with ID `root`.
- `client/src/app/App.jsx` currently returns only a centered heading and “Application foundation is running.”

At present, the `api.js` helper is not used by `App.jsx`; there is no implemented login form, CSRF-token fetching flow, session state, or API-driven page.

### Client file-by-file guide

- `client/index.html` - Vite's HTML entry point. **Currently empty (0 bytes)**, so it has no `#root` element or module script to load React.
- `client/src/main.jsx` - Imports React's `createRoot`, `App`, and global CSS, then tries to mount the app at `#root`.
- `client/src/app/App.jsx` - Minimal static placeholder component; no application screens or leave features. The component is not currently mounted because the HTML entry file is empty.
- `client/src/app/router.jsx` - **Currently empty (0 bytes)** and not imported by `main.jsx`; no client-side routing is in use.
- `client/src/app/App.css` - Starter/template CSS selectors for a sample landing page. `App.jsx` does not import it, so these styles currently have no effect.
- `client/src/styles/index.css` - Imports Tailwind CSS and sets basic page/root sizing and body margin.
- `client/src/services/api.js` - Shared fetch helper for the backend API; includes cookies, JSON content type, and basic HTTP error handling, but does not yet manage CSRF tokens.
- `client/src/assets/hero.png` - Static image asset (layered abstract graphic); no current import/use in `App.jsx`.
- `client/src/assets/react.svg`, `client/src/assets/vite.svg` - Starter logos; no current import/use in `App.jsx`.
- `client/public/favicon.svg` - Browser favicon asset.
- `client/public/icons.svg` - SVG symbol collection (social/documentation-style icons); not currently referenced by the placeholder app.
- `client/vite.config.js` - Enables React and Tailwind Vite plugins and configures the dev server/proxy.
- `client/eslint.config.js` - ESLint configuration for JavaScript/JSX, React Hooks, React Refresh, and browser globals.
- `client/package.json` - Client scripts (`dev`, `build`, `lint`, `preview`) and React/Vite/Tailwind dependencies.
- `client/package-lock.json` - Exact resolved client dependency versions.
- `client/README.md` - Still the generic React/Vite starter README; it does not explain this application's actual setup or features.
- `client/.gitignore` - Excludes dependencies, local environment files, build output, logs, and coverage.

## 5. Root-level files

- `README.md` - Currently only contains the project title; it does not provide setup or architecture guidance.
- `LICENSE` - Repository license file.
- `folder structure.cmd` - Windows command script intended to create a starter directory/file layout. It does not represent the current implemented architecture exactly.
- `docs/PROJECT-GUIDE.md` - This guide.

**Caution about `folder structure.cmd`:** it uses `type nul > file` for a number of files. That redirection creates an empty file and can truncate an existing file if the script is run again. It also includes `server/.env` among the target paths. Do not rerun it in its current form without first changing it to safely create only missing files and protecting local secrets.

## 6. Current gaps and flaws to plan around

These are observations about the current code, not changes made by this guide.

### Priority 0 - Client cannot currently boot as an app

`client/index.html` is empty, while `main.jsx` requires an element with `id="root"` and a script that loads the React entry point. As-is, there is no HTML mount point or module entry to render the UI. `router.jsx` is also empty and unused. Restore a valid Vite HTML entry first, then decide whether routing is needed.

### Priority 1 - Login input validation errors can become HTTP 500

`auth.controller.js` calls `loginSchema.parse()`. A Zod validation exception reaches `errorHandler.js`, which only reads `err.statusCode`; validation errors do not get translated to a client-facing 400 response here, so malformed login input can be reported as an internal server error. Add an explicit validation-error mapping and test invalid email/password cases.

### Priority 1 - Frontend and backend security flow are not connected

The server requires a CSRF token for login/logout, and successful login regenerates the session. The frontend API helper includes cookies but does not fetch or attach `X-CSRF-Token`; the current UI does not call the helper at all. Implement and test the complete CSRF-cookie/session/login/logout lifecycle before building authenticated screens.

### Priority 1 - User creation and login validation are not fully consistent

The CLI creator enforces a minimum password length of 8, while login accepts at most 128 characters. The creator does not enforce that same maximum, so it can create a password that the login endpoint later rejects. The creator also has less input validation than the API schema. Share or align these rules and add tests.

### Priority 2 - Error responses and API helper assumptions need hardening

The client helper always calls `response.json()`. A non-JSON response (for example, a proxy/server error page) will throw a parsing error before the helper can report a useful API error. Consider safe content-type-aware parsing and a consistent API error shape.

### Priority 2 - Operational/schema lifecycle is manual

There is one SQL file but no migration/rollback mechanism, startup DB readiness check, or documented environment setup at the repository root. Schema changes will need a repeatable migration approach before multiple environments or contributors are involved.

### Priority 2 - Account-management boundaries are still minimal

There is no role/permission model, account administration API, password reset/change flow, account lockout policy, leave-related schema, or audit trail. `status` is checked for active users, but there is no workflow in this repository to manage status or permissions.

### Priority 3 - Project documentation and setup script are stale

Root README is only a title, client README is template text, and the structure script can truncate files. Replace these with accurate setup instructions and make the script safe or retire it.

## 7. Suggested next implementation order

1. **Make the app start:** fill in `client/index.html` with the Vite module entry and `#root`; verify the client build and browser render.
2. **Document local setup:** explain MySQL/Redis prerequisites, `.env` creation, manual schema application, server/client startup, and user creation.
3. **Fix API contracts:** map Zod errors to 400 and add validation/error-shape tests; align CLI and login password rules.
4. **Wire authentication end to end:** implement CSRF token acquisition, login, `/me`, logout, loading/error states, and session refresh behavior in the client.
5. **Define the product domain:** decide roles and permissions, leave request states, approvers, leave types/balances, holidays, and audit requirements before adding tables/endpoints.
6. **Add durable schema management and tests:** introduce migrations and tests for authorization, failure paths, and leave workflows as those features are implemented.

## 8. Local run outline

From `server/`:

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`, then configure MySQL, Redis, frontend URL, and a strong session secret.
3. Apply `sql/001_auth.sql` to the configured MySQL database.
4. Create a user with `npm run create-user`.
5. Start the API with `npm run dev`.

From `client/`, install dependencies and run `npm run dev`. The Vite proxy forwards `/api` requests to the local server. **The client entry file is currently empty, so restore it before expecting the React UI to render.**

To run the API script, start the server and provide `TEST_EMAIL` and `TEST_PASSWORD` locally, then run `npm run test-api` from `server/`. It is an integration-style script, not a unit-test suite, and authenticated cases depend on a valid test user.

## 9. Key takeaways

- The backend currently has a clear separation of routes, controllers, services, repositories, config, and middleware.
- The implemented backend domain is authentication/health only; leave-management behavior is still future work.
- MySQL is the source for user records; Redis stores sessions and rate-limit state.
- The frontend is not yet connected to backend behavior and currently has empty boot/router placeholders.
- The safest next step is to repair and verify the client entry, then align API validation and CSRF behavior before expanding product features.
