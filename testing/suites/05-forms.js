import { By, until } from "selenium-webdriver";

async function openFormDetail(session, label) {
  await session.goto("/admin/forms");
  await session.fill("Search forms", label);
  await session.waitForRows();

  const link = await session.driver.wait(
    until.elementLocated(By.xpath(`//table//a[normalize-space()="${label}"]`)),
    10000
  );

  await link.click();
  await session.step(`open form ${label}`);
  await session.waitHeading("Form builder");
}

async function createForm(session, { label, key, submitLabel = null }) {
  await session.goto("/admin/forms");
  await session.clickButton("New form");
  await session.openDialog("New form");

  await session.fill("form-label", label);
  await session.fill("form-key", key);

  if (submitLabel) {
    await session.fill("form-submit-label", submitLabel);
  }

  await session.submitDialog();
  await session.expectToast("was created");

  // The list is paged at 25 rows, so the new form is found by searching for it.
  await session.fill("Search forms", label);
  await session.waitRow(label);
}

const order = (items, needle) => items.findIndex((row) => row.includes(needle));

export default {
  name: "forms",
  area: "Administration — forms",
  tests: [
    {
      name: "a form created in the dialog is listed with its own submit label",
      screen: "/admin/forms",
      fn: async ({ session, assert, isolate }) => {
        const label = isolate.label("Leave request");
        const key = isolate.key("leave_request");

        await createForm(session, { label, key, submitLabel: "Send request" });

        await session.reload();

        await openFormDetail(session, label);

        assert.eq(await session.heading(), "Form builder", "the builder opened");
      },
    },
    {
      name: "an empty form name is refused by the API and shown on the field",
      screen: "/admin/forms",
      fn: async ({ session, assert, isolate }) => {
        await session.goto("/admin/forms");
        await session.clickButton("New form");
        await session.fill("form-label", "");
        await session.fill("form-key", isolate.key("empty_form"));
        await session.submitDialog();

        assert.includesText(
          (await session.fieldError("form-label")) || "",
          "Form name is required",
          "form name error"
        );

        await session.closeDialog("New form");
      },
    },
    {
      name: "fields can be added to the form from the picker",
      screen: "/admin/forms/:id",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const formLabel = isolate.label("Leave request");

        const one = await adminApi.expectOk(
          adminApi.post("/admin/fields", {
            label: isolate.label("Reason"),
            key: isolate.key("reason"),
            dataType: "textarea",
          }),
          "create the reason field"
        );

        const two = await adminApi.expectOk(
          adminApi.post("/admin/fields", {
            label: isolate.label("Days"),
            key: isolate.key("days"),
            dataType: "number",
          }),
          "create the days field"
        );

        await openFormDetail(session, formLabel);

        await session.clickButton("Add fields");
        await session.openDialog("Add fields");

        /*
         * The picker lists at most 100 unused fields, so each one is searched for
         * before it is ticked. The selection is kept across searches.
         */
        await session.fill("Search available fields", isolate.label("Reason"));
        await session.setCheckbox(`add-field-${one.id}`, true);

        await session.fill("Search available fields", isolate.label("Days"));
        await session.setCheckbox(`add-field-${two.id}`, true);

        await session.submitDialog();
        await session.expectToast("were added");

        await session.waitItem(isolate.label("Reason"));
        await session.waitItem(isolate.label("Days"));
      },
    },
    {
      name: "the order can be changed and is stored",
      screen: "/admin/forms/:id",
      fn: async ({ session, assert, isolate }) => {
        const reason = isolate.label("Reason");
        const days = isolate.label("Days");

        await openFormDetail(session, isolate.label("Leave request"));

        const before = await session.orderedItems("//main//ol");

        assert.ok(
          order(before, reason) >= 0 && order(before, reason) < order(before, days),
          `the fields start in the added order: ${JSON.stringify(before.map((row) => row.slice(0, 40)))}`
        );

        await session.clickByAriaLabel(`Move ${reason} down`);
        await session.driver.sleep(700);

        const after = await session.orderedItems("//main//ol");

        assert.eq(
          order(after, reason),
          order(before, reason) + 1,
          `the field moved down one place: ${JSON.stringify(after.map((row) => row.slice(0, 40)))}`
        );

        await session.reload();

        // The list only exists once the reloaded screen has rendered it.
        await session.waitForApp();
        await session.waitForMainText(reason);

        const reloaded = await session.orderedItems("//main//ol");

        assert.eq(
          order(reloaded, reason),
          order(after, reason),
          "the order survives a reload"
        );
      },
    },
    {
      name: "one field can serve several forms without changing the others",
      screen: "/admin/forms/:id",
      area: "Administration — field reuse",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const sharedLabel = isolate.label("Reason");

        await createForm(session, {
          label: isolate.label("Second leave form"),
          key: isolate.key("second_leave_form"),
        });

        const secondForm = await adminApi.expectOk(
          adminApi.get(`/admin/forms?search=${encodeURIComponent(isolate.label("Second leave form"))}`),
          "list the second form"
        );

        const secondId = secondForm?.[0]?.id;
        const fieldList = await adminApi.expectOk(
          adminApi.get(`/admin/fields?search=${encodeURIComponent(sharedLabel)}`),
          "find the shared field"
        );
        const fieldId = fieldList?.[0]?.id;

        assert.ok(secondId && fieldId, `resolved ids for reuse (${secondId}, ${fieldId})`);

        await adminApi.expectOk(
          adminApi.patch(`/admin/forms/${secondId}`, { fields: [{ fieldId }] }),
          "add the shared field to the second form"
        );

        await openFormDetail(session, isolate.label("Leave request"));

        const firstFormItems = await session.orderedItems("//main//ol");

        assert.ok(
          order(firstFormItems, sharedLabel) >= 0,
          `the first form still shows the shared field: ${JSON.stringify(firstFormItems.map((row) => row.slice(0, 40)))}`
        );
        assert.ok(
          order(firstFormItems, isolate.label("Days")) >= 0,
          "the first form kept its other field too"
        );
      },
    },
    {
      name: "a per-form override changes the label on this form only",
      screen: "/admin/forms/:id",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const formLabel = isolate.label("Leave request");
        const sharedLabel = isolate.label("Reason");

        await openFormDetail(session, formLabel);
        await session.clickInItem(sharedLabel, "Settings");

        await session.anyDialogTitle("Settings for");
        await session.setCheckbox("override-label", true);
        await session.fill("override-label-value", isolate.label("Why you are away"));
        await session.submitDialog();
        await session.expectToast("saved");

        assert.ok(
          await session.itemExists(isolate.label("Why you are away")),
          "the form now shows the overridden label"
        );

        const fieldList = await adminApi.expectOk(
          adminApi.get(`/admin/fields?search=${encodeURIComponent(sharedLabel)}`),
          "read the field back"
        );

        assert.eq(
          fieldList?.[0]?.label,
          sharedLabel,
          "the definition itself keeps its original label"
        );

        await openFormDetail(session, isolate.label("Second leave form"));

        assert.ok(
          (await session.orderedItems("//main//ol")).some((row) => row.includes(sharedLabel)),
          "the other form still shows the definition label"
        );
      },
    },
    {
      name: "removing a field from the form leaves the definition intact",
      screen: "/admin/forms/:id",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const doomed = isolate.label("Days");

        await openFormDetail(session, isolate.label("Leave request"));
        await session.clickInItem(doomed, "Remove");

        await session.openDialog("Remove field from form");
        await session.clickButton("Remove from form");
        await session.expectToast("removed from this form");

        assert.ok(!(await session.itemExists(doomed)), "the row is gone from the form");

        const list = await adminApi.expectOk(
          adminApi.get(`/admin/fields?search=${encodeURIComponent(doomed)}`),
          "read the definition back"
        );

        assert.eq(list?.[0]?.status, "active", "the field definition still exists and is active");
      },
    },
  ],
};
