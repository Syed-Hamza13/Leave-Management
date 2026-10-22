import { By, until } from "selenium-webdriver";

import { ApiClient } from "../lib/api.js";
import { buildMappedTable } from "../lib/fixtures.js";

/*
 * Every data type the registry publishes, exercised from definition to stored
 * value. The builders suites cover the dialogs and the records suite covers the
 * list, so this one is about the types themselves: the shape each one accepts,
 * the storage family it lands in, and the control the entry form renders for it.
 *
 * The four types nothing else touches — email, checkbox, toggle and
 * record_reference — are the reason this suite exists. A relation in particular
 * crosses three modules (column definition, mapping compatibility, record
 * integrity) and can rot silently.
 *
 * Two keying rules make these tests easy to get wrong, so they are stated once:
 * a submission through a mapped form is keyed by FIELD key, while the stored row
 * that comes back is keyed by COLUMN key.
 */

const TYPE_KEYS = [
  "text",
  "textarea",
  "number",
  "date",
  "email",
  "phone",
  "dropdown",
  "checkbox",
  "toggle",
  "record_reference",
  "entity_reference",
  "user_reference",
];

async function openTableDetail(session, label) {
  await session.goto("/admin/tables");
  await session.fill("Search tables", label);
  await session.waitForRows();

  const link = await session.driver.wait(
    until.elementLocated(By.xpath(`//table//a[normalize-space()="${label}"]`)),
    10000
  );

  await link.click();
  await session.step(`open table ${label}`);
  await session.waitHeading("Table columns");
}

async function createTable(session, { label, key }) {
  await session.goto("/admin/tables");
  await session.clickButton("New table");
  await session.openDialog("New table");

  await session.fill("table-label", label);
  await session.fill("table-key", key);
  await session.submitDialog();
  await session.expectToast("was created");

  // The list is paged at 25 rows and sorted by name, so the new table is searched for.
  await session.fill("Search tables", label);
  await session.waitRow(label);
}

/** Submits through the mapping, so values are keyed by form field. */
function storeRecord(adminApi, fixture, values) {
  return adminApi.expectOk(
    adminApi.post(`/tables/${fixture.tableId}/records`, {
      formId: fixture.formId,
      values,
    }),
    "store the row"
  );
}

/**
 * Stores a row and reads it straight back, so an assertion is about what the
 * server kept rather than about a list that may still be refreshing.
 */
async function storeAndRead(adminApi, fixture, values) {
  const created = await storeRecord(adminApi, fixture, values);

  return adminApi.expectOk(
    adminApi.get(`/tables/${fixture.tableId}/records/${created.id}`),
    "read the row back"
  );
}

/** The raw response, for the cases where the refusal is the point. */
function refusal(adminApi, fixture, values) {
  return adminApi.post(`/tables/${fixture.tableId}/records`, {
    formId: fixture.formId,
    values,
  });
}

/** The entry dialog for a fixture, opened and confirmed to be the right one. */
async function openEntry(session, fixture) {
  await session.goto(`/records/${fixture.tableId}`);
  await session.clickButton("New record");

  return session.anyDialogTitle("record");
}

async function dialogText(session) {
  const panel = await session.driver.findElement(By.css('div[role="dialog"]'));

  return (await panel.getText()).replace(/\s+/g, " ");
}

/** A save is asynchronous, so the message it leaves behind has to be waited for. */
async function dialogError(session, timeout = 8000) {
  const limit = Date.now() + timeout;
  let messages = [];

  while (Date.now() < limit) {
    messages = await session.dialogHasError();

    if (messages.length) {
      return messages;
    }

    await session.driver.sleep(200);
  }

  return messages;
}

/**
 * Relation candidates and stored relation labels both arrive on a second
 * request, so a cell or an option that names another record is polled for
 * rather than read once.
 */
async function waitForOptions(session, label, needle, timeout = 10000) {
  const limit = Date.now() + timeout;
  let options = [];

  while (Date.now() < limit) {
    options = await session.optionLabels(label).catch(() => []);

    if (options.some((option) => option === needle)) {
      return options;
    }

    await session.driver.sleep(250);
  }

  return options;
}

async function waitForRowText(session, rowMatch, needle, timeout = 10000) {
  const limit = Date.now() + timeout;
  let cells = null;

  while (Date.now() < limit) {
    cells = await session.rowCells(rowMatch);

    if (cells && cells.join(" ").includes(needle)) {
      return cells;
    }

    await session.driver.sleep(250);
  }

  return cells;
}

