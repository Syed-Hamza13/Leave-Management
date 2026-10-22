import { By } from "selenium-webdriver";

import { ApiClient } from "../lib/api.js";
import { buildDropdown, buildMappedTable } from "../lib/fixtures.js";

/*
 * One pass through the whole promise of the installation, in the order a real
 * rollout happens: an administrator defines a field, a column, a form and the
 * mapping between them; a person holding only the employee role signs in and finds
 * that definition waiting as a form; the values they type land in the columns they
 * were mapped to; the trail says who wrote them; and nothing in the chain can reach
 * the authentication columns of the accounts table.
 *
 * The definitions are assembled through the API because the builder screens have
 * their own suites. Everything a person experiences is driven in the browser, and
 * every hand-over of the browser session is restored in a finally so a failure in
 * one test cannot leave the next suite signed in as the wrong person.
 */

const PASSWORD = "E2eSlice!2026";

/** The buttons one row offers, so a permission can be read from the screen itself. */
async function rowButtons(session, matchText) {
  return session.driver.executeScript(
    `const needle = arguments[0];
     const normalise = (text) => (text || "").replace(/\\s+/g, " ").trim();

     for (const row of document.querySelectorAll("table tbody tr")) {
       if (!normalise(row.innerText).includes(needle)) {
         continue;
       }

       return Array.from(row.querySelectorAll("button")).map((button) => normalise(button.innerText));
     }

     return null;`,
    matchText
  );
}

async function storedRecord(adminApi, fixture, needle) {
  const stored = await adminApi.expectOk(
    adminApi.get(`/tables/${fixture.tableId}/records?search=${encodeURIComponent(needle)}&pageSize=50`),
    "read the record through the API"
  );

  const rows = Array.isArray(stored) ? stored : (stored?.data ?? []);

  return rows.find((row) => row.values?.[fixture.columns[0].columnKey] === needle) ?? null;
}

