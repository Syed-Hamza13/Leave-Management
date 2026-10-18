# End-to-end test suite

Selenium drives a real Chrome window against the running application: it signs in,
clicks through the sidebar, opens the dialogs, submits the forms and reads back what
the screen actually shows. Every assertion is made against the rendered page or the
API response, so a green run means the product behaved, not that a mock agreed with
itself.

The suite is a reader of this system, never a second copy of it. It builds no
containers, starts no servers and uses no test doubles.

## What has to be true before a run

| Requirement | Checked by |
| --- | --- |
| API answering on `http://localhost:4000/api/v1` — the server you already run | `run.js` fails immediately if `/health` is not 200 |
| Web app answering on `http://localhost:5173` — the Vite dev server you already run | `run.js` fails immediately if the root URL is not 200 |
| MySQL and Redis reachable from that server | surfaced as failed sign-in or a 5xx in the report |
| Migrations applied through 008 | the fields/tables/organization suites cannot create definitions |
| Google Chrome installed | Selenium Manager downloads a matching chromedriver on the first run, so that first run needs network access once |

Nothing here launches an isolated server on another port. If the app is not already
up, the run says so and stops.

## First-time setup

```bash
cd testing
npm install
cp .env.example .env      # then fill in E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD
npm run setup
```

`npm run setup` creates the two accounts the suite owns — the administrator that
performs every configuration flow and the limited account used only to prove the
permission wall holds — and gives each one the role named by `E2E_ADMIN_ROLE`
(default `super_admin`) and `E2E_LIMITED_ROLE` (default `employee`). Re-running it is
normal: it resets those two passwords and marks those two accounts active, and prints
the list of accounts it will never touch.

`.env` is git-ignored. Never commit a real password into it, and never point it at an
account listed in `E2E_PROTECTED_EMAILS`.

## Running

```bash
npm test                        # every suite, visible browser window
npm run smoke                   # the three checks that only prove the harness and shell work
npm test -- --suite fields      # one suite; comma-separated names are matched as substrings
npm test -- --suite fields,records
npm test -- --test "duplicate"  # one test by name, across all suites
npm run headless                # same run with no window (CI, or when you want to work alongside it)
```

Useful extra flags, appended after `--`:

- `--keep-open` leaves the browser open after the run so a failure can be inspected
  in the window that produced it.
- `E2E_SLOW_MO=400` in `.env` pauses between UI steps, which makes a run watchable by
  a human.
- `--base-url http://localhost:5174` points the browser somewhere else; the API comes
  from `E2E_API_URL`.
- `--run-id 261018120345` fixes the isolation tag instead of generating one, which is
  how a run is re-created or cleaned up deliberately.

Exit code is `0` when everything passed, `1` when a test failed, `2` when the suite
could not run at all (server down, `.env` incomplete, browser missing).

## Reading a run

Reports are written to `testing/reports/` (git-ignored, so a run leaves no trace in
the repository):

- `run-<stamp>.md` — the human report, also copied to `LATEST.md`
- `run-<stamp>.json` — the same data structured, also copied to `LATEST.json`
- `LATEST.txt` — one line: totals and duration
- `reports/artifacts/` — the screenshot taken at every UI step and at every failure

A failure entry answers the four questions needed to locate a defect:

```
### Administration — logical tables — 1 failing test(s)
- **tables → a table keeps the columns it was created with**
  - Screen: `/admin/tables`
  - Failed at step: _open /admin/tables_
  - Error: `AssertionError` — column list: expected 3, got 2
  - Failing API calls in this test:
    - `GET /api/v1/admin/tables/41/columns` → **500** :: {"error":{"code":"INTERNAL"}}
  - Browser JS errors:
    - Cannot read properties of undefined (reading 'map') _(step: open /admin/tables)_
  - Screenshot: `artifacts/tables-failure-….png`
  - Steps run: sign in → open /admin/tables → …
```

`area` is the part of the system, `screen` is the route, `Failed at step` is the last
UI action the harness performed, and the API/JS lines name the request and the
function that blew up. Failures are grouped by area at the top of the report, so a
backend fault and a selector fault are separated before any test is re-read.

A test can also be `skipped`: the navigation suite's two permission-wall tests declare
`requires: ["limited"]`, so they skip themselves when no limited account is configured
rather than passing by accident.

## Cleaning up afterwards

Everything a run creates — definitions, mappings, columns, records, entities, test
accounts — carries the run tag in both its label and its key, for example
`Resilience E2E261018120345`. That tag is what cleanup searches for and nothing else.

```bash
npm run cleanup                     # report only: counts what a tagged run left behind
npm run cleanup:apply               # delete it
npm run cleanup -- --run-id 261018120345   # only that run's rows
```

Cleanup deletes children before parents, so no foreign key has to be disabled, and it
stops at the tag: audit events stay (they are the evidence of what was tested), the
seeded `users` table is untouched, and the developer's own account plus every
`E2E_PROTECTED_EMAILS` address is excluded from both the report and the delete. It
prints what it found before changing anything, so an unexpected count is discoverable
while it is still recoverable.

