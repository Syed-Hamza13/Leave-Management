import { By, until } from "selenium-webdriver";

async function createOptionSet(session, { label, key, options = [] }) {
  await session.goto("/admin/dropdowns");
  await session.clickButton("New option set");
  await session.openDialog("New option set");

  await session.fill("dropdown-label", label);
  await session.fill("dropdown-key", key);

  /*
   * The dialog opens with no option rows at all — a row exists only after
   * "Add option" is clicked — so the first row needs the click like the rest.
   */
  for (const entry of options) {
    await session.clickButton("Add option");

    const index = options.indexOf(entry);

    await session.fill(`dropdown-option-value-${index}`, entry.value);
    await session.fill(`dropdown-option-label-${index}`, entry.label);
  }

  await session.submitDialog();
  await session.expectToast("was created");
}

async function openOptionSet(session, label) {
  await session.goto("/admin/dropdowns");
  await session.fill("Search option sets", label);
  await session.driver.sleep(700);

  const link = await session.driver.wait(
    until.elementLocated(By.xpath(`//table//a[normalize-space()="${label}"]`)),
    10000
  );

  await link.click();
  await session.step(`open option set ${label}`);
  await session.waitForApp();
  await session.waitForMainText(label);
}

export default {
  name: "dropdowns",
  area: "Administration — option sets",
  tests: [
    {
      name: "an option set created with its initial options is listed",
      screen: "/admin/dropdowns",
      fn: async ({ session, assert, isolate }) => {
        const label = isolate.label("Leave type");
        const key = isolate.key("leave_type");

        await createOptionSet(session, {
          label,
          key,
          options: [
            { value: "annual", label: "Annual leave" },
            { value: "sick", label: "Sick leave" },
          ],
        });

        await session.reload();
        await session.fill("Search option sets", label);
        await session.waitRow(label);

        const cells = await session.rowCells(label);
        const options = await session.columnHeaderIndex("Options");

        /*
         * The count is read by its header: the row also carries the run tag, whose
         * digits would satisfy any bare number match on the whole row.
         */
        assert.eq(
          cells[options],
          "2",
          `the list counts both initial options: ${JSON.stringify(cells)}`
        );
      },
    },
    {
      name: "an option can be added from the detail screen",
      screen: "/admin/dropdowns/:id",
      fn: async ({ session, assert, isolate }) => {
        const label = isolate.label("Leave type");

        await openOptionSet(session, label);

        assert.ok(
          /^\/admin\/dropdowns\/\d+$/.test(await session.pathname()),
          `the detail screen opened (${await session.pathname()})`
        );
        assert.ok(
          (await session.text(By.css("main"))).includes(label),
          "the detail screen names the option set it belongs to"
        );

        await session.clickButton("Add option");
        await session.anyDialogTitle("option");

        await session.fill("option-value", "casual");
        await session.fill("option-label", isolate.label("Casual leave"));
        await session.submitDialog();
        await session.expectToast("was added");

        await session.waitItem(isolate.label("Casual leave"));
      },
    },
    {
      name: "an option value that breaks the pattern is refused",
      screen: "/admin/dropdowns/:id",
      fn: async ({ session, assert, isolate }) => {
        await openOptionSet(session, isolate.label("Leave type"));

        await session.clickButton("Add option");
        await session.fill("option-value", "Has Spaces");
        await session.fill("option-label", isolate.label("Bad option"));
        await session.submitDialog();

        assert.includesText(
          (await session.fieldError("option-value")) || "",
          "Use letters, numbers, hyphens or underscores",
          "option value error"
        );

        await session.closeDialog(await session.dialogTitle());
      },
    },
    {
      name: "options can be reordered and the new order is stored",
      screen: "/admin/dropdowns/:id",
      fn: async ({ session, assert, isolate }) => {
        await openOptionSet(session, isolate.label("Leave type"));

        const second = isolate.label("Casual leave");

        /*
         * An option row carries its ordinal, value and button labels, so the
         * position is found by containment rather than by matching the text.
         */
        const position = (items) => items.findIndex((row) => row.includes(second));

        const before = await session.orderedItems("//main//ul");

        assert.ok(before.length >= 3, `at least three options exist: ${before.length}`);
        assert.ok(position(before) > 0, `the added option is not already first: ${JSON.stringify(before)}`);

        await session.clickByAriaLabel(`Move ${second} up`);
        await session.driver.sleep(900);

        const after = await session.orderedItems("//main//ul");

        assert.ok(
          position(after) === position(before) - 1,
          `the option moved up one place (was ${position(before)}, now ${position(after)})`
        );

        await session.reload();
        await session.waitForApp();

        // Reading the list before the screen has rendered it sees no rows at all.
        await session.waitForMainText(second);

        const reloaded = await session.orderedItems("//main//ul");

        assert.eq(
          position(reloaded),
          position(after),
          "the order survives a reload"
        );
      },
    },
    {
      name: "an option can be removed again",
      screen: "/admin/dropdowns/:id",
      fn: async ({ session, assert, isolate }) => {
        const doomed = isolate.label("Casual leave");

        await openOptionSet(session, isolate.label("Leave type"));
        await session.clickInItem(doomed, "Remove");

        await session.openDialog("Remove option");
        await session.clickButton("Remove option");
        await session.expectToast("was removed");

        assert.ok(
          !(await session.itemExists(doomed)),
          "the option is gone from the list"
        );
      },
    },
    {
      name: "an option set that a field depends on cannot be archived",
      screen: "/admin/dropdowns",
      area: "Administration — definition lifecycle",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const setLabel = isolate.label("Leave type");

        await openOptionSet(session, setLabel);

        const path = await session.pathname();
        const dropdownId = Number(path.split("/").at(-1));

        await adminApi.expectOk(
          adminApi.post("/admin/fields", {
            label: isolate.label("Leave kind ref"),
            key: isolate.key("leave_kind_ref"),
            dataType: "dropdown",
            config: { dropdownId },
          }),
          "create a dropdown field on this option set"
        );

        await session.goto("/admin/dropdowns");
        await session.fill("Search option sets", setLabel);
        await session.driver.sleep(700);
        await session.waitForRows();

        const cells = await session.rowCells(setLabel);
        const usedBy = await session.columnHeaderIndex("Used by");

        assert.eq(
          cells[usedBy],
          "1 field",
          `the list shows the option set is used: ${JSON.stringify(cells)}`
        );

        const attempt = await adminApi.del(`/admin/dropdowns/${dropdownId}`);

        assert.ok(
          attempt.status === 409 || attempt.status === 400,
          `archiving a used option set is refused (${attempt.status} ${JSON.stringify(attempt.body).slice(0, 200)})`
        );

        const still = await adminApi.get(`/admin/dropdowns/${dropdownId}`);

        assert.eq(still.body?.data?.status, "active", "the option set is still active");
      },
    },
  ],
};