export default {
  name: "vertical slice",
  area: "MVP slice — definition to record to audit",
  async setup({ adminApi, isolate }) {
    const options = await buildDropdown({ adminApi, isolate, name: "SliceMode" });

    const fixture = await buildMappedTable({
      adminApi,
      isolate,
      name: "Slice",
      options,
      specs: [
        { name: "Reason", dataType: "text", value: "family occasion" },
        { name: "Days", dataType: "number", value: 3 },
        { name: "From", dataType: "date", value: "2026-04-01" },
        { name: "Mode", dataType: "dropdown", dropdownId: options.id },
      ],
    });

    const employee = await adminApi.expectOk(
      adminApi.post("/admin/users", {
        email: isolate.email("submitter"),
        firstName: "Farhan",
        lastName: "Siddiqui",
        password: PASSWORD,
        roleKeys: ["employee"],
      }),
      "create the employee who will fill the form"
    );

    return {
      fixture,
      options,
      employee,
      employeeAccount: { email: employee.email, password: PASSWORD },
    };
  },
  tests: [
    {
      name: "an administrator's definitions arrive on the entry form as controls",
      screen: "/records/:tableId",
      fn: async ({ session, assert, fixture, options }) => {
        const [reason, days, from, mode] = fixture.columns;

        await session.goto(`/records/${fixture.tableId}`);
        await session.clickButton("New record");
        await session.anyDialogTitle("record");

        assert.eq(
          await (await session.control(reason.label)).getAttribute("type"),
          "text",
          "the text definition is a text control"
        );
        assert.eq(
          await (await session.control(days.label)).getAttribute("type"),
          "number",
          "the number definition is a number control"
        );
        assert.eq(
          await (await session.control(from.label)).getAttribute("type"),
          "date",
          "the date definition is a date control"
        );

        const labels = await session.optionLabels(mode.label);

        assert.ok(
          labels.includes("Alpha") && labels.includes("Beta"),
          `the dropdown definition offers its own options: ${labels.join(" | ")}`
        );
        assert.ok(
          (await session.controlValue(mode.label)) !== options.optionValue,
          "and starts unselected so nothing is submitted by accident"
        );

        const dialog = await session.text(By.css('[role="dialog"]'));

        assert.includesText(dialog || "", fixture.formLabel, "the form the administrator connected is the one shown");
        assert.includesText(dialog || "", fixture.tableLabel, "and the table it will be stored in is named");

        await session.closeDialog(`New ${fixture.tableLabel.toLowerCase()} record`);
      },
    },
    {
      name: "the person who only submits cannot open the builders",
      screen: "/admin/fields",
      fn: async ({ session, assert, config, fixture, employeeAccount }) => {
        try {
          await session.login(employeeAccount);

          await session.goto("/");

          const nav = await session.sidebarUserText();

          assert.includesText(
            nav,
            employeeAccount.email,
            `the browser really changed hands: ${nav.slice(0, 140)}`
          );
          assert.ok(
            !(await session.exists(By.xpath('//nav[@aria-label="Main"]//a[normalize-space()="Fields"]'))),
            "the sidebar offers no field builder"
          );

          await session.goto("/admin/fields");
          await session.waitForApp();

          assert.includesText(
            await session.text(By.css("main")),
            "You do not have access",
            "and the screen itself refuses"
          );

          const client = new ApiClient();

          await client.login(employeeAccount);

          assert.eq((await client.get("/admin/fields")).status, 403, "the API refuses the definition read as well");
          assert.eq(
            (await client.get(`/tables/${fixture.tableId}/records`)).status,
            200,
            "while still letting the same account read the records it is meant to fill"
          );
        } finally {
          await session.login(config.admin);
        }
      },
    },
    {
      name: "the employee submits the mapped form and the values reach their columns",
      screen: "/records/:tableId",
      fn: async ({ session, assert, config, fixture, employee, employeeAccount, adminApi }) => {
        const [reason, days, from, mode] = fixture.columns;

        try {
          await session.login(employeeAccount);

          await session.goto(`/records/${fixture.tableId}`);
          await session.clickButton("New record");
          await session.anyDialogTitle("record");

          await session.fill(reason.label, reason.value);
          await session.fill(days.label, days.value);
          await session.fill(from.label, from.value);
          await session.selectOption(mode.label, "Alpha");

          await session.clickButton("Submit");

          const toast = await session.expectToast("was created");

          assert.includesText(toast, "Record #", `the toast carries the new number: ${toast}`);

          await session.waitForRows();

          const cells = await session.rowCells(String(reason.value));

          assert.ok(cells, "the row the employee wrote is listed for them");
          assert.eq(cells[0], String(reason.value), "the text value is in the text column");
          assert.eq(cells[1], String(days.value), "the number value is in the number column");
          assert.eq(cells[2], String(from.value), "the date value is in the date column");
          assert.eq(
            cells[3],
            "alpha",
            "the dropdown cell shows the stored option value; the list never resolves it to the option label"
          );

          const buttons = await rowButtons(session, String(reason.value));

          assert.ok(buttons, "the row is on screen");
          assert.eq(
            buttons.filter((label) => ["Edit", "Archive"].includes(label)).join(","),
            "",
            `the submitter is offered no edit or archive (${buttons.join(", ")})`
          );
        } finally {
          await session.login(config.admin);
        }

        const record = await storedRecord(adminApi, fixture, reason.value);

        assert.ok(record, "the administrator reads the same row back through the API");
        assert.eq(record.values[days.columnKey], days.value, "stored under the mapped column key, as a number");
        assert.eq(record.values[from.columnKey], from.value, "and the date as the day itself");
        assert.eq(record.values[mode.columnKey], "alpha", "with the option value, not its label");
        assert.eq(record.createdBy, employee.id, "the row remembers who wrote it");
        assert.eq(record.status, "active", "and it is an active record");
      },
    },
    {
      name: "the trail names the employee as the actor of that write",
      fn: async ({ adminApi, assert, fixture, employee }) => {
        const record = await storedRecord(adminApi, fixture, fixture.columns[0].value);

        assert.ok(record, "the submitted record is still there");

        const events = await adminApi.expectOk(
          adminApi.get(
            `/admin/audit/events?action=record.create&entityType=record&entityId=${record.id}`
          ),
          "read the audit row for the write"
        );

        const trail = Array.isArray(events) ? events : [];

        assert.eq(trail.length, 1, `exactly one create event for record #${record.id}`);

        const event = trail[0];

        assert.eq(event.actorEmail, employee.email, "the trail names the employee, not the administrator");
        assert.eq(event.summary?.tableId, fixture.tableId, "and the table it was written into");
        assert.eq(event.summary?.formId, fixture.formId, "through the form it came in on");
        assert.ok(
          (event.summary?.valueKeys ?? []).includes(fixture.columns[0].columnKey),
          `listing only the keys that were stored: ${JSON.stringify(event.summary?.valueKeys)}`
        );
        assert.ok(
          !JSON.stringify(event.summary).includes(String(fixture.columns[0].value)),
          "without repeating the value itself"
        );
      },
    },
    {
      name: "the record surface cannot reach the authentication columns",
      fn: async ({ adminApi, assert, fixture, employee }) => {
        const attempted = await adminApi.post(`/tables/${fixture.tableId}/records`, {
          formId: fixture.formId,
          values: { password_hash: "$argon2$fake", email: "someone@example.com", status: "disabled" },
        });

        assert.ok(
          attempted.status >= 400 && attempted.status < 500,
          `a payload naming authentication columns is refused (${attempted.status} ${JSON.stringify(
            attempted.body
          ).slice(0, 240)})`
        );

        const stored = await adminApi.expectOk(
          adminApi.get(`/tables/${fixture.tableId}/records?pageSize=100`),
          "read the table back"
        );

        const rows = Array.isArray(stored) ? stored : (stored?.data ?? []);

        assert.ok(rows.length >= 1, `the table holds ${rows.length} record(s)`);

        for (const row of rows) {
          assert.ok(
            !Object.keys(row.values ?? {}).some((key) => /password|token|session|device/i.test(key)),
            `no stored record carries an authentication key (${Object.keys(row.values ?? {}).join(",")})`
          );
        }

        const account = await adminApi.expectOk(
          adminApi.get(`/admin/users/${employee.id}`),
          "read the employee account back"
        );

        assert.eq(account.status, "active", "the record write left the account's own status alone");
        assert.eq(
          (account.roles ?? []).map((role) => role.key).join(","),
          "employee",
          "and its roles"
        );
      },
    },
    {
      name: "the administrator can correct the row the employee wrote",
      screen: "/records/:tableId",
      fn: async ({ session, assert, fixture, adminApi, adminUser }) => {
        const [reason] = fixture.columns;
        const corrected = `${reason.value} (amended)`;

        await session.goto(`/records/${fixture.tableId}`);
        await session.waitForRows();

        await session.clickInRow(String(reason.value), "Edit");
        await session.anyDialogTitle("Edit record #");

        await session.fill(reason.label, corrected);
        await session.submitDialog();

        const toast = await session.expectToast("was saved");

        assert.includesText(toast, "Record #", `the update reports its number: ${toast}`);

        await session.fill("Search records", corrected);
        await session.driver.sleep(1500);

        const cells = await session.rowCells(corrected);

        assert.ok(cells, `the amended row is listed (${JSON.stringify(cells)})`);
        assert.eq(cells[0], corrected, "with the corrected text in the same column");

        const record = await storedRecord(adminApi, fixture, corrected);

        assert.ok(record, "the correction reached the stored value");

        const events = await adminApi.expectOk(
          adminApi.get(`/admin/audit/events?action=record.update&entityId=${record.id}`),
          "read the update event"
        );

        const trail = Array.isArray(events) ? events : [];

        assert.eq(trail.length, 1, "the correction is in the trail, once");
        assert.eq(trail[0]?.actorEmail, adminUser.email, "and it names the administrator who made it");
        assert.eq(record.updatedBy, adminUser.id, "the record itself carries that author too");
      },
    },
    {
      name: "the employee may not change or archive a row afterwards",
      fn: async ({ adminApi, assert, fixture, employee }) => {
        const stored = await adminApi.expectOk(
          adminApi.get(`/tables/${fixture.tableId}/records?pageSize=50`),
          "read the records"
        );

        const rows = Array.isArray(stored) ? stored : (stored?.data ?? []);
        const target = rows[0];

        assert.ok(target, "the slice table has a record to try to change");

        const client = new ApiClient();

        await client.login({ email: employee.email, password: PASSWORD });

        const updated = await client.patch(`/tables/${fixture.tableId}/records/${target.id}`, {
          formId: fixture.formId,
          values: { [fixture.columns[0].columnKey]: "not yours to change" },
        });

        assert.eq(updated.status, 403, "updating is refused for the submitter role");

        const archived = await client.del(`/tables/${fixture.tableId}/records/${target.id}`);

        assert.eq(archived.status, 403, "and archiving too");

        await adminApi.patch(`/admin/users/${employee.id}`, { status: "disabled" });

        const still = await adminApi.expectOk(
          adminApi.get(`/tables/${fixture.tableId}/records/${target.id}`),
          "read the record after the refusals"
        );

        assert.eq(still.status, "active", "the refused writes changed nothing");
      },
    },
  ],
};