## Suites

| Suite | Tests | Covers |
| --- | --- | --- |
| `smoke` | 3 | the harness itself, then the shell and a signed-in home |
| `auth` | 10 | sign-in, wrong credentials, logout, session and CSRF cookies, guards |
| `navigation` | 8 | sidebar reachability and the active state of every section |
| `fields` | 8 | field definitions: create, edit, reuse across forms, refusal on a duplicate key |
| `dropdowns` | 6 | option sets and their appearance as a field type |
| `forms` | 7 | form builder, reordering, submit and cancel |
| `tables` | 6 | logical tables and their columns, including the seeded `users` table's restrictions |
| `mappings` | 5 | field-to-column mapping and its validation |
| `records` | 10 | entering, editing, searching, filtering and sorting stored rows |
| `organization` | 10 | entity types, their sections and the entities inside them |
| `users` | 11 | account lifecycle, roles, password reset, sign-in state |
| `settings` | 9 | the SMTP card, its validation and who may reach it |
| `audit` | 9 | who changed what, and what was deliberately kept out of the log |
| `vertical slice` | 7 | one flow end to end: definition → form → mapping → record → audit |
| `data types` | 12 | every storage type through both the UI and the API, plus relations |
| `resilience` | 8 | pending, duplicate-submit, server refusal, empty and no-match states, a session lost mid-task |
| `security` | 9 | injection payloads, markup rendered as text, forgery, oversized bodies, credential leakage |

`security` is registered last on purpose: it sends hostile payloads, so it is kept
away from the suites that still need a clean rate-limit budget and untouched
definitions.

## Rules the suite holds itself to

- **Protected accounts are off-limits.** If the configured admin turns out to be in
  `E2E_PROTECTED_EMAILS`, the run refuses to start.
- **Rate limit is budgeted, not fought.** Before each suite the harness reads `RateLimit: r=…` and waits for the
  window rather than running into 429s that would look like product failures. The budget itself is whatever the
  server declares in its headers: `server/.env` may raise `GLOBAL_RATE_LIMIT_MAX` far above the shipped default, so
  the `security` suite asserts that a response announces an integer limit, a remaining count inside it and a reset
  inside the window — never a hard-coded 300.
- **Nothing is logged that shouldn't be.** Responses are recorded for the report, and
  the security suite asserts that no read response carries a password, token, session
  id or device id — the same rule the server's logging follows.
- **Assertions are made about the product, not the harness.** A test that could pass
  because a skeleton row or a stale element satisfied it is a bug in the test: lists
  page at 25 and sort alphabetically, so a test searches for its own row; while a list
  is fetching the table already holds five placeholder rows, so a row is waited for by
  its cells, never by its count.
- **Wait for the screen, not for the page.** `waitForApp()` only proves the shell is up:
  while `RequirePermission` is checking the route, `main` holds "Checking access…" and
  the sidebar already carries every nav label. `session.waitForMainText(needle)` polls
  `main` alone, and `session.textsOf(locator)` reads each element in its own try/catch
  because a toast unmounts while it is being listed.
- **A React input changes only through a React event.** `fill(id, "")` is `clear()` plus
  `sendKeys("")`, which commits nothing, so a debounced `SearchInput` keeps its last
  term. Clear or replace a controlled field with `session.setReactValue(id, value)`,
  which sets `value` through the native descriptor and dispatches an `input` event.

## Adding a test

A suite is one default export:

```js
export default {
  name: "tables",
  area: "Administration — logical tables",
  setup: async (ctx) => ({ fixture }),   // optional: build API fixtures once for the suite
  tests: [
    {
      name: "a table keeps the columns it was created with",
      screen: "/admin/tables",     // appears in the report
      requires: ["limited"],       // optional: skip this test when no limited account exists
      fn: async ({ session, api, assert, config, isolate, fixture }) => {
        await session.goto("/admin/tables");
        await session.waitRow(fixture.tableName);

        // rowCells returns null when the row is not on this page — assert that first.
        const cells = await session.rowCells(fixture.tableName);

        assert.ok(cells, `no row for ${fixture.tableName}`);
        assert.includesText(cells.join(" "), "notes", "the column is listed");
      },
    },
  ],
};
```

`ctx` carries `session` (the browser: `goto`, `clickButton`, `fill`, `setReactValue`,
`openDialog`, `submitDialog`, `expectToast`, `waitForRows`, `waitForMainText`,
`textsOf`, `visibleErrors`, `settleAuth`, `rowText`/`columnHeaderIndex`,
`deleteCookie`), `api`/`adminApi`/`limitedApi` (the
cookie-jar HTTP client), `assert` (`ok`, `eq`, `includesText`), `isolate` (`label`,
`key`, `email` — always used for anything created) and whatever `setup()` returned.
Add the file to `suites/index.js` and it is picked up by the filters and the report.
