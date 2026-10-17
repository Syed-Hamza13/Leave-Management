import { By, until } from "selenium-webdriver";

import { ApiClient } from "../lib/api.js";

/*
 * The trail is the only place that says who changed what, so this suite checks it
 * from both ends: that a write made during this run is really in it, findable by the
 * filters a person would use, and that nothing secret was written into it on the way.
 *
 * The audit filter row refetches on every keystroke, so filter values are set with
 * one input event each instead of being typed character by character.
 */

const PASSWORD = "E2eAudit!2026";

const today = () => new Date().toISOString().slice(0, 10);

/** Every cell of one column, in the order the rows are listed. */
async function columnValues(session, column) {
  const index = await session.columnHeaderIndex(column);

  if (index === null) {
    return [];
  }

  const rows = await session.driver.findElements(By.css("table tbody tr"));
  const values = [];

  for (const row of rows) {
    const cells = await row.findElements(By.css("td"));
    const cell = cells[index];

    values.push(cell ? (await cell.getText()).replace(/\s+/g, " ").trim() : "");
  }

  return values;
}

function walk(object, visit, path = "") {
  if (object === null || object === undefined) return;

  if (Array.isArray(object)) {
    object.forEach((entry, index) => walk(entry, visit, `${path}[${index}]`));

    return;
  }

  if (typeof object === "object") {
    for (const [key, value] of Object.entries(object)) {
      visit(key, value, path);
      walk(value, visit, `${path}.${key}`);
    }

    return;
  }

  visit(path.split(".").pop(), object, path);
}

async function filterBy(session, filters) {
  for (const [id, value] of Object.entries(filters)) {
    await session.setReactValue(id, value);
    await session.driver.sleep(900);
  }

  await session.waitForRows();
}

