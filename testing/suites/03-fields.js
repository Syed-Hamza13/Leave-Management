import { By } from "selenium-webdriver";

async function openNewField(session) {
  await session.goto("/admin/fields");
  await session.clickButton("New field");
  return session.openDialog("New field");
}

async function createField(session, { label, key, dataType = "Short text", fillType = true }) {
  const dialog = await openNewField(session);

  await session.fill("field-label", label);
  await session.fill("field-key", key);

  if (fillType) {
    await session.selectOption("field-data-type", dataType);
  }

  await session.clickButton("Create field");
  await session.expectToast("was created");

  return dialog;
}

export default {
  name: "fields",
  area: "Administration — field definitions",
  tests: [
    {
      name: "a text field created in the dialog is listed and survives a reload",
      screen: "/admin/fields",
      fn: async ({ session, assert, isolate }) => {
        const label = isolate.label("Employee number");
        const key = isolate.key("employee_number");

        await createField(session, { label, key });

        await session.waitRow(label);

        await session.reload();
        assert.ok(await session.rowExists(label), "the field is still there after a reload");

        const cells = await session.rowCells(label);

        assert.ok(cells.join(" | ").toLowerCase().includes("text"), `type column shows text: ${cells}`);
        assert.ok(cells.join(" | ").toLowerCase().includes("active"), `status column shows active: ${cells}`);
      },
    },
    {
      name: "an empty label is refused by the API and reported under the field",
      screen: "/admin/fields",
      fn: async ({ session, assert, isolate }) => {
        await openNewField(session);
        await session.fill("field-label", "");
        await session.fill("field-key", isolate.key("empty_label"));
        await session.selectOption("field-data-type", "Short text");
        await session.clickButton("Create field");

        assert.includesText(
          (await session.fieldError("field-label")) || "",
          "Label is required",
          "label field error"
        );
        assert.ok(await session.dialogOpen("New field"), "the dialog stays open on a rejected save");

        await session.closeDialog("New field");
      },
    },
    {
      name: "a malformed key is refused with the documented rule",
      screen: "/admin/fields",
      fn: async ({ session, assert, isolate }) => {
        await openNewField(session);
        await session.fill("field-label", isolate.label("Malformed key field"));
        await session.fill("field-key", "Bad Key With Spaces");
        await session.selectOption("field-data-type", "Short text");
        await session.clickButton("Create field");

        assert.includesText(
          (await session.fieldError("field-key")) || "",
          "Key must be lowercase letters",
          "key field error"
        );

        await session.closeDialog("New field");
      },
    },
    {
      name: "a duplicate key is refused without leaking the database error",
      screen: "/admin/fields",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const key = isolate.key("duplicate_guard");
        const label = isolate.label("Duplicate guard");

        const created = await adminApi.post("/admin/fields", {
          label,
          key,
          dataType: "text",
        });

        assert.eq(created.status, 201, `the API created the first field (${JSON.stringify(created.body).slice(0, 200)})`);

        await openNewField(session);
        await session.fill("field-label", isolate.label("Duplicate guard two"));
        await session.fill("field-key", key);
        await session.selectOption("field-data-type", "Short text");
        await session.clickButton("Create field");

        const alert = await session.anyText(By.css('[role="dialog"] [role="alert"], [role="dialog"] .text-danger-soft'));

        assert.includesText(alert || "", "already in use", "duplicate refusal message");
        assert.ok(
          !/ER_DUP_ENTRY|UNIQUE|mysql|sql/i.test(alert || ""),
          `the message carries no internals: ${alert}`
        );

        await session.closeDialog("New field");
      },
    },
    {
      name: "the chosen data type reveals the settings that belong to it",
      screen: "/admin/fields",
      fn: async ({ session, assert, isolate, driver }) => {
        const selects = () => driver.findElements(By.css('[role="dialog"] select'));

        await openNewField(session);
        await session.fill("field-label", isolate.label("Leave kind"));
        await session.fill("field-key", isolate.key("leave_kind"));

        await session.selectOption("field-data-type", "Short text");
        const textSelects = await selects();

        await session.selectOption("field-data-type", "Dropdown");
        const dropdownSelects = await selects();

        assert.ok(
          dropdownSelects.length > textSelects.length,
          `a dropdown field adds a second control for the option set (Text had ${textSelects.length}, Dropdown has ${dropdownSelects.length})`
        );

        await session.selectOption("field-data-type", "Date");
        const dateSelects = await selects();

        assert.ok(
          dateSelects.length < dropdownSelects.length,
          `the option set control goes away when the type changes (Dropdown ${dropdownSelects.length} → Date ${dateSelects.length})`
        );

        await session.closeDialog("New field");
      },
    },
    {
      name: "search finds the field again and the status filter shows archived ones",
      screen: "/admin/fields",
      fn: async ({ session, assert, isolate }) => {
        const label = isolate.label("Searchable field");
        const key = isolate.key("searchable_field");

        await createField(session, { label, key });

        await session.fill("Search fields", label);
        await session.driver.sleep(700);
        await session.waitForRows();

        assert.ok(await session.rowExists(label), "the search finds the new field");

        const clear = await session.driver.findElements(By.css('[aria-label="Clear search"]'));

        if (clear.length) {
          await clear[0].click();
        }

        await session.driver.sleep(700);

        await session.clickInRow(label, "Archive");
        await session.openDialog("Archive field");
        await session.clickButton("Archive field");
        await session.expectToast("was archived");

        await session.selectOption("fields-status", "Archived");
        await session.driver.sleep(800);
        await session.waitForRows();

        assert.ok(await session.rowExists(label), "the archived field is reachable through the status filter");

        await session.selectOption("fields-status", "Active");
        await session.driver.sleep(600);
      },
    },
    {
      name: "a field that a form already uses cannot be archived quietly",
      screen: "/admin/fields",
      area: "Administration — definition lifecycle",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const fieldLabel = isolate.label("Used field");
        const fieldKey = isolate.key("used_field");

        const field = await adminApi.expectOk(
          adminApi.post("/admin/fields", { label: fieldLabel, key: fieldKey, dataType: "text" }),
          "create the field"
        );

        const form = await adminApi.expectOk(
          adminApi.post("/admin/forms", {
            label: isolate.label("Used field form"),
            key: isolate.key("used_field_form"),
            fields: [{ fieldId: field.id }],
          }),
          "create the form"
        );

        await session.goto("/admin/fields");
        await session.fill("Search fields", fieldKey);
        await session.driver.sleep(700);
        await session.waitForRows();

        const cells = await session.rowCells(fieldLabel);

        assert.ok(
          cells.join(" ").match(/1 form/),
          `the list states the field is used by a form: ${cells}`
        );

        await session.clickInRow(fieldLabel, "Archive");
        await session.openDialog("Archive field");
        await session.clickButton("Archive field");

        const refused = await session.driver
          .wait(
            async (driver) => {
              const toasts = await driver.findElements(By.css('[role="status"] p'));

              for (const toast of toasts) {
                const text = (await toast.getText()).trim();

                if (/archiv/i.test(text)) {
                  return text;
                }
              }

              return undefined;
            },
            8000,
            "no archive outcome was reported"
          )
          .catch(() => null);

        assert.ok(refused, `an archive outcome appeared: ${refused}`);

        const after = await adminApi.get(`/admin/fields/${field.id}`);
        const status = after.body?.data?.status;
        const refusedByServer = /could not/i.test(refused);

        if (refusedByServer) {
          assert.eq(status, "active", "a refused archive leaves the field usable");
        } else {
          assert.eq(status, "archived", "a successful archive is stored");
        }

        await adminApi.del(`/admin/forms/${form.id}`);
      },
    },
    {
      name: "the API rejects an unknown data type",
      fn: async ({ adminApi, assert, isolate }) => {
        const rejected = await adminApi.post("/admin/fields", {
          label: isolate.label("Bad type"),
          key: isolate.key("bad_type"),
          dataType: "not_a_type",
        });

        assert.eq(rejected.status, 400, "unknown data type is a validation failure");
        assert.includesText(JSON.stringify(rejected.body), "Unsupported field type", "the message names the problem");
      },
    },
  ],
};
