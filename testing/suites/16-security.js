import { ApiClient } from "../lib/api.js";
import { buildMappedTable } from "../lib/fixtures.js";

/*
 * Everything in this suite is an attack a hostile client could actually send, and
 * the proof that the platform answers it as a client error rather than as a fault,
 * a leak, or a write. Nothing here tests a feature: it tests the four walls the
 * features are built inside — parameterized queries, escaped rendering, the
 * double-submit token, and the redaction of anything secret.
 *
 * Three rules this suite keeps:
 *
 *   - it never exhausts a rate-limit window on purpose. A 429 would make every
 *     later request in the run fail for a reason that has nothing to do with the
 *     product, so the budget is only read, never spent;
 *   - it signs in only as the configured E2E account and never touches a
 *     protected one;
 *   - every payload it stores carries the run tag, so a cleanup pass can find it.
 */

const SQL = {
  tautology: "' OR 1=1 --",
  union: "' UNION SELECT email, password_hash FROM users --",
  drop: "'; DROP TABLE field_definitions; --",
  stacked: "1; UPDATE users SET status = 'disabled' --",
};

const XSS = {
  // An attribute payload: it fires only if the label is interpolated into markup.
  attribute: `<img src=x onerror="window.__e2eXss = 'attribute'">`,
  // An element payload: it runs only if the value is written with innerHTML.
  element: `<script>window.__e2eXss = 'element'</script>`,
};

/*
 * Driver and stack internals that must never reach a client. A payload echoed
 * back inside the server's own message is fine — that is the data the caller
 * sent — but SQL text, driver codes or file paths are not.
 */
const INTERNALS =
  /ER_[A-Z_]{3,}|SQL syntax|mysql|You have an error in your SQL|Unknown column|near["' ]|node_modules|\bat Object\(|Traceback|sequelize|Sequelize/i;

const SECRET_KEYS = [
  "password",
  "passphrase",
  "passwordHash",
  "password_hash",
  "hash",
  "secret",
  "csrfToken",
  "csrf_token",
  "token",
  "accessToken",
  "refreshToken",
  "deviceToken",
  "sessionToken",
  "sessionId",
  "session_id",
  "privateKey",
  "apiKey",
  "api_key",
  "authorization",
  "cookie",
  "envelope",
];

const CREDENTIAL_SHAPES = [
  ["an Argon2 hash", /\$argon2[aidiymtde]+\$/i],
  ["a JSON web token", /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./],
  ["an AES-GCM envelope", /^[0-9a-f]{32}[:.][0-9a-f]{24,}[:.][0-9a-f]{16,}$/i],
  ["a bare hex secret", /^[0-9a-f]{40,}$/i],
];

const envelope = (response) => JSON.stringify(response.body ?? null).slice(0, 260);

/** A refusal has to be a 4xx in the standard envelope, with no internals in it. */
function expectRefusal(assert, response, label) {
  assert.ok(
    response.status >= 400 && response.status < 500,
    `${label} is refused as a client error (${response.status} ${envelope(response)})`
  );

  assert.eq(
    response.body?.success,
    false,
    `${label} answers with the standard failure envelope (${envelope(response)})`
  );

  assert.ok(
    !INTERNALS.test(envelope(response)),
    `${label} carries no server internals: ${envelope(response)}`
  );

  return response;
}

/*
 * Visits every leaf of a response body with the property name that held it. An
 * array element keeps its array's key, so a credential hidden inside a list is
 * still named by the property that carries it.
 */
function walk(value, visit, path = "", key = "") {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visit, `${path}[${index}]`, key));

    return;
  }

  if (typeof value === "object") {
    for (const [childKey, entry] of Object.entries(value)) {
      walk(entry, visit, path ? `${path}.${childKey}` : childKey, childKey);
    }

    return;
  }

  visit(key, value, path);
}

/** Every place a response carries something that should never have left the server. */
function findSecrets(body) {
  const found = [];

  walk(body, (key, value, path) => {
    if (SECRET_KEYS.includes(key) && value !== null && value !== "" && value !== false) {
      found.push(`${path || key}=${JSON.stringify(value)}`);
    }

    if (typeof value !== "string") return;

    for (const [name, shape] of CREDENTIAL_SHAPES) {
      if (shape.test(value.trim())) {
        found.push(`${path || key} looks like ${name}`);
      }
    }
  });

  return found;
}

/** The rendered text of the table body, read as textContent so CSS truncation cannot hide it. */
function rowText(driver) {
  return driver.executeScript(`
    return Array.from(document.querySelectorAll("table tbody tr"))
      .map((row) => row.textContent)
      .join(" ");
  `);
}