export default {
  name: "audit",
  area: "Audit — who changed what, and what was kept out",
  async setup({ adminApi, isolate, config }) {
    const field = await adminApi.expectOk(
      adminApi.post("/admin/fields", {
        label: isolate.label("Audit probe"),
        key: isolate.key("audit_probe"),
        dataType: "text",
      }),
      "create a definition whose audit row the suite can look for"
    );

    const employee = await adminApi.expectOk(
      adminApi.post("/admin/users", {
        email: isolate.email("audited"),
        firstName: "Junaid",
        lastName: "Ali",
        password: PASSWORD,
        roleKeys: ["employee"],
      }),
      "create the account used for the audit permission gate"
    );

    if (config.protectedEmails.includes(employee.email)) {
      throw new Error(`Refusing to mutate a protected account (${employee.email}).`);
    }

    return { field, employee };
  },
  tests: [
    {
      name: "the trail lists actions newest first with object, actor and details",
      screen: "/admin/audit",
      fn: async ({ session, assert }) => {
        await session.goto("/admin/audit");
        await session.waitHeading("Audit trail");
        await session.waitForRows();

        for (const header of ["When (UTC)", "Action", "Object", "Actor", "Details"]) {
          assert.ok(
            (await session.columnHeaderIndex(header)) !== null,
            `the trail has a "${header}" column`
          );
        }

        const stamps = await columnValues(session, "When (UTC)");

        assert.ok(stamps.length >= 2, `the trail carries ${stamps.length} rows`);

        const ordered = [...stamps].sort((a, b) => (a < b ? 1 : -1));

        assert.eq(
          stamps.join("|"),
          ordered.join("|"),
          `the newest action is on top (${stamps.slice(0, 3).join(" | ")})`
        );

        const main = await session.text(By.css("main"));

        assert.includesText(main, "Showing every recorded action", "an unfiltered trail says so");
      },
    },
    {
      name: "filtering by an action leaves only that action",
      screen: "/admin/audit",
      fn: async ({ session, assert }) => {
        await session.goto("/admin/audit");
        await filterBy(session, { "audit-action": "field.create" });

        const actions = await columnValues(session, "Action");

        assert.ok(actions.length > 0, "the action has rows in the trail");
        assert.eq(
          actions.filter((action) => action !== "field.create").length,
          0,
          `only that action is listed: ${actions.join(" | ")}`
        );

        const main = await session.text(By.css("main"));

        assert.includesText(main, "1 filter applied", "the screen counts the filter it is under");
      },
    },
    {
      name: "the write this run made is in the trail, findable by its own object id",
      screen: "/admin/audit",
      fn: async ({ session, assert, adminApi, field, adminUser }) => {
        await session.goto("/admin/audit");
        await filterBy(session, {
          "audit-action": "field.create",
          "audit-entity-type": "field",
          "audit-entity-id": String(field.id),
        });

        const rows = await session.driver.findElements(By.css("table tbody tr"));

        assert.eq(rows.length, 1, "exactly one row matches the action, object type and id");

        assert.eq(
          await session.rowCells(`#${field.id}`, { column: "Object" }),
          `field #${field.id}`,
          "the object column names the type and the id"
        );

        assert.eq(
          await session.rowCells(`#${field.id}`, { column: "Actor" }),
          adminUser.email,
          "the actor column names the account that made the change"
        );

        const details = await session.rowCells(`#${field.id}`, { column: "Details" });

        assert.includesText(details || "", field.label, `the summary carries the new label: ${details}`);

        const stored = await adminApi.expectOk(
          adminApi.get(`/admin/audit/events?entityType=field&entityId=${field.id}`),
          "read the same event through the API"
        );

        assert.ok(
          (Array.isArray(stored) ? stored : []).some((row) => row.action === "field.create"),
          "the screen and the API report the same write"
        );
      },
    },
    {
      name: "the details cell opens to show the recorded summary",
      screen: "/admin/audit",
      fn: async ({ session, assert, field }) => {
        await session.goto("/admin/audit");
        await filterBy(session, { "audit-entity-id": String(field.id) });

        const disclosure = await session.driver.wait(
          until.elementLocated(
            By.xpath(`//table//td//details[contains(normalize-space(),"${field.label}")]/summary`)
          ),
          10000,
          "the row never offered its summary disclosure"
        );

        await disclosure.click();
        await session.step("open the recorded summary");

        const block = await session.anyText(
          By.xpath(`//table//td//details[contains(normalize-space(),"${field.label}")]/pre`)
        );

        assert.includesText(block || "", "dataType", `the JSON shows what was stored: ${block}`);
        assert.includesText(block || "", field.label, "and the label the field was created with");
      },
    },
    {
      name: "the actor filter is the person, not the row",
      screen: "/admin/audit",
      fn: async ({ session, assert, adminUser }) => {
        await session.goto("/admin/audit");
        await filterBy(session, { "audit-actor": String(adminUser.id) });

        const actors = await columnValues(session, "Actor");

        assert.ok(actors.length > 0, "the administrator has actions in the trail");
        assert.eq(
          actors.filter((actor) => actor !== adminUser.email).length,
          0,
          `every row belongs to that account: ${actors.slice(0, 5).join(" | ")}`
        );
      },
    },
    {
      name: "the date window bounds what the trail reports",
      screen: "/admin/audit",
      fn: async ({ session, assert }) => {
        await session.goto("/admin/audit");
        await filterBy(session, { "audit-from": today() });

        const stamps = await columnValues(session, "When (UTC)");

        assert.ok(stamps.length >= 1, "actions recorded today are listed");
        assert.eq(
          stamps.filter((stamp) => !stamp.startsWith(today())).length,
          0,
          `nothing older than the window survives: ${stamps.slice(0, 3).join(" | ")}`
        );

        await session.setReactValue("audit-from", "");
        await session.driver.sleep(900);
        await session.setReactValue("audit-to", "2001-01-01");
        await session.driver.sleep(1200);

        await session.waitForText("No matching actions");

        const main = await session.text(By.css("main"));

        assert.includesText(main, "1 filter applied", "the empty result still reports its filter");

        await session.clickButton("Clear filters");
        await session.driver.sleep(1200);

        await session.waitForRows();

        assert.includesText(
          await session.text(By.css("main")),
          "Showing every recorded action",
          "clearing returns the whole trail"
        );
      },
    },
    {
      name: "nothing that looks like a credential is readable in the trail",
      fn: async ({ adminApi, assert }) => {
        const events = await adminApi.expectOk(
          adminApi.get("/admin/audit/events?pageSize=200"),
          "read a page of the trail"
        );

        const rows = Array.isArray(events) ? events : [];

        assert.ok(rows.length > 0, `the page carries ${rows.length} event(s)`);

        const leaked = [];

        for (const row of rows) {
          walk(row.summary, (key, value) => {
            if (typeof key !== "string") return;

            if (/password|secret|token|hash|credential|api_key/i.test(key)) {
              if (value !== "[redacted]") {
                leaked.push(`${row.action}.${key}=${JSON.stringify(value)}`);
              }

              return;
            }

            if (typeof value === "string" && value === PASSWORD) {
              leaked.push(`${row.action}.${key} carries the suite password`);
            }
          });
        }

        assert.eq(leaked.join(" | "), "", "every sensitive key is redacted");

        const dump = JSON.stringify(rows);

        assert.ok(
          !/\$argon2|\$2[aby]\$|BEGIN (RSA )?PRIVATE KEY/.test(dump),
          "no password hash or key material is stored in a summary"
        );

        const settingsRows = rows.filter((row) => row.action === "settings.smtp.update");

        for (const row of settingsRows) {
          assert.eq(
            row.summary?.passwordUpdated,
            "[redacted]",
            "a settings save reports only that a credential changed, never the credential"
          );
        }
      },
    },
    {
      name: "an account without the audit permission is refused by the API and the shell",
      screen: "/admin/audit",
      fn: async ({ session, assert, employee, adminApi, config }) => {
        const client = new ApiClient();

        await client.login({ email: employee.email, password: PASSWORD });

        const refused = await client.get("/admin/audit/events");

        assert.eq(refused.status, 403, "the trail is not readable without the permission");

        const anonymous = new ApiClient();

        const unauthenticated = await anonymous.get("/admin/audit/events");

        assert.eq(unauthenticated.status, 401, "and not readable without a session at all");

        try {
          await session.login({ email: employee.email, password: PASSWORD });

          await session.goto("/");

          assert.ok(
            !(await session.exists(By.xpath('//nav[@aria-label="Main"]//a[normalize-space()="Audit trail"]'))),
            "the sidebar does not offer the trail to this role"
          );

          await session.goto("/admin/audit");

          const main = await session.text(By.css("main"));

          assert.includesText(main, "You do not have access to this area", "and the screen itself refuses");
          assert.includesText(
            main,
            "Viewing the audit trail",
            "naming the permission that is missing"
          );
        } finally {
          await adminApi.patch(`/admin/users/${employee.id}`, { status: "disabled" });
          await session.login(config.admin);
        }
      },
    },
    {
      name: "the trail records the record writes, so a value can be traced",
      screen: "/admin/audit",
      fn: async ({ session, assert, adminApi }) => {
        const events = await adminApi.expectOk(
          adminApi.get("/admin/audit/events?action=record.create&pageSize=50"),
          "read the record writes"
        );

        const rows = Array.isArray(events) ? events : [];

        assert.ok(
          rows.length > 0,
          "no record.create rows — the records suite has to run before this one"
        );

        const first = rows[0];

        assert.eq(first.entityType, "record", "the row names its object type");
        assert.ok(first.summary?.tableId, `and the table it was written into (${first.summary?.tableId})`);
        assert.ok(Array.isArray(first.summary?.valueKeys), "listing only the keys that were stored");
        assert.ok(
          !(first.summary?.valueKeys ?? []).some((key) => /password|token|secret/i.test(key)),
          "without repeating any of the values"
        );

        await session.goto("/admin/audit");
        await filterBy(session, { "audit-action": "record.create", "audit-entity-type": "record" });

        const actions = await columnValues(session, "Action");

        assert.eq(
          actions.filter((action) => action !== "record.create").length,
          0,
          `the browser lists the same shape: ${actions.join(" | ")}`
        );
      },
    },
  ],
};
