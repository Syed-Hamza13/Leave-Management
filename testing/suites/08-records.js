import { By } from "selenium-webdriver";

import { buildDropdown, buildMappedTable } from "../lib/fixtures.js";

/*
 * The record surface is where a definition becomes a value, so this suite drives
 * one complete managed table through the browser: entry through the mapped form,
 * search, sort, facet filters, pagination and archive. The mapped pair is built
 * through the API first because the builders have their own suite.
 */
export default {
  name: "records",
  area: "Records — typed entry, search, filter, sort",
  async setup({ adminApi, isolate }) {
    const fixture = await buildMappedTable({
      adminApi,
      isolate,
      name: "Visit",
      specs: [
        { name: "Notes", dataType: "text", value: "zeta-note" },
        { name: "Count", dataType: "number", value: 4242 },
        { name: "Day", dataType: "date", value: "2026-03-04" },
      ],
    });

    return { fixture };
  },
  tests: [
    {
      name: "only administrator-defined tables are offered for browsing",
      screen: "/records",
      fn: async ({ session, assert, fixture }) => {
        await session.goto("/records");

        assert.ok(
          await session.exists(By.xpath(`//a[@href="/records/${fixture.tableId}"]`)),
          "the new managed table is linked from the index"
        );
        assert.ok(
          !(await session.itemExists("Users")),
          "the protected system table is not offered for record entry"
        );
      },
    },
    {
      name: "a record entered through the mapped form lands in the intended columns",
      screen: "/records/:tableId",
      fn: async ({ session, assert, fixture }) => {
        await session.goto(`/records/${fixture.tableId}`);
        await session.clickButton("New record");
        await session.anyDialogTitle("record");

        for (const column of fixture.columns) {
          await session.fill(column.label, column.value);
        }

        await session.clickButton("Submit");
        await session.expectToast("was created");

        await session.waitForRows();

        const cells = await session.rowCells(String(columnValue(fixture, "Notes")));

        assert.ok(cells, "the new row is listed");

        const [notes, count, day] = fixture.columns.map((column) =>
          String(column.value)
        );

        assert.eq(cells[0], notes, "the text value sits in the text column");
        assert.eq(cells[1], count, "the number value sits in the number column");
        assert.eq(cells[2], day, "the date value sits in the date column");
      },
    },
    {
      name: "a required field refuses an empty submission in the browser and on the server",
      screen: "/records/:tableId",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const requiredFixture = await buildMappedTable({
          adminApi,
          isolate,
          name: "Required",
          specs: [{ name: "Mustfill", dataType: "text", isRequired: true }],
        });

        await session.goto(`/records/${requiredFixture.tableId}`);
        await session.clickButton("New record");

        await session.clickButton("Submit");

        const blocked = await session.formSubmissionBlocked();

        assert.ok(
          blocked.reported,
          `the browser refuses to submit the required field empty (${blocked.reason})`
        );
        assert.ok(
          await session.exists(By.css('[role="dialog"]')),
          "the entry dialog stays open with the value still unsaved"
        );

        /*
         * The same rule has to hold for a client that never renders the form.
         */
        const rejected = await adminApi.post(`/tables/${requiredFixture.tableId}/records`, {
          formId: requiredFixture.formId,
          values: {},
        });

        assert.eq(rejected.status, 400, "the API refuses a missing required column");
        assert.includesText(
          JSON.stringify(rejected.body),
          "required",
          "the API names the required column"
        );
      },
    },
    {
      name: "search narrows the list to the rows that carry the text",
      screen: "/records/:tableId",
      fn: async ({ session, assert, fixture, adminApi }) => {
        await adminApi.expectOk(
          adminApi.post(`/tables/${fixture.tableId}/records`, {
            formId: fixture.formId,
            values: { ...fixture.values, [fixture.columns[0].key]: "aaa other note" },
          }),
          "add a second row for the search to separate"
        );

        await session.goto(`/records/${fixture.tableId}`);
        await session.waitForRows();

        assert.ok(
          (await session.driver.findElements(By.css("table tbody tr"))).length >= 2,
          "both rows are listed before the search"
        );

        await session.fill("Search records", "zeta-note");
        await session.driver.sleep(1200);

        assert.ok(await session.rowExists("zeta-note"), "the matching row survives the search");
        assert.ok(
          !(await session.rowExists("aaa other note")),
          "the other row is filtered out by the search"
        );

        await session.fill("Search records", "nothing matches this text");
        await session.driver.sleep(1200);

        await session.waitForText("No records match");

        await session.fill("Search records", "");
        await session.driver.sleep(1200);

        assert.ok(
          await session.rowExists("aaa other note"),
          "clearing the search brings the rows back"
        );
      },
    },
    {
      name: "sorting by a header reorders the rows and reports the direction",
      screen: "/records/:tableId",
      fn: async ({ session, assert, fixture }) => {
        const notesColumn = fixture.columns[0].columnLabel;

        await session.goto(`/records/${fixture.tableId}`);
        await session.waitForRows();

        await session.clickHeaderSort(notesColumn);

        assert.eq(await session.ariaSort(notesColumn), "ascending", "the header reports ascending");

        const first = await session.driver.findElements(By.css("table tbody tr"));
        const firstText = (await first[0].getText()).replace(/\s+/g, " ");

        assert.ok(
          firstText.includes("aaa other note"),
          `the smallest value is first: ${firstText}`
        );

        await session.clickHeaderSort(notesColumn);

        assert.eq(await session.ariaSort(notesColumn), "descending", "a second click reverses it");
      },
    },
    {
      name: "the filter dialog waits for a value, then offers stored values as facets",
      screen: "/records/:tableId",
      fn: async ({ session, assert, fixture }) => {
        const notesColumn = fixture.columns[0].columnLabel;

        await session.goto(`/records/${fixture.tableId}`);
        await session.waitForRows();

        await session.clickButton("Filter");
        await session.anyDialogTitle("Filter");

        const apply = await session.findButton("Apply filter");

        assert.ok(
          await apply.isEnabled() === false,
          "the filter cannot be applied before a value is chosen"
        );

        await session.fill(notesColumn, "zeta");

        assert.ok(
          await (await session.findButton("Apply filter")).isEnabled(),
          "typing a value enables the filter"
        );

        // Back to an empty draft, then switch to the facet operator.
        await session.fill(notesColumn, "");

        const selects = await session.driver.findElements(
          By.xpath('//div[@role="dialog"]//select')
        );

        assert.ok(selects.length >= 2, "the dialog offers a column picker and an operator picker");

        const options = await selects[1].findElements(By.css("option"));

        for (const option of options) {
          if ((await option.getText()) === "Is one of") {
            await option.click();
            await session.step("choose the facet operator");
            break;
          }
        }

        const boxes = await session.driver.wait(
          async (driver) => {
            const found = await driver.findElements(
              By.xpath('//div[@role="dialog"]//ul//input[@type="checkbox"]')
            );

            return found.length ? found : undefined;
          },
          10000,
          "the facet list never offered distinct stored values"
        );

        assert.ok(boxes.length >= 1, `the facet list offered ${boxes.length} stored value(s)`);

        await boxes[0].click();
        await session.step("tick a facet value");

        await session.clickButton("Apply filter");

        const chips = await session.driver.findElements(
          By.xpath('//button[.//span[starts-with(normalize-space(),"Remove filter")]]')
        );

        assert.eq(chips.length, 1, "the applied filter is shown as one removable chip");

        const chipText = (await chips[0].getText()).replace(/\s+/g, " ");

        assert.includesText(chipText, "Is one of", "the chip names the operator");

        await session.clickButton("Clear all");
        await session.driver.sleep(1000);

        assert.ok(
          (await session.driver.findElements(By.css("table tbody tr"))).length >= 2,
          "clearing the filter restores the full list"
        );
      },
    },
    {
      name: "the list reports its own page window",
      screen: "/records/:tableId",
      fn: async ({ session, assert, fixture }) => {
        await session.goto(`/records/${fixture.tableId}`);
        await session.waitForRows();

        const summary = await session.paginationSummary();

        assert.includesText(String(summary || ""), "Showing", "the pagination line describes the window");
        assert.includesText(String(summary || ""), "of", "and the total it was taken from");
      },
    },
    {
      name: "archiving a record asks first and then hides it from the active list",
      screen: "/records/:tableId",
      fn: async ({ session, assert, fixture, adminApi }) => {
        const created = await adminApi.expectOk(
          adminApi.post(`/tables/${fixture.tableId}/records`, {
            formId: fixture.formId,
            values: { ...fixture.values, [fixture.columns[0].key]: "row to archive" },
          }),
          "create the row to archive"
        );

        await session.goto(`/records/${fixture.tableId}`);
        await session.waitForRows();

        await session.clickInRow("row to archive", "Archive");
        await session.openDialog("Archive record");
        await session.clickButton("Archive record");
        await session.expectToast("was archived");

        assert.ok(!(await session.rowExists("row to archive")), "the archived row leaves the active list");

        await session.selectOption("records-status", "Archived");
        await session.driver.sleep(1200);

        assert.ok(await session.rowExists("row to archive"), "the archived view still lists it");

        const again = await adminApi.del(`/tables/${fixture.tableId}/records/${created.id}`);

        assert.ok(
          again.status === 404 || again.status === 409 || again.status === 400,
          `a second archive is refused (${again.status})`
        );
      },
    },
    {
      name: "a value that does not fit the column type is refused by the API",
      screen: "/records/:tableId",
      fn: async ({ adminApi, assert, isolate }) => {
        const typed = await buildMappedTable({
          adminApi,
          isolate,
          name: "Typed",
          specs: [
            { name: "Quantity", dataType: "number", config: { min: 1, max: 10 } },
            { name: "When", dataType: "date" },
          ],
        });

        const rejected = await adminApi.post(`/tables/${typed.tableId}/records`, {
          formId: typed.formId,
          values: { [typed.columns[0].key]: "plenty", [typed.columns[1].key]: "yesterday" },
        });

        assert.eq(rejected.status, 400, "a non numeric number and an unparsable date are refused");
        assert.ok(
          !/INSERT|ER_|stack/i.test(JSON.stringify(rejected.body)),
          "the refusal carries no SQL or stack detail"
        );

        const outOfRange = await adminApi.post(`/tables/${typed.tableId}/records`, {
          formId: typed.formId,
          values: { [typed.columns[0].key]: 999, [typed.columns[1].key]: "2026-01-02" },
        });

        assert.eq(outOfRange.status, 400, "the column's own minimum/maximum is enforced");
      },
    },
    {
      name: "an option set feeds the entry picker and the stored value",
      screen: "/records/:tableId",
      fn: async ({ session, adminApi, assert, isolate }) => {
        const options = await buildDropdown({ adminApi, isolate, name: "Choice" });
        const typed = await buildMappedTable({
          adminApi,
          isolate,
          name: "Picked",
          specs: [{ name: "Pick", dataType: "dropdown", dropdownId: options.id }],
        });

        const wrong = await adminApi.post(`/tables/${typed.tableId}/records`, {
          formId: typed.formId,
          values: { [typed.columns[0].key]: "not_an_option" },
        });

        assert.eq(wrong.status, 400, "a value outside the option set is refused");

        await session.goto(`/records/${typed.tableId}`);
        await session.clickButton("New record");

        const labels = await session.optionLabels(typed.columns[0].label);

        assert.ok(
          labels.some((label) => label.includes("Alpha")),
          `the picker offers the option set's own labels: ${labels.join(" | ")}`
        );

        await session.selectOption(typed.columns[0].label, "Alpha");
        await session.clickButton("Submit");
        await session.expectToast("was created");

        assert.ok(await session.waitForRows().then(() => true), "the stored dropdown row is listed");
      },
    },
  ],
};

function columnValue(fixture, name) {
  const column = fixture.columns.find((entry) => entry.name === name);

  return column?.value ?? null;
}