/** Polls the table body because a list re-fetches after navigation. */
async function rowTextContaining(driver, needle, timeout = 10000) {
  const limit = Date.now() + timeout;

  let text = "";

  while (Date.now() < limit) {
    text = await rowText(driver);

    if (text.includes(needle)) {
      return text;
    }

    await driver.sleep(250);
  }

  return text;
}

/** What the page would look like if a payload had been allowed to execute. */
function pageInertia(driver) {
  return driver.executeScript(`
    const root = document.getElementById("root") || document.body;

    return {
      fired: typeof window.__e2eXss === "undefined" ? null : window.__e2eXss,
      images: root.querySelectorAll('img[src="x"]').length,
      scripts: root.querySelectorAll("script").length,
    };
  `);
}

export default {
  name: "security",
  area: "Security — injection, scripting, forgery, secrets",

  async setup({ adminApi, isolate }) {
    const fixture = await buildMappedTable({
      adminApi,
      isolate,
      name: "Security",
      specs: [{ name: "notes", dataType: "text" }],
    });

    if (!fixture.columns?.length) {
      throw new Error("The security fixture has no column to write payloads into.");
    }

    return { fixture, columnKey: fixture.columns[0].columnKey };
  },

  tests: [
    {
      name: "an injection payload in a definition is stored as a value and executed as nothing",
      area: "Security — SQL injection",
      screen: "/admin/fields",
      fn: async ({ adminApi, assert, isolate }) => {
        const attempts = [
          { key: isolate.key("inject_union"), payload: SQL.union },
          { key: isolate.key("inject_drop"), payload: SQL.drop },
        ];

        for (const attempt of attempts) {
          const label = `${isolate.label("Injection")} ${attempt.payload}`;

          const stored = await adminApi.expectOk(
            adminApi.post("/admin/fields", { label, key: attempt.key, dataType: "text" }),
            `store ${attempt.payload} as a field label`
          );

          const read = await adminApi.expectOk(
            adminApi.get(`/admin/fields/${stored.id}`),
            "read the definition back"
          );

          assert.eq(
            read.label,
            label,
            "the payload returns byte for byte, so it was bound as a value and never parsed"
          );
        }

        expectRefusal(
          assert,
          await adminApi.post("/admin/fields", {
            label: isolate.label("Injection key"),
            key: SQL.tautology,
            dataType: "text",
          }),
          "an identifier carrying SQL"
        );

        const searched = await adminApi.expectOk(
          adminApi.get(`/admin/fields?search=${encodeURIComponent(SQL.tautology)}`),
          "search the definitions with a tautology"
        );

        assert.eq(
          (Array.isArray(searched) ? searched : []).length,
          0,
          `a tautology in the search box matches nothing instead of everything: ${JSON.stringify(
            (Array.isArray(searched) ? searched : []).map((row) => row.label)
          )}`
        );

        const after = await adminApi.get("/admin/fields?pageSize=1");

        assert.eq(after.status, 200, `the definitions table still answers: ${envelope(after)}`);
        assert.ok(
          Number(after.body?.meta?.total) > 0,
          `and it still holds its rows (${JSON.stringify(after.body?.meta)})`
        );
      },
    },
    {
      name: "the record query surface refuses a payload in every place one can be put",
      area: "Security — SQL injection",
      screen: "/records/:tableId",
      fn: async ({ adminApi, assert, fixture, columnKey }) => {
        const base = `/tables/${fixture.tableId}/records`;

        const attacks = [
          [
            "a filter on a column that is not a column key",
            `${base}?filters=${encodeURIComponent(
              JSON.stringify([{ column: `data${SQL.tautology}`, operator: "equals", value: "x" }])
            )}`,
          ],
          [
            "a filter operator that is not in the registry",
            `${base}?filters=${encodeURIComponent(
              JSON.stringify([{ column: columnKey, operator: `equals${SQL.tautology}`, value: "x" }])
            )}`,
          ],
          ["filters that are not a JSON array", `${base}?filters=${encodeURIComponent(SQL.drop)}`],
          [
            "a filter value written into the column slot",
            `${base}?filters=${encodeURIComponent(
              JSON.stringify([{ column: SQL.union, operator: "contains", value: "x" }])
            )}`,
          ],
          [
            "a sort term carrying a statement",
            `${base}?sort=${encodeURIComponent(`${columnKey}:asc${SQL.drop}`)}`,
          ],
          [
            "a sort key that is JSON path syntax",
            `${base}?sort=${encodeURIComponent("data->>'$.notes':asc")}`,
          ],
          [
            "more sort columns than the builder allows",
            `${base}?sort=${encodeURIComponent(
              `${columnKey}:asc,id:desc,created_at:asc,updated_at:desc`
            )}`,
          ],
          ["a page size beyond the maximum", `${base}?pageSize=100000`],
          ["a page that is not a page number", `${base}?page=${encodeURIComponent(SQL.tautology)}`],
          ["a negative page", `${base}?page=-1`],
        ];

        for (const [label, path] of attacks) {
          /*
           * Every one of these is stopped by a schema or by the query builder's
           * own allow-list, and both of those answer bad request. Nothing here
           * should reach the database at all.
           */
          const response = expectRefusal(assert, await adminApi.get(path), label);

          assert.eq(response.status, 400, `${label} answers bad request (${envelope(response)})`);
        }

        const stored = await adminApi.expectOk(
          adminApi.post(base, { values: { [columnKey]: SQL.stacked } }),
          "store a row whose text value is a statement"
        );

        const read = await adminApi.expectOk(
          adminApi.get(`${base}/${stored.id}`),
          "read that row back"
        );

        assert.eq(
          read.values?.[columnKey],
          SQL.stacked,
          "the value is kept as text, exactly as it was sent"
        );

        const filtered = await adminApi.expectOk(
          adminApi.get(
            `${base}?filters=${encodeURIComponent(
              JSON.stringify([{ column: columnKey, operator: "contains", value: "UPDATE users" }])
            )}`
          ),
          "filter the column with a real operator"
        );

        assert.ok(
          (Array.isArray(filtered) ? filtered : []).some((row) => Number(row.id) === Number(stored.id)),
          "a legitimate filter still finds the row, so the refusals above are about the payloads"
        );

        const me = await adminApi.get("/auth/me");

        assert.eq(me.status, 200, `the session survives the stacked statement (${envelope(me)})`);
        assert.eq(
          me.body?.user?.status,
          "active",
          "and the statement that would disable every account disabled none of them"
        );
      },
    },
    {
      name: "markup written through the API is shown as text and never runs",
      area: "Security — cross-site scripting",
      screen: "/admin/fields",
      fn: async ({ session, driver, adminApi, assert, isolate, fixture, columnKey }) => {
        const probeKey = isolate.key("xss_probe");

        await adminApi.expectOk(
          adminApi.post("/admin/fields", {
            label: `${isolate.label("XSS")} ${XSS.attribute}`,
            key: probeKey,
            dataType: "text",
          }),
          "store a field whose label is markup"
        );

        await adminApi.expectOk(
          adminApi.post(`/tables/${fixture.tableId}/records`, {
            values: { [columnKey]: XSS.element },
          }),
          "store a record whose value is markup"
        );

        await session.goto("/admin/fields");
        await session.setReactValue("Search fields", probeKey);

        const listed = await rowTextContaining(driver, "<img src=x");

        assert.includesText(
          listed,
          "<img src=x",
          "the label reaches the screen as the text it is"
        );

        const onFields = await pageInertia(driver);

        assert.eq(onFields.fired, null, "no handler ran while the definitions screen was open");
        assert.eq(onFields.images, 0, "and the payload built no element");

        await session.goto(`/records/${fixture.tableId}`);

        const values = await rowTextContaining(driver, "<script>");

        assert.includesText(
          values,
          "<script>",
          "the stored value reaches the record list as the text it is"
        );

        const onRecords = await pageInertia(driver);

        assert.eq(onRecords.fired, null, "no handler ran while the record list was open");
        assert.eq(onRecords.scripts, 0, "and no script node was added to the page");
      },
    },
    {
      name: "a mutation without its double-submit token is refused and writes nothing",
      area: "Security — request forgery",
      screen: "/admin/fields",
      fn: async ({ adminApi, assert, isolate, config }) => {
        const key = isolate.key("csrf_probe");
        const body = JSON.stringify({
          label: isolate.label("CSRF probe"),
          key,
          dataType: "text",
        });

        const send = async (headers) => {
          const response = await fetch(`${config.apiBaseUrl}/admin/fields`, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body,
          });

          return { status: response.status, body: await response.json().catch(() => null) };
        };

        const cookies = { cookie: adminApi.cookieHeader() };

        const missing = expectRefusal(
          assert,
          await send(cookies),
          "a create sent with the session cookie but no token header"
        );

        assert.eq(missing.status, 403, `the token gate answers 403 (${envelope(missing)})`);
        assert.includesText(missing.body?.message ?? "", "CSRF", "and says which gate refused");

        const forged = expectRefusal(
          assert,
          await send({ ...cookies, "x-csrf-token": "a-forged-token-value" }),
          "a create sent with a forged token"
        );

        assert.eq(forged.status, 403, `a forged token is refused the same way (${envelope(forged)})`);

        const searched = await adminApi.expectOk(
          adminApi.get(`/admin/fields?search=${encodeURIComponent(key)}`),
          "look for the field both attempts named"
        );

        assert.eq(
          (Array.isArray(searched) ? searched : []).length,
          0,
          `neither attempt created a field: ${JSON.stringify(
            (Array.isArray(searched) ? searched : []).map((row) => row.key)
          )}`
        );

        const readable = await adminApi.get("/admin/fields?pageSize=1");

        assert.eq(
          readable.status,
          200,
          `a read still needs no token (${envelope(readable)})`
        );
      },
    },
    {
      name: "an anonymous caller is refused by every administrative read",
      area: "Security — authentication",
      fn: async ({ assert }) => {
        const stranger = new ApiClient();

        const protectedPaths = [
          "/admin/fields",
          "/admin/forms",
          "/admin/tables",
          "/admin/users",
          "/admin/settings",
          "/admin/audit",
          "/organization/entity-types",
          "/authorization/permissions",
        ];

        for (const path of protectedPaths) {
          const response = await stranger.get(path);

          assert.eq(
            response.status,
            401,
            `${path} refuses an anonymous caller (${envelope(response)})`
          );
          assert.eq(
            response.body?.success,
            false,
            `${path} answers with the failure envelope (${envelope(response)})`
          );
          assert.ok(
            !/session|device.?token|sid/i.test(JSON.stringify(response.body ?? {})),
            `${path} tells an anonymous caller nothing about sessions: ${envelope(response)}`
          );
        }

        const me = await stranger.get("/auth/me");

        assert.eq(me.status, 401, `the account read is refused too (${envelope(me)})`);
      },
    },
    {
      name: "an identifier is checked as an identifier before it reaches a query",
      area: "Security — SQL injection",
      fn: async ({ adminApi, assert, fixture }) => {
        /*
         * Identifiers are parsed by a coercing schema before any query sees them,
         * so a value that is not a positive integer is answered as a bad request
         * by that schema rather than by the lookup it would have fed.
         */
        const notIdentifiers = [
          ["a table id that is not a number", `/tables/${encodeURIComponent("not-a-number")}/records`],
          ["a negative table id", "/tables/-1/records"],
          ["a zero table id", "/tables/0/records"],
          ["a table id carrying SQL", `/tables/${encodeURIComponent(`1${SQL.tautology}`)}/records`],
          ["a field id carrying SQL", `/admin/fields/${encodeURIComponent(`1${SQL.tautology}`)}`],
          [
            "a record id carrying SQL",
            `/tables/${fixture.tableId}/records/${encodeURIComponent(`1${SQL.drop}`)}`,
          ],
        ];

        for (const [label, path] of notIdentifiers) {
          const response = expectRefusal(assert, await adminApi.get(path), label);

          assert.eq(response.status, 400, `${label} answers bad request (${envelope(response)})`);
        }

        /*
         * A well-formed identifier that names nothing is a different refusal: the
         * schema accepts it and the lookup is what answers.
         */
        const missing = [
          ["a table that does not exist", "/tables/999999999/records"],
          ["a field that does not exist", "/admin/fields/999999999"],
          ["a record that does not exist", `/tables/${fixture.tableId}/records/999999999`],
        ];

        for (const [label, path] of missing) {
          const response = expectRefusal(assert, await adminApi.get(path), label);

          assert.eq(response.status, 404, `${label} answers not found (${envelope(response)})`);
        }

        const tables = await adminApi.expectOk(
          adminApi.get("/admin/tables?pageSize=200"),
          "list the tables"
        );

        const owned = (Array.isArray(tables) ? tables : []).find((row) => row.key === "users");

        assert.ok(owned, "the authentication-owned table is listed for an administrator");

        const refused = expectRefusal(
          assert,
          await adminApi.get(`/tables/${owned.id}/records`),
          "the generic record surface over the account table"
        );

        assert.eq(refused.status, 409, `the account table is not a record surface (${envelope(refused)})`);
        assert.includesText(
          refused.body?.message ?? "",
          "managed by a dedicated service",
          "and the refusal says why"
        );
      },
    },
    {
      name: "a body larger than the parser accepts is refused as a client error",
      area: "Security — abuse",
      fn: async ({ adminApi, assert, isolate }) => {
        /*
         * The JSON parser caps a body at 1mb and does so before the token gate and
         * before any schema runs, so the payload is sized past that cap on purpose:
         * the answer must come from the parser, not from a field's own maximum.
         */
        const refused = expectRefusal(
          assert,
          await adminApi.post("/admin/fields", {
            label: isolate.label("Oversized"),
            key: isolate.key("oversized"),
            dataType: "text",
            description: "A".repeat(1024 * 1024 + 64),
          }),
          "a request body past the size limit"
        );

        assert.eq(
          refused.status,
          413,
          `the parser answers with its own status rather than failing (${envelope(refused)})`
        );

        const after = await adminApi.get("/auth/me");

        assert.eq(after.status, 200, `the same session still works afterwards (${envelope(after)})`);

        const searched = await adminApi.expectOk(
          adminApi.get(`/admin/fields?search=${encodeURIComponent(isolate.key("oversized"))}`),
          "look for the oversized create"
        );

        assert.eq(
          (Array.isArray(searched) ? searched : []).length,
          0,
          "the refused body wrote nothing"
        );
      },
    },
    {
      name: "the request budget is declared on responses and this suite never spends it",
      area: "Security — abuse",
      fn: async ({ assert, config }) => {
        const response = await fetch(`${config.apiBaseUrl}/health`);

        const budget = response.headers.get("ratelimit") || "";
        const policy = response.headers.get("ratelimit-policy") || "";

        const remaining = Number((budget.match(/r=(\d+)/) || [])[1]);
        const reset = Number((budget.match(/t=(\d+)/) || [])[1]);
        const limit = Number((policy.match(/q=(\d+)/) || [])[1]);
        const window = Number((policy.match(/w=(\d+)/) || [])[1]);

        assert.ok(budget, `the response declares a budget (${JSON.stringify(budget)})`);
        assert.ok(policy, `and the window it belongs to (${JSON.stringify(policy)})`);

        /*
         * The numbers come from the server's own environment
         * (GLOBAL_RATE_LIMIT_MAX / GLOBAL_WINDOW_MS), so the suite checks that a
         * budget is declared and internally consistent rather than repeating a
         * limit that differs between installations.
         */
        assert.ok(Number.isInteger(limit) && limit > 0, `a positive request limit is declared (${policy})`);
        assert.ok(
          Number.isInteger(window) && window > 0,
          `a positive window in seconds is declared (${policy})`
        );
        assert.ok(
          remaining <= limit,
          `the remaining count cannot exceed the limit it belongs to (${budget})`
        );
        assert.ok(remaining > 0, `requests are left in this window (${budget})`);
        assert.ok(reset > 0 && reset <= window, `the reset time is inside the window (${budget})`);

        assert.ok(
          !response.headers.get("x-ratelimit-limit"),
          "the deprecated X-RateLimit headers are not sent"
        );

        const admin = await fetch(`${config.apiBaseUrl}/admin/fields?pageSize=1`);

        assert.ok(
          (admin.headers.get("ratelimit") || "").includes("r="),
          "an administrative read is counted against the same budget"
        );
      },
    },
    {
      name: "no read response carries a credential, a hash or a session identifier",
      area: "Security — secret handling",
      fn: async ({ adminApi, assert }) => {
        const reads = [
          ["the signed-in account", "/auth/me"],
          ["the account list", "/admin/users?pageSize=50"],
          ["the settings summary", "/admin/settings"],
          ["the mail transport", "/admin/settings/smtp"],
          ["the granted permissions", "/authorization/permissions"],
          ["the field definitions", "/admin/fields?pageSize=50"],
        ];

        for (const [label, path] of reads) {
          const response = await adminApi.get(path);

          assert.ok(
            response.status < 400,
            `${label} is readable by an administrator (${response.status} ${envelope(response)})`
          );

          const found = findSecrets(response.body);

          assert.eq(found.length, 0, `${label} keeps its secrets: ${found.join(" | ")}`);
        }

        const smtp = await adminApi.expectOk(
          adminApi.get("/admin/settings/smtp"),
          "read the mail transport"
        );

        assert.ok(
          !("password" in smtp),
          `the mail transport has no password slot at all: ${JSON.stringify(Object.keys(smtp))}`
        );
        assert.eq(
          typeof smtp.passwordConfigured,
          "boolean",
          "and it reports only whether a credential is stored"
        );
      },
    },
  ],
};