export default {
  name: "data types",
  area: "Data types — every storage family end to end",
  async setup({ adminApi, isolate }) {
    /*
     * A relation needs something to point at, and the picker labels a candidate
     * with the target table's own display column, so the target has to hold a
     * row before any referencing form can be opened.
     */
    const target = await buildMappedTable({
      adminApi,
      isolate,
      name: "Branch",
      specs: [{ name: "Code", dataType: "text", value: "BR-1" }],
    });

    const targetRecord = await storeRecord(adminApi, target, target.values);

    return { target, targetRecord };
  },
  tests: [
    {
      name: "the published type registry describes every type the builders can offer",
      screen: "/admin/metadata/data-types",
      area: "Metadata contract",
      fn: async ({ adminApi, assert }) => {
        const types = await adminApi.expectOk(
          adminApi.get("/admin/metadata/data-types"),
          "read the type registry"
        );

        assert.ok(Array.isArray(types), "the registry is a list");

        const published = types.map((entry) => entry.key);

        for (const key of TYPE_KEYS) {
          assert.ok(published.includes(key), `the registry publishes "${key}"`);
        }

        assert.eq(
          published.filter((key) => !TYPE_KEYS.includes(key)).length,
          0,
          `the registry publishes nothing this suite does not know about: ${published.join(", ")}`
        );

        for (const type of types) {
          assert.ok(type.label, `"${type.key}" carries a label the picker can show`);
          assert.ok(type.storage, `"${type.key}" declares its storage family`);
          assert.ok(type.input, `"${type.key}" declares the control that renders it`);
          assert.ok(
            Array.isArray(type.filterOperators) && type.filterOperators.length > 0,
            `"${type.key}" publishes the operators its storage family can be filtered by`
          );
          assert.ok(
            Array.isArray(type.configFields),
            `"${type.key}" publishes its configuration fields`
          );
        }

        const relation = types.find((entry) => entry.key === "record_reference");

        for (const key of ["targetTableId", "targetDisplayColumnKey", "allowMultiple"]) {
          assert.ok(
            relation.configFields.some((field) => field.key === key),
            `a relation publishes its "${key}" setting`
          );
        }

        const booleans = types.filter((entry) => entry.storage === "boolean");

        assert.eq(
          booleans.length,
          2,
          `checkbox and toggle are the two boolean presentations: ${booleans
            .map((entry) => entry.key)
            .join(", ")}`
        );

        const lookups = await adminApi.expectOk(
          adminApi.get("/admin/metadata/lookups"),
          "read the builder lookups"
        );

        for (const group of ["dropdowns", "tables", "forms", "entityTypes"]) {
          assert.ok(
            Array.isArray(lookups[group]),
            `the lookup payload carries a "${group}" list`
          );
        }

        /*
         * The lookups name every table and form in the installation, so they are
         * not public even though nothing in them can be written to.
         */
        const anonymous = new ApiClient();
        const refused = await anonymous.get("/admin/metadata/lookups");

        assert.eq(refused.status, 401, "the lookups are refused without a session");
      },
    },
    {
      name: "an email column stores an address and refuses one that is not",
      screen: "/records/:tableId",
      fn: async ({ session, adminApi, assert, isolate }) => {
        const fixture = await buildMappedTable({
          adminApi,
          isolate,
          name: "Contact",
          specs: [{ name: "Address", dataType: "email" }],
        });

        const fieldKey = fixture.columns[0].key;
        const columnKey = fixture.columns[0].columnKey;

        const malformed = await refusal(adminApi, fixture, { [fieldKey]: "not-an-address" });

        assert.eq(malformed.status, 400, "a string with no @ in it is refused");
        assert.includesText(
          JSON.stringify(malformed.body),
          "valid email address",
          "the refusal says what the column expects"
        );

        const stored = await storeAndRead(adminApi, fixture, {
          [fieldKey]: "  someone@example.test  ",
        });

        assert.eq(
          stored.values[columnKey],
          "someone@example.test",
          "the address is stored trimmed"
        );

        await openEntry(session, fixture);

        const control = await session.control(fixture.columns[0].label);

        assert.eq(
          await control.getAttribute("type"),
          "email",
          "the entry form renders an email control, not a plain text box"
        );

        await session.fill(fixture.columns[0].label, "still-not-an-address");

        const blocked = await session.formSubmissionBlocked();

        assert.ok(
          blocked.reported,
          `the browser refuses the malformed address before the server is asked (${blocked.reason})`
        );

        await session.fill(fixture.columns[0].label, "typed@example.test");
        await session.clickButton("Submit");
        await session.expectToast("was created");

        await session.waitRow("typed@example.test");

        assert.ok(
          await session.rowExists("typed@example.test"),
          "the address typed into the form is listed"
        );
      },
    },
    {
      name: "a multiline column keeps long text and honours its length bound",
      screen: "/records/:tableId",
      fn: async ({ session, adminApi, assert, isolate }) => {
        const fixture = await buildMappedTable({
          adminApi,
          isolate,
          name: "Notes",
          specs: [
            { name: "Body", dataType: "textarea", config: { maxLength: 40, rows: 3 } },
          ],
        });

        const fieldKey = fixture.columns[0].key;
        const columnKey = fixture.columns[0].columnKey;

        const tooLong = await refusal(adminApi, fixture, { [fieldKey]: "x".repeat(41) });

        assert.eq(tooLong.status, 400, "text past the configured maximum is refused");
        assert.includesText(
          JSON.stringify(tooLong.body),
          "at most 40 characters",
          "the refusal quotes the column's own bound"
        );

        const stored = await storeAndRead(adminApi, fixture, {
          [fieldKey]: "a reason long enough to need a paragraph",
        });

        assert.eq(
          stored.values[columnKey],
          "a reason long enough to need a paragraph",
          "the full text is stored"
        );

        await openEntry(session, fixture);

        const control = await session.control(fixture.columns[0].label);

        assert.eq(
          await control.getTagName(),
          "textarea",
          "the entry form renders a textarea for a multiline column"
        );
        assert.eq(
          await control.getAttribute("rows"),
          "3",
          "the configured row count reaches the control"
        );
        assert.eq(
          await control.getAttribute("maxlength"),
          "40",
          "the configured maximum reaches the control"
        );

        await session.closeDialog(await session.dialogTitle());
      },
    },
    {
      name: "a number column enforces its bounds and its decimal places",
      screen: "/records/:tableId",
      fn: async ({ session, adminApi, assert, isolate }) => {
        const bounded = await buildMappedTable({
          adminApi,
          isolate,
          name: "Bounded",
          specs: [
            {
              name: "Amount",
              dataType: "number",
              config: { min: 0, max: 100, decimalPlaces: 2 },
            },
          ],
        });

        const fieldKey = bounded.columns[0].key;
        const columnKey = bounded.columns[0].columnKey;

        const above = await refusal(adminApi, bounded, { [fieldKey]: 101 });

        assert.eq(above.status, 400, "a value above the maximum is refused");
        assert.includesText(
          JSON.stringify(above.body),
          "100 or less",
          "the refusal quotes the maximum"
        );

        const below = await refusal(adminApi, bounded, { [fieldKey]: -1 });

        assert.eq(below.status, 400, "a value below the minimum is refused");
        assert.includesText(
          JSON.stringify(below.body),
          "0 or greater",
          "and the refusal quotes the minimum"
        );

        const rounded = await storeAndRead(adminApi, bounded, { [fieldKey]: 12.567 });

        assert.eq(
          rounded.values[columnKey],
          12.57,
          "the value is stored at the column's own precision"
        );

        const whole = await buildMappedTable({
          adminApi,
          isolate,
          name: "Whole",
          specs: [{ name: "Headcount", dataType: "number", config: { decimalPlaces: 0 } }],
        });

        const fractional = await refusal(adminApi, whole, {
          [whole.columns[0].key]: 1.5,
        });

        assert.eq(fractional.status, 400, "a fraction is refused by a whole-number column");
        assert.includesText(
          JSON.stringify(fractional.body),
          "whole number",
          "the refusal names the rule"
        );

        const textual = await refusal(adminApi, whole, {
          [whole.columns[0].key]: "twelve",
        });

        assert.eq(textual.status, 400, "a word is not read as a number");

        await openEntry(session, bounded);

        const control = await session.control(bounded.columns[0].label);

        assert.eq(await control.getAttribute("type"), "number", "the control is a number input");
        assert.eq(await control.getAttribute("min"), "0", "the minimum reaches the control");
        assert.eq(await control.getAttribute("max"), "100", "the maximum reaches the control");
        assert.eq(
          await control.getAttribute("step"),
          "1e-2",
          "the precision reaches the control as a step the browser understands"
        );

        await session.fill(bounded.columns[0].label, "500");

        const blocked = await session.formSubmissionBlocked();

        assert.ok(
          blocked.reported,
          `the browser stops a value outside the bounds (${blocked.reason})`
        );

        await session.closeDialog(await session.dialogTitle());
      },
    },
    {
      name: "a date column enforces its window and rejects a day that never happened",
      screen: "/records/:tableId",
      fn: async ({ session, adminApi, assert, isolate }) => {
        const fixture = await buildMappedTable({
          adminApi,
          isolate,
          name: "Windowed",
          specs: [
            {
              name: "Happens",
              dataType: "date",
              config: { minDate: "2026-01-01", maxDate: "2026-12-31" },
            },
          ],
        });

        const fieldKey = fixture.columns[0].key;
        const columnKey = fixture.columns[0].columnKey;

        const early = await refusal(adminApi, fixture, { [fieldKey]: "2025-12-31" });

        assert.eq(early.status, 400, "a date before the window is refused");
        assert.includesText(
          JSON.stringify(early.body),
          "cannot be earlier than 2026-01-01",
          "the refusal names the boundary"
        );

        const late = await refusal(adminApi, fixture, { [fieldKey]: "2027-01-01" });

        assert.eq(late.status, 400, "a date after the window is refused");
        assert.includesText(
          JSON.stringify(late.body),
          "cannot be later than 2026-12-31",
          "and names the other one"
        );

        const impossible = await refusal(adminApi, fixture, { [fieldKey]: "2026-02-30" });

        assert.eq(impossible.status, 400, "the 30th of February is refused");
        assert.includesText(
          JSON.stringify(impossible.body),
          "not a valid calendar date",
          "and the reason is that the day does not exist"
        );

        const shaped = await refusal(adminApi, fixture, { [fieldKey]: "04/03/2026" });

        assert.eq(shaped.status, 400, "a date in another format is refused, not guessed at");
        assert.includesText(
          JSON.stringify(shaped.body),
          "YYYY-MM-DD",
          "the refusal names the format it wants"
        );

        const stored = await storeAndRead(adminApi, fixture, { [fieldKey]: "2026-06-15" });

        assert.eq(stored.values[columnKey], "2026-06-15", "an in-window date is stored as ISO text");

        await openEntry(session, fixture);

        const control = await session.control(fixture.columns[0].label);

        assert.eq(await control.getAttribute("type"), "date", "the control is a date picker");
        assert.eq(await control.getAttribute("min"), "2026-01-01", "the window start reaches it");
        assert.eq(await control.getAttribute("max"), "2026-12-31", "the window end reaches it");

        await session.closeDialog(await session.dialogTitle());
      },
    },
    {
      name: "a text column enforces the pattern its definition carries",
      screen: "/records/:tableId",
      fn: async ({ session, adminApi, assert, isolate }) => {
        const fixture = await buildMappedTable({
          adminApi,
          isolate,
          name: "Coded",
          specs: [
            {
              name: "Reference",
              dataType: "text",
              config: { pattern: "^[A-Z]{2}-\\d{4}$", minLength: 7, maxLength: 20 },
            },
          ],
        });

        const fieldKey = fixture.columns[0].key;
        const columnKey = fixture.columns[0].columnKey;

        const short = await refusal(adminApi, fixture, { [fieldKey]: "AB-12" });

        assert.eq(short.status, 400, "text under the minimum length is refused");
        assert.includesText(
          JSON.stringify(short.body),
          "at least 7 characters",
          "the refusal quotes the minimum"
        );

        const shaped = await refusal(adminApi, fixture, { [fieldKey]: "AB-123456" });

        assert.eq(shaped.status, 400, "text that breaks the pattern is refused");
        assert.includesText(
          JSON.stringify(shaped.body),
          "does not match the required format",
          "the refusal says the format is wrong without printing the expression"
        );

        const stored = await storeAndRead(adminApi, fixture, { [fieldKey]: "AB-1234" });

        assert.eq(stored.values[columnKey], "AB-1234", "a value that fits the pattern is stored");

        await openEntry(session, fixture);

        const control = await session.control(fixture.columns[0].label);

        assert.eq(
          await control.getAttribute("pattern"),
          "^[A-Z]{2}-\\d{4}$",
          "the stored expression reaches the control so the browser can pre-check it"
        );

        await session.fill(fixture.columns[0].label, "nope");

        const blocked = await session.formSubmissionBlocked();

        assert.ok(
          blocked.reported,
          `the browser stops a value that breaks the pattern (${blocked.reason})`
        );

        await session.closeDialog(await session.dialogTitle());
      },
    },
    {
      name: "a boolean column stores a real true and false, whichever way it is presented",
      screen: "/records/:tableId",
      fn: async ({ session, adminApi, assert, isolate }) => {
        const fixture = await buildMappedTable({
          adminApi,
          isolate,
          name: "Approval",
          specs: [
            { name: "Title", dataType: "text" },
            { name: "Approved", dataType: "checkbox" },
          ],
        });

        const titleKey = fixture.columns[0].key;
        const flagKey = fixture.columns[1].key;
        const flagColumn = fixture.columns[1].columnLabel;

        const yes = await storeAndRead(adminApi, fixture, {
          [titleKey]: "approved row",
          [flagKey]: true,
        });

        assert.eq(yes.values[fixture.columns[1].columnKey], true, "a tick is stored as true");
        assert.eq(
          typeof yes.values[fixture.columns[1].columnKey],
          "boolean",
          "and not as the string a plain HTML form would have posted"
        );

        const no = await storeAndRead(adminApi, fixture, {
          [titleKey]: "pending row",
          [flagKey]: false,
        });

        assert.eq(
          no.values[fixture.columns[1].columnKey],
          false,
          "an unticked box is stored as a boolean false, not as nothing at all"
        );

        /*
         * The coercion also accepts the strings an HTML form posts, so a client
         * that cannot speak JSON booleans is not locked out.
         */
        const fromText = await storeAndRead(adminApi, fixture, {
          [titleKey]: "textual row",
          [flagKey]: "yes",
        });

        assert.eq(
          fromText.values[fixture.columns[1].columnKey],
          true,
          `the string "yes" is coerced to true`
        );

        const nonsense = await refusal(adminApi, fixture, {
          [titleKey]: "nonsense row",
          [flagKey]: "perhaps",
        });

        assert.eq(nonsense.status, 400, "a value that is neither true nor false is refused");
        assert.includesText(
          JSON.stringify(nonsense.body),
          "must be true or false",
          "and the refusal says so"
        );

        await session.goto(`/records/${fixture.tableId}`);
        await session.waitForRows();

        const approved = await waitForRowText(session, "approved row", "Yes");
        const pending = await waitForRowText(session, "pending row", "No");

        assert.ok(approved, "the approved row is listed");
        assert.ok(pending, "the pending row is listed");
        assert.ok(
          approved.some((cell) => cell === "Yes"),
          `a stored true reads as "Yes" in its own column: ${approved.join(" | ")}`
        );
        assert.ok(
          pending.some((cell) => cell === "No"),
          `a stored false reads as "No" in its own column: ${pending.join(" | ")}`
        );

        const index = await session.columnHeaderIndex(flagColumn);

        assert.ok(index !== null, `the boolean column has its own heading ("${flagColumn}")`);

        await session.clickButton("New record");
        await session.anyDialogTitle("record");

        await session.fill(fixture.columns[0].label, "ticked in the browser");
        await session.setCheckbox(fixture.columns[1].label, true);

        assert.ok(
          await session.isChecked(fixture.columns[1].label),
          "the box took the tick"
        );

        await session.clickButton("Submit");
        await session.expectToast("was created");

        const ticked = await waitForRowText(session, "ticked in the browser", "Yes");

        assert.ok(ticked, "the row written from the browser is listed");
        assert.ok(
          ticked.some((cell) => cell === "Yes"),
          `a tick made in the browser is stored as true: ${ticked.join(" | ")}`
        );
      },
    },
    {
      name: "a toggle renders as a switch and says which way round it is",
      screen: "/records/:tableId",
      fn: async ({ session, adminApi, assert, isolate }) => {
        const fixture = await buildMappedTable({
          adminApi,
          isolate,
          name: "Switched",
          specs: [
            { name: "Name", dataType: "text" },
            {
              name: "Enabled",
              dataType: "toggle",
              config: { trueLabel: "Live", falseLabel: "Draft" },
            },
          ],
        });

        const nameColumnKey = fixture.columns[0].columnKey;
        const flagColumnKey = fixture.columns[1].columnKey;

        await openEntry(session, fixture);

        const control = await session.control(fixture.columns[1].label);

        assert.eq(
          await control.getAttribute("type"),
          "checkbox",
          "a switch is still a checkbox underneath, so it stays keyboard and screen reader operable"
        );
        assert.includesText(
          await control.getAttribute("class"),
          "appearance-none",
          "the native box is hidden and a switch track is drawn over it"
        );

        assert.includesText(await dialogText(session), "Draft", "the off state is named beside the switch");

        await session.setCheckbox(fixture.columns[1].label, true);

        assert.ok(
          await session.isChecked(fixture.columns[1].label),
          "the switch took the change"
        );
        assert.includesText(
          await dialogText(session),
          "Live",
          "and the on state replaces the off state once it is thrown"
        );

        await session.fill(fixture.columns[0].label, "switched on");
        await session.clickButton("Submit");
        await session.expectToast("was created");

        const stored = await adminApi.expectOk(
          adminApi.get(`/tables/${fixture.tableId}/records?search=switched`),
          "read back the row the browser wrote"
        );

        const row = (stored ?? [])[0];

        assert.ok(row, "the row the browser wrote is retrievable");
        assert.eq(
          row.values[nameColumnKey],
          "switched on",
          "the text typed beside the switch is the row that was found"
        );
        assert.eq(
          row.values[flagColumnKey],
          true,
          "the switch stored a boolean true, not the string it was drawn from"
        );

        /*
         * The two boolean presentations share one storage family, so a toggle
         * field is mappable onto a checkbox column. That is a documented rule
         * and worth proving rather than assuming.
         */
        const twin = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${fixture.tableId}/columns`, {
            label: isolate.label("Checkbox twin"),
            key: isolate.key("checkbox_twin"),
            dataType: "checkbox",
          }),
          "add a checkbox column to the switched table"
        );

        const report = await adminApi.expectOk(
          adminApi.get(
            `/admin/mappings/compatibility?formId=${fixture.formId}&tableId=${fixture.tableId}`
          ),
          "ask whether the switch field can land in a checkbox column"
        );

        const fieldEntry = (report.compatibility ?? []).find(
          (entry) => Number(entry.formFieldId) === Number(fixture.columns[1].formFieldId)
        );

        assert.ok(fieldEntry, "the compatibility report covers the toggle field");

        const twinVerdict = (fieldEntry.columns ?? []).find(
          (verdict) => Number(verdict.columnId) === Number(twin.id)
        );

        assert.ok(twinVerdict, "and it considered the checkbox column");
        assert.eq(
          twinVerdict.compatible,
          true,
          `a toggle field may be stored in a checkbox column (${twinVerdict.reason})`
        );
      },
    },
    {
      name: "a relation column is configured by choosing the table it points at",
      screen: "/admin/tables/:id",
      area: "Relations — record_reference",
      fn: async ({ session, adminApi, assert, isolate, target }) => {
        const label = isolate.label("Relation host");
        const key = isolate.key("relation_host");

        await createTable(session, { label, key });
        await openTableDetail(session, label);

        await session.clickButton("Add column");
        await session.openDialog("New column");

        const columnLabel = isolate.label("Belongs to branch");
        const columnKey = isolate.key("belongs_to_branch");

        await session.fill("column-label", columnLabel);
        await session.fill("column-key", columnKey);
        await session.selectOption("column-data-type", "Record reference");

        /*
         * The settings for the chosen type come from the registry, not from a
         * hard-coded branch in the dialog, so their appearance is itself a
         * contract worth asserting.
         */
        await session.driver.wait(
          async (driver) => {
            const found = await driver.findElements(
              By.xpath(
                '//div[@role="dialog"]//legend[contains(normalize-space(),"Record reference settings")]'
              )
            );

            return found.length ? found[0] : undefined;
          },
          10000,
          "choosing the relation type never revealed its settings group"
        );

        const tableOptions = await waitForOptions(session, "Target table", target.tableLabel);

        assert.ok(
          tableOptions.some((option) => option === target.tableLabel),
          `the target picker offers the tables that exist: ${tableOptions.join(" | ")}`
        );
        assert.ok(
          !tableOptions.some((option) => option === "Users"),
          "the authentication table is not offered as a relation target"
        );

        /*
         * Pointing a table at itself would make every record its own parent, so
         * the server refuses it. Trying it through the dialog proves the refusal
         * is reported where the administrator can act on it.
         */
        await session.selectOption("Target table", label);
        await session.submitDialog();

        const errors = await dialogError(session);

        assert.ok(
          errors.some((message) => /itself/i.test(message)),
          `a self relation is refused and the reason reaches the dialog (${errors.join(" | ")})`
        );

        await session.selectOption("Target table", target.tableLabel);
        await session.fill("Display column key", target.columns[0].columnKey);
        await session.setCheckbox("Allow multiple selections", false);
        await session.submitDialog();
        await session.expectToast("was added");
        await session.waitItem(columnLabel);

        const path = await session.pathname();
        const hostTableId = Number(path.split("/").at(-1));

        const columns = await adminApi.expectOk(
          adminApi.get(`/admin/tables/${hostTableId}/columns`),
          "read the columns back"
        );

        const stored = (columns ?? []).find((column) => column.key === columnKey);

        assert.ok(stored, "the relation column was stored");
        assert.eq(stored.dataType, "record_reference", "as a relation");
        assert.eq(
          Number(stored.relationTableId),
          Number(target.tableId),
          "pointing at the table that was chosen"
        );
        assert.eq(
          Number(stored.config?.targetTableId),
          Number(target.tableId),
          "and the configuration carries the same target"
        );
        assert.eq(
          stored.config?.targetDisplayColumnKey,
          target.columns[0].columnKey,
          "the display column the administrator named is kept"
        );
        assert.eq(stored.config?.allowMultiple, false, "single selection is the default");
      },
    },
    {
      name: "a relation value must point at a record that exists and is still active",
      screen: "/records/:tableId",
      area: "Relations — record_reference",
      fn: async ({ session, adminApi, assert, isolate, target, targetRecord }) => {
        const fixture = await buildMappedTable({
          adminApi,
          isolate,
          name: "Staff",
          specs: [
            { name: "Who", dataType: "text" },
            {
              name: "Branch",
              dataType: "record_reference",
              config: { targetTableId: target.tableId },
            },
          ],
        });

        const whoKey = fixture.columns[0].key;
        const branchKey = fixture.columns[1].key;
        const branchColumnKey = fixture.columns[1].columnKey;

        const missing = await refusal(adminApi, fixture, {
          [whoKey]: "ghost",
          [branchKey]: 999999999,
        });

        assert.eq(missing.status, 400, "a relation to a record that does not exist is refused");
        assert.includesText(
          JSON.stringify(missing.body),
          "points at a record that does not exist",
          "and the refusal says which value is at fault"
        );

        const shaped = await refusal(adminApi, fixture, {
          [whoKey]: "shaped",
          [branchKey]: "not-an-id",
        });

        assert.eq(shaped.status, 400, "a relation value that is not an id is refused");
        assert.includesText(
          JSON.stringify(shaped.body),
          "must reference an existing record",
          "because a label is not an identifier"
        );

        const stored = await storeAndRead(adminApi, fixture, {
          [whoKey]: "linked",
          [branchKey]: targetRecord.id,
        });

        assert.eq(
          Number(stored.values[branchColumnKey]),
          Number(targetRecord.id),
          "the relation stores the target record's id"
        );

        /*
         * `stored` lives in this table, so its id proves the check is scoped to
         * the target: an id that exists somewhere is not an id that exists there.
         */
        const elsewhere = await refusal(adminApi, fixture, {
          [whoKey]: "elsewhere",
          [branchKey]: stored.id,
        });

        assert.eq(
          elsewhere.status,
          400,
          "an id belonging to a different table is not accepted just because it exists"
        );

        await session.goto(`/records/${fixture.tableId}`);

        const cells = await waitForRowText(session, "linked", "BR-1");

        assert.ok(cells, "the linked row is listed");
        assert.ok(
          cells.some((cell) => cell === "BR-1"),
          `the list shows the target's own display value, not a bare id: ${cells.join(" | ")}`
        );

        await session.clickButton("New record");
        await session.anyDialogTitle("record");

        const options = await waitForOptions(session, fixture.columns[1].label, "BR-1");

        assert.ok(
          options.some((option) => option === "BR-1"),
          `the picker offers the target table's records: ${options.join(" | ")}`
        );

        await session.fill(fixture.columns[0].label, "picked in the browser");
        await session.selectOption(fixture.columns[1].label, "BR-1");
        await session.clickButton("Submit");
        await session.expectToast("was created");

        await session.waitRow("picked in the browser");

        const picked = await adminApi.expectOk(
          adminApi.get(`/tables/${fixture.tableId}/records?search=picked`),
          "read back the row the browser wrote"
        );

        assert.eq(
          Number(picked[0]?.values[branchColumnKey]),
          Number(targetRecord.id),
          "the id chosen in the picker is the one stored"
        );

        /*
         * A record of its own, so archiving it cannot disturb the target the
         * rest of the suite points at.
         */
        const doomed = await storeRecord(adminApi, target, {
          [target.columns[0].key]: "BR-DOOMED",
        });

        await adminApi.expectOk(
          adminApi.del(`/tables/${target.tableId}/records/${doomed.id}`),
          "archive the record the next submission will point at"
        );

        const afterArchive = await refusal(adminApi, fixture, {
          [whoKey]: "too late",
          [branchKey]: doomed.id,
        });

        assert.eq(
          afterArchive.status,
          400,
          "an archived record can no longer be chosen as a relation target"
        );

        const stillLinked = await adminApi.expectOk(
          adminApi.get(`/tables/${fixture.tableId}/records/${stored.id}`),
          "read the row that was linked before the archive"
        );

        assert.eq(
          Number(stillLinked.values[branchColumnKey]),
          Number(targetRecord.id),
          "archiving a target does not rewrite the relations that already point at it"
        );
      },
    },
    {
      name: "a multi-select relation stores a list and offers every candidate",
      screen: "/records/:tableId",
      area: "Relations — record_reference",
      fn: async ({ session, adminApi, assert, isolate, target, targetRecord }) => {
        const second = await storeRecord(adminApi, target, {
          [target.columns[0].key]: "BR-2",
        });

        const fixture = await buildMappedTable({
          adminApi,
          isolate,
          name: "Crew",
          specs: [
            { name: "Team", dataType: "text" },
            {
              name: "Branches",
              dataType: "record_reference",
              config: { targetTableId: target.tableId, allowMultiple: true },
            },
          ],
        });

        const teamKey = fixture.columns[0].key;
        const branchesKey = fixture.columns[1].key;
        const branchesColumnKey = fixture.columns[1].columnKey;

        const scalar = await refusal(adminApi, fixture, {
          [teamKey]: "scalar",
          [branchesKey]: targetRecord.id,
        });

        assert.eq(scalar.status, 400, "a column that accepts several records refuses a bare id");
        assert.includesText(
          JSON.stringify(scalar.body),
          "must be a list of selected records",
          "and says a list is what it wants"
        );

        const stored = await storeAndRead(adminApi, fixture, {
          [teamKey]: "both branches",
          [branchesKey]: [targetRecord.id, second.id],
        });

        const kept = stored.values[branchesColumnKey];

        assert.ok(Array.isArray(kept), "the relation stored a list");
        assert.eq(kept.length, 2, `both ids survived: ${JSON.stringify(kept)}`);

        const duplicated = await storeAndRead(adminApi, fixture, {
          [teamKey]: "same twice",
          [branchesKey]: [second.id, second.id, String(second.id)],
        });

        assert.eq(
          duplicated.values[branchesColumnKey].length,
          1,
          `the same record listed three times is stored once: ${JSON.stringify(
            duplicated.values[branchesColumnKey]
          )}`
        );

        const partial = await refusal(adminApi, fixture, {
          [teamKey]: "one is missing",
          [branchesKey]: [999999999, second.id],
        });

        assert.eq(
          partial.status,
          400,
          "one unreachable id in a list refuses the whole submission rather than storing half of it"
        );

        await openEntry(session, fixture);

        await session.driver.wait(
          async (driver) => {
            const found = await driver.findElements(
              By.xpath('//div[@role="dialog"]//ul//input[@type="checkbox"]')
            );

            return found.length >= 2 ? found : undefined;
          },
          10000,
          "a multiple relation never rendered one tick box per candidate"
        );

        const boxes = await session.driver.findElements(
          By.xpath('//div[@role="dialog"]//ul//input[@type="checkbox"]')
        );

        await session.fill(fixture.columns[0].label, "ticked twice");
        await boxes[0].click();
        await boxes[1].click();
        await session.step("tick two candidates");

        await session.clickButton("Submit");
        await session.expectToast("was created");

        const written = await adminApi.expectOk(
          adminApi.get(`/tables/${fixture.tableId}/records?search=ticked`),
          "read back the row the browser wrote"
        );

        const chosen = written[0]?.values[branchesColumnKey];

        assert.ok(Array.isArray(chosen), "the browser submitted a list");
        assert.eq(chosen.length, 2, `both ticks were stored: ${JSON.stringify(chosen)}`);

        await session.goto(`/records/${fixture.tableId}`);

        const cells = await waitForRowText(session, "ticked twice", "BR-");

        assert.ok(cells, "the row written from the browser is listed");
        assert.ok(
          cells.some((cell) => cell.includes("BR-1") && cell.includes("BR-2")),
          `both targets are readable in the one cell: ${cells.join(" | ")}`
        );
      },
    },
    {
      name: "a relation only maps onto a column that points at the same table the same way",
      screen: "/admin/mappings",
      area: "Relations — record_reference",
      fn: async ({ adminApi, assert, isolate, target }) => {
        const depot = await buildMappedTable({
          adminApi,
          isolate,
          name: "Depot",
          specs: [{ name: "Code", dataType: "text", value: "DP-1" }],
        });

        /*
         * One form field pointing at the branch table, and three columns to try
         * it against: a text column, a relation to a different table, and a
         * relation to the right table that accepts several records.
         */
        const crossed = await buildMappedTable({
          adminApi,
          isolate,
          name: "Crossed",
          specs: [
            {
              name: "Branch",
              dataType: "record_reference",
              config: { targetTableId: target.tableId },
            },
          ],
        });

        const toOtherTable = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${depot.tableId}/columns`, {
            label: isolate.label("Depot relation"),
            key: isolate.key("depot_relation"),
            dataType: "record_reference",
            config: { targetTableId: crossed.tableId },
          }),
          "add a relation column that points at a different table"
        );

        const multiple = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${depot.tableId}/columns`, {
            label: isolate.label("Many branches"),
            key: isolate.key("many_branches"),
            dataType: "record_reference",
            config: { targetTableId: target.tableId, allowMultiple: true },
          }),
          "add a relation column that accepts several records"
        );

        const report = await adminApi.expectOk(
          adminApi.get(
            `/admin/mappings/compatibility?formId=${crossed.formId}&tableId=${depot.tableId}`
          ),
          "ask whether the pair can be mapped"
        );

        const fieldEntry = (report.compatibility ?? []).find(
          (entry) => Number(entry.formFieldId) === Number(crossed.columns[0].formFieldId)
        );

        assert.ok(fieldEntry, "the report covers the relation field");

        const verdictFor = (columnId) =>
          (fieldEntry.columns ?? []).find(
            (verdict) => Number(verdict.columnId) === Number(columnId)
          );

        const wrongTable = verdictFor(toOtherTable.id);

        assert.ok(wrongTable, "the report considered the column pointing elsewhere");
        assert.eq(wrongTable.compatible, false, "a relation cannot cross onto a different target");
        assert.includesText(
          String(wrongTable.reason),
          "same table",
          "and the reason names the rule"
        );

        const wrongShape = verdictFor(multiple.id);

        assert.ok(wrongShape, "the report considered the multi-select column");
        assert.eq(wrongShape.compatible, false, "single and multiple selection cannot be mixed");
        assert.includesText(
          String(wrongShape.reason),
          "cannot be mixed",
          "and the reason says which half does not fit"
        );

        const textColumn = verdictFor(depot.columns[0].columnId);

        assert.ok(textColumn, "the report considered the plain text column");
        assert.eq(textColumn.compatible, false, "a relation cannot land in a text column");
        assert.includesText(
          String(textColumn.reason),
          "cannot be stored",
          "and the reason is about the storage family"
        );

        /*
         * The positive control: the field the fixture already mapped is reported
         * compatible, so the refusals above are about the pair and not a report
         * that says no to everything.
         */
        const matching = await adminApi.expectOk(
          adminApi.get(
            `/admin/mappings/compatibility?formId=${crossed.formId}&tableId=${crossed.tableId}`
          ),
          "ask about the pair the fixture already mapped"
        );

        const matchingField = (matching.compatibility ?? []).find(
          (entry) => Number(entry.formFieldId) === Number(crossed.columns[0].formFieldId)
        );

        const matchingColumn = (matchingField?.columns ?? []).find(
          (verdict) => Number(verdict.columnId) === Number(crossed.columns[0].columnId)
        );

        assert.ok(matchingColumn, "the report covers the column the fixture mapped");
        assert.eq(matchingColumn.compatible, true, "a relation onto its own twin is compatible");
      },
    },
    {
      name: "entity_reference and user_reference enforce mapping compatibility rules",
      screen: "/admin/mappings",
      area: "Relations — entity_reference & user_reference",
      fn: async ({ adminApi, assert, isolate }) => {
        const entityType = await adminApi.expectOk(
          adminApi.post("/organization/entity-types", {
            label: isolate.label("Division"),
            key: isolate.key("division"),
          }),
          "create entity type"
        );

        const otherEntityType = await adminApi.expectOk(
          adminApi.post("/organization/entity-types", {
            label: isolate.label("Squad"),
            key: isolate.key("squad"),
          }),
          "create other entity type"
        );

        const testTable = await buildMappedTable({
          adminApi,
          isolate,
          name: "Project",
          specs: [
            {
              name: "Org Unit",
              dataType: "entity_reference",
              config: { entityTypeId: entityType.id },
            },
            {
              name: "Assignee",
              dataType: "user_reference",
            },
          ],
        });

        const mismatchCol = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${testTable.tableId}/columns`, {
            label: isolate.label("Wrong Entity Type"),
            key: isolate.key("wrong_entity"),
            dataType: "entity_reference",
            config: { entityTypeId: otherEntityType.id },
          }),
          "add mismatching entity reference column"
        );

        const textCol = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${testTable.tableId}/columns`, {
            label: isolate.label("Plain Text Col"),
            key: isolate.key("plain_text"),
            dataType: "text",
          }),
          "add plain text column"
        );

        const report = await adminApi.expectOk(
          adminApi.get(
            `/admin/mappings/compatibility?formId=${testTable.formId}&tableId=${testTable.tableId}`
          ),
          "check mapping compatibility report"
        );

        const entityField = (report.compatibility ?? []).find(
          (entry) => Number(entry.formFieldId) === Number(testTable.columns[0].formFieldId)
        );
        assert.ok(entityField, "report covers entity_reference field");

        const matchingColVerdict = (entityField.columns ?? []).find(
          (v) => Number(v.columnId) === Number(testTable.columns[0].columnId)
        );
        assert.ok(matchingColVerdict, "verdict found for matching entity reference column");
        assert.eq(matchingColVerdict.compatible, true, "entity_reference with same entity type is compatible");

        const mismatchColVerdict = (entityField.columns ?? []).find(
          (v) => Number(v.columnId) === Number(mismatchCol.id)
        );
        assert.ok(mismatchColVerdict, "verdict found for mismatching entity reference column");
        assert.eq(mismatchColVerdict.compatible, false, "entity_reference with different entity type is rejected");

        const textColVerdict = (entityField.columns ?? []).find(
          (v) => Number(v.columnId) === Number(textCol.id)
        );
        assert.ok(textColVerdict, "verdict found for text column against entity_reference");
        assert.eq(textColVerdict.compatible, false, "entity_reference cannot map to text column");

        const userField = (report.compatibility ?? []).find(
          (entry) => Number(entry.formFieldId) === Number(testTable.columns[1].formFieldId)
        );
        assert.ok(userField, "report covers user_reference field");

        const matchingUserVerdict = (userField.columns ?? []).find(
          (v) => Number(v.columnId) === Number(testTable.columns[1].columnId)
        );
        assert.ok(matchingUserVerdict, "verdict found for matching user reference column");
        assert.eq(matchingUserVerdict.compatible, true, "user_reference onto user_reference column is compatible");

        const userToTextVerdict = (userField.columns ?? []).find(
          (v) => Number(v.columnId) === Number(textCol.id)
        );
        assert.ok(userToTextVerdict, "verdict found for text column against user_reference");
        assert.eq(userToTextVerdict.compatible, false, "user_reference cannot map to text column");
      },
    },
    {
      name: "phone data type accepts valid numeric digits, rejects non-numeric input, and persists values",
      fn: async ({ adminApi, assert, isolate }) => {
        const table = await adminApi.expectOk(
          adminApi.post("/admin/tables", {
            label: isolate.label("Contact Directory"),
            key: isolate.key("contacts_table"),
          })
        );

        // 1. Add phone column
        const phoneCol = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${table.id}/columns`, {
            label: "Phone Number",
            key: isolate.key("phone_number"),
            dataType: "phone",
          })
        );
        assert.eq(phoneCol.dataType, "phone", "column created with data_type phone");

        // 2. Reject non-numeric phone values
        const invalidRecord = await adminApi.post(`/tables/${table.id}/records`, {
          values: {
            [phoneCol.key]: "98765-abcd",
          },
        });
        assert.eq(
          invalidRecord.status,
          400,
          "non-numeric phone string is rejected with HTTP 400 Bad Request"
        );

        // 3. Accept valid numeric phone value
        const validRecord = await adminApi.expectOk(
          adminApi.post(`/tables/${table.id}/records`, {
            values: {
              [phoneCol.key]: "9876543210",
            },
          })
        );
        assert.eq(
          validRecord.values?.[phoneCol.key],
          "9876543210",
          "valid numeric phone number stored and retrieved"
        );

        // 4. Update with another valid phone number
        const updatedRecord = await adminApi.expectOk(
          adminApi.patch(`/tables/${table.id}/records/${validRecord.id}`, {
            values: {
              [phoneCol.key]: "1234567890",
            },
          })
        );
        assert.eq(
          updatedRecord.values?.[phoneCol.key],
          "1234567890",
          "phone number successfully updated"
        );
      },
    },
  ],
};
