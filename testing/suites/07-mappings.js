import { By } from "selenium-webdriver";

export default {
  name: "mappings",
  area: "Administration — form to table mappings",

  /*
   * The connector is keyed by the form/table pair, so every test in this suite
   * works on one pair built here through the API. Their ids come from the
   * creation responses rather than from a search, which keeps a failed lookup
   * from being mistaken for a broken product.
   */
  setup: async ({ adminApi, isolate }) => {
    const fieldLabel = isolate.label("Travel notes");
    const columnLabel = isolate.label("travel_notes");
    const formLabel = isolate.label("Travel form");
    const tableLabel = isolate.label("Travel log");

    const field = await adminApi.expectOk(
      adminApi.post("/admin/fields", {
        label: fieldLabel,
        key: isolate.key("travel_notes"),
        dataType: "text",
      }),
      "create the form field"
    );

    const form = await adminApi.expectOk(
      adminApi.post("/admin/forms", {
        label: formLabel,
        key: isolate.key("travel_form"),
        fields: [{ fieldId: field.id }],
      }),
      "create the travel form"
    );

    const table = await adminApi.expectOk(
      adminApi.post("/admin/tables", {
        label: tableLabel,
        key: isolate.key("travel_log"),
      }),
      "create the travel table"
    );

    const column = await adminApi.expectOk(
      adminApi.post(`/admin/tables/${table.id}/columns`, {
        label: columnLabel,
        key: isolate.key("travel_notes_column"),
        dataType: "text",
      }),
      "create the travel column"
    );

    return {
      travel: {
        fieldLabel,
        formId: form.id,
        formLabel,
        tableId: table.id,
        tableLabel,
        columnId: column.id,
        columnLabel,
      },
    };
  },

  tests: [
    {
      name: "a mapping is created between a form and a table and reports its connections",
      screen: "/admin/mappings/connect",
      fn: async ({ session, assert, isolate, travel }) => {
        await session.goto("/admin/mappings");
        await session.clickButton("New mapping");
        await session.openDialog("New mapping");

        const submit = await session.driver.findElement(
          By.xpath('//div[@role="dialog"]//button[@type="submit"]')
        );

        assert.ok(
          (await submit.isEnabled()) === false,
          "the picker waits for both a form and a table"
        );

        await session.selectOption("mapping-picker-form", travel.formLabel);
        await session.selectOption("mapping-picker-table", travel.tableLabel);
        await session.submitDialog();

        await session.waitPath("/admin/mappings/connect");
        assert.eq(await session.heading(), "Connect form to table", "the editor opened");

        await session.selectOption(travel.fieldLabel, travel.columnLabel);
        await session.clickButton("Save mapping");
        await session.expectToast("mapping was saved");

        await session.goto("/admin/mappings");
        await session.fill("Search mappings", travel.tableLabel);
        await session.waitForRows();

        const cells = await session.rowCells(travel.formLabel);

        assert.ok(cells, `the saved mapping is listed for that form: ${JSON.stringify(cells)}`);

        const connections = await session.columnHeaderIndex("Connections");

        assert.ok(connections !== null, "the list has a Connections column");
        assert.eq(
          cells[connections],
          "1",
          `the Connections column counts the saved pair: ${JSON.stringify(cells)}`
        );
      },
    },
    {
      name: "a column of an incompatible type cannot receive the field value",
      screen: "/admin/mappings/connect",
      fn: async ({ session, assert, isolate, adminApi, travel }) => {
        const blocked = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${travel.tableId}/columns`, {
            label: isolate.label("travel_date"),
            key: isolate.key("travel_date_column"),
            dataType: "date",
          }),
          "add a date column that the text field cannot fill"
        );

        await session.goto(`/admin/mappings/connect?formId=${travel.formId}&tableId=${travel.tableId}`);
        await session.waitForApp();
        await session.step("opened the editor for the pair");

        await session.driver.wait(
          async (driver) =>
            (await driver.findElements(By.xpath(`//label[normalize-space()="${travel.fieldLabel}"]`))).length
              ? true
              : undefined,
          10000,
          "the connector never listed the form field"
        );

        const labels = await session.optionLabels(travel.fieldLabel);

        assert.ok(
          labels.some((label) => label.includes(travel.columnLabel)),
          `the compatible column is offered: ${labels.join(" | ")}`
        );

        const refusal = labels.find((label) => label.includes(blocked.label));

        assert.ok(
          refusal && refusal !== blocked.label,
          `the incompatible column carries a reason instead of being silently dropped: ${JSON.stringify(labels)}`
        );

        /*
         * The reason is the server's own verdict text, read off the option rather
         * than off the page: a closed <select> does not reliably contribute its
         * unchosen options to the rendered text of <main>.
         */
        assert.includesText(
          refusal,
          "cannot",
          `the offered choice says why the pairing is refused: ${refusal}`
        );

        const control = await session.control(travel.fieldLabel);
        const options = await control.findElements(By.css("option"));

        let seenBlocked = 0;

        for (const option of options) {
          if ((await option.getText()).includes(blocked.label)) {
            seenBlocked += 1;

            assert.ok(
              (await option.getAttribute("disabled")) !== null,
              `the blocked pairing is a disabled option: ${await option.getText()}`
            );
          }
        }

        assert.eq(seenBlocked, 1, "the blocked column is offered exactly once");
      },
    },
    {
      name: "an unmapped required column is flagged before the mapping is saved",
      screen: "/admin/mappings/connect",
      fn: async ({ session, assert, isolate, adminApi, travel }) => {
        const required = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${travel.tableId}/columns`, {
            label: isolate.label("travel_must_fill"),
            key: isolate.key("travel_must_fill"),
            dataType: "text",
            isRequired: true,
          }),
          "add a required column that no field is mapped to"
        );

        await session.goto(`/admin/mappings/connect?formId=${travel.formId}&tableId=${travel.tableId}`);
        await session.waitForApp();
        await session.step("reopened the editor");

        const warning = await session.driver
          .wait(
            async (driver) => {
              const panels = await driver.findElements(
                By.xpath('//div[contains(@class,"border-warning")]')
              );

              for (const panel of panels) {
                const text = (await panel.getText()).trim();

                if (text) {
                  return text;
                }
              }

              return undefined;
            },
            10000,
            "no warning panel appeared"
          )
          .catch(() => null);

        assert.ok(warning, `the editor warns about the unmapped column: ${warning}`);
        assert.includesText(warning, "required", "the warning names the problem");
        assert.includesText(warning, required.label, "the warning names the column");

        await session.clickButton("Save mapping");

        const toast = await session.expectToast("saved with warnings");

        assert.includesText(toast, required.label, `the save repeats the warning: ${toast}`);
      },
    },
    {
      name: "a mapping can be archived again",
      screen: "/admin/mappings",
      fn: async ({ session, assert, travel }) => {
        await session.goto("/admin/mappings");
        await session.fill("Search mappings", travel.formLabel);
        await session.waitForRows();

        await session.clickInRow(travel.formLabel, "Archive");

        await session.openDialog("Archive mapping");
        await session.clickButton("Archive mapping");
        await session.expectToast("was archived");

        await session.selectOption("mappings-status", "Archived");
        await session.driver.sleep(700);
        await session.waitForRows();

        assert.ok(
          await session.rowExists(travel.formLabel),
          "the archived mapping is reachable through the status filter"
        );
      },
    },
    {
      name: "the API refuses a mapping between a form and a table that cannot meet",
      fn: async ({ adminApi, assert, isolate, travel }) => {
        const rejected = await adminApi.put("/admin/mappings", {
          formId: 999999,
          tableId: 999999,
          entries: [],
        });

        assert.ok(
          rejected.status >= 400 && rejected.status < 500,
          `an unknown pair is refused with a client error (${rejected.status} ${JSON.stringify(rejected.body).slice(0, 200)})`
        );
        assert.ok(
          !/SQL|ER_NO|stack/i.test(JSON.stringify(rejected.body)),
          `the refusal carries no internals: ${JSON.stringify(rejected.body).slice(0, 200)}`
        );

        const malformed = await adminApi.put("/admin/mappings", {
          formId: isolate.key("travel_form"),
          tableId: "not-a-number",
        });

        assert.eq(malformed.status, 400, "non numeric ids are a validation failure");

        const foreign = await adminApi.put("/admin/mappings", {
          formId: travel.formId,
          tableId: travel.tableId + 99999,
          entries: [],
        });

        assert.ok(
          foreign.status >= 400 && foreign.status < 500,
          `a real form against a missing table is refused (${foreign.status})`
        );
      },
    },
  ],
};
