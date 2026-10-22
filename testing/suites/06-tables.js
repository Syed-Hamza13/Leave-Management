import { By, until } from "selenium-webdriver";

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

async function addColumn(session, { label, key, dataType = "Short text" }) {
  await session.clickButton("Add column");
  await session.openDialog("New column");

  await session.fill("column-label", label);
  await session.fill("column-key", key);
  await session.selectOption("column-data-type", dataType);
  await session.submitDialog();
  await session.expectToast("was added");
  await session.waitItem(label);
}

/** The edit dialog is titled after the column, so the label is the fragment to wait for. */
async function editColumn(session, label) {
  await session.clickInItem(label, "Edit");
  await session.anyDialogTitle(label);
}

export default {
  name: "tables",
  area: "Administration — logical tables",
  tests: [
    {
      name: "a managed table can be created and given its first column",
      screen: "/admin/tables",
      fn: async ({ session, assert, isolate }) => {
        const label = isolate.label("Employee documents");
        const key = isolate.key("employee_documents");

        await createTable(session, { label, key });

        await session.reload();

        await openTableDetail(session, label);

        assert.eq(await session.heading(), "Table columns", "the column builder opened");

        await addColumn(session, {
          label: isolate.label("Document type"),
          key: isolate.key("document_type"),
        });

        await session.reload();

        await session.waitItem(isolate.label("Document type"));

        assert.ok(
          await session.itemExists(isolate.label("Document type")),
          "the column is stored and comes back after a reload"
        );
      },
    },
    {
      name: "column flags are saved with the column",
      screen: "/admin/tables/:id",
      fn: async ({ session, assert, isolate }) => {
        await openTableDetail(session, isolate.label("Employee documents"));

        await addColumn(session, {
          label: isolate.label("Received on"),
          key: isolate.key("received_on"),
          dataType: "Date",
        });

        await editColumn(session, isolate.label("Document type"));

        await session.setCheckbox("column-is-searchable", true);
        await session.setCheckbox("column-is-filterable", true);
        await session.submitDialog();
        await session.expectToast("was saved");

        await editColumn(session, isolate.label("Document type"));

        assert.ok(await session.isChecked("column-is-searchable"), "the searchable flag persisted");
        assert.ok(await session.isChecked("column-is-filterable"), "the filterable flag persisted");

        await session.closeDialog(await session.dialogTitle());
      },
    },
    {
      name: "a required column rejects an empty value through the API",
      screen: "/admin/tables/:id",
      area: "Records — typed value storage",
      fn: async ({ session, assert, isolate, adminApi }) => {
        await openTableDetail(session, isolate.label("Employee documents"));

        await addColumn(session, {
          label: isolate.label("File reference"),
          key: isolate.key("file_reference"),
        });

        await editColumn(session, isolate.label("File reference"));
        await session.setCheckbox("column-is-required", true);
        await session.submitDialog();
        await session.expectToast("was saved");

        const path = await session.pathname();
        const tableId = Number(path.split("/").at(-1));

        const empty = await adminApi.post(`/tables/${tableId}/records`, {
          values: { [isolate.key("document_type")]: "offer letter" },
        });

        assert.eq(
          empty.status,
          400,
          `a record missing a required column is refused (${JSON.stringify(empty.body).slice(0, 300)})`
        );
        assert.includesText(
          JSON.stringify(empty.body),
          "is required",
          "the refusal names the column"
        );

        const filled = await adminApi.post(`/tables/${tableId}/records`, {
          values: {
            [isolate.key("document_type")]: "offer letter",
            [isolate.key("file_reference")]: "HR-0001",
          },
        });

        assert.eq(
          filled.status,
          201,
          `the same record succeeds once the required value is present (${JSON.stringify(filled.body).slice(0, 300)})`
        );

        await session.reload();
        await session.waitForApp();

        // The usage summary appears only once the permission context has resolved.
        await session.waitForMainText("Records");

        const usage = await session.text(By.css("main"));

        assert.includesText(usage, "Records", "the table reports how many records it holds");
      },
    },
    {
      name: "a column type cannot be changed once the table holds records",
      screen: "/admin/tables/:id",
      area: "Administration — schema version safety",
      fn: async ({ session, assert, isolate }) => {
        await openTableDetail(session, isolate.label("Employee documents"));

        await editColumn(session, isolate.label("Document type"));

        assert.ok(
          await session.isControlDisabled("column-data-type"),
          "the data type control is locked while records exist"
        );
        assert.includesText(
          (await session.text(By.css("#column-data-type-hint"))) ||
            (await session.anyText(By.css('[role="dialog"]'))),
          "stored type is fixed",
          "the reason is explained to the user"
        );

        await session.closeDialog(await session.dialogTitle());
      },
    },
    {
      name: "the users table is protected from the table builder",
      screen: "/admin/tables",
      area: "Authentication data protection",
      fn: async ({ session, assert, adminApi, isolate }) => {
        await session.goto("/admin/tables");
        await session.selectOption("tables-storage", "System");
        await session.driver.sleep(800);
        await session.waitForRows();

        const cells = await session.rowCells("Users");

        assert.ok(cells, "the system Users table is listed");
        assert.ok(cells.join(" ").includes("System"), `the row is marked as a system table: ${cells}`);

        const archive = await session.driver.findElements(
          By.xpath('//table//a[normalize-space()="Users"]/ancestor::tr//button[normalize-space()="Archive"]')
        );

        assert.eq(archive.length, 0, "a system table offers no archive control");

        const link = await session.driver.findElement(
          By.xpath('//table//a[normalize-space()="Users"]')
        );

        await link.click();
        await session.step("open the users system table");
        await session.waitForMainText("System columns");

        const main = await session.text(By.css("main"));

        assert.includesText(main, "System columns", "the protected columns are grouped");
        assert.includesText(main, "cannot be edited or reordered", "the protection is stated to the user");

        const systemSection = await session.driver.findElements(
          By.xpath(
            '//h2[normalize-space()="System columns" or contains(normalize-space(),"System columns")]/following::ul[1]//button'
          )
        );

        assert.eq(
          systemSection.length,
          0,
          `the protected columns expose no row controls (${systemSection.length} found)`
        );

        const addColumn = await session.driver.findElements(
          By.xpath('//button[normalize-space()="Add column"]')
        );

        assert.ok(
          addColumn.length > 0,
          "custom columns can be added to the users table"
        );

        // Verify system columns cannot be edited or deleted via API
        const usersTable = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        const emailCol = usersTable.columns.find((c) => c.key === "email");
        assert.ok(emailCol?.isSystem, "email column is marked as system");

        const patchFail = await adminApi.patch(`/admin/tables/${usersTable.id}/columns/${emailCol.id}`, {
          label: "Hacked Email",
        });
        assert.eq(patchFail.status, 409, "system column cannot be patched");

        const deleteFail = await adminApi.del(`/admin/tables/${usersTable.id}/columns/${emailCol.id}`);
        assert.eq(deleteFail.status, 409, "system column cannot be deleted");

        // Verify a custom column can be added, updated, and deleted
        const customColKey = isolate.key("dept");
        const addedCol = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${usersTable.id}/columns`, {
            label: "Department",
            key: customColKey,
            dataType: "text",
          })
        );
        assert.eq(addedCol.key, customColKey, "custom column key matches");
        assert.eq(addedCol.isSystem, false, "custom column is not a system column");

        const updatedCol = await adminApi.expectOk(
          adminApi.patch(`/admin/tables/${usersTable.id}/columns/${addedCol.id}`, {
            label: "Department Name",
          })
        );
        assert.eq(updatedCol.label, "Department Name", "custom column can be updated");

        const archivedCol = await adminApi.expectOk(
          adminApi.del(`/admin/tables/${usersTable.id}/columns/${addedCol.id}`)
        );
        assert.eq(archivedCol.status, "archived", "custom column can be archived");
      },
    },
    {
      name: "the API refuses a duplicate column key inside one table",
      fn: async ({ adminApi, assert, isolate }) => {
        const table = await adminApi.expectOk(
          adminApi.post("/admin/tables", {
            label: isolate.label("Duplicate column table"),
            key: isolate.key("duplicate_column_table"),
          }),
          "create the table"
        );

        await adminApi.expectOk(
          adminApi.post(`/admin/tables/${table.id}/columns`, {
            label: isolate.label("First column"),
            key: isolate.key("shared_column"),
            dataType: "text",
          }),
          "create the first column"
        );

        const duplicate = await adminApi.post(`/admin/tables/${table.id}/columns`, {
          label: isolate.label("Second column"),
          key: isolate.key("shared_column"),
          dataType: "text",
        });

        assert.ok(
          duplicate.status === 409 || duplicate.status === 400,
          `the duplicate key is refused (${duplicate.status} ${JSON.stringify(duplicate.body).slice(0, 200)})`
        );

        const list = await adminApi.expectOk(
          adminApi.get(`/admin/tables/${table.id}/columns`),
          "read the columns back"
        );

        assert.eq(
          list.filter((column) => column.key === isolate.key("shared_column")).length,
          1,
          "only one column carries that key"
        );
      },
    },
    {
      name: "permanent column deletion removes column completely while archive marks it archived",
      fn: async ({ adminApi, assert, isolate }) => {
        const table = await adminApi.expectOk(
          adminApi.post("/admin/tables", {
            label: isolate.label("Deletion test table"),
            key: isolate.key("del_test_table"),
          }),
          "create test table"
        );

        // 1. Create two custom columns
        const col1 = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${table.id}/columns`, {
            label: "Archivable Col",
            key: isolate.key("col_archive"),
            dataType: "text",
          })
        );
        const col2 = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${table.id}/columns`, {
            label: "Permanent Col",
            key: isolate.key("col_permanent"),
            dataType: "text",
          })
        );

        // 2. Archive col1 (permanent: false / default)
        const archiveResult = await adminApi.expectOk(
          adminApi.del(`/admin/tables/${table.id}/columns/${col1.id}`)
        );
        assert.eq(archiveResult.status, "archived", "column is marked archived");

        // Archived column still appears in list with status archived
        const listAfterArchive = await adminApi.expectOk(
          adminApi.get(`/admin/tables/${table.id}/columns?includeArchived=true`)
        );
        assert.ok(
          listAfterArchive.some((c) => c.id === col1.id && c.status === "archived"),
          "archived column is preserved in historical schema"
        );

        // 3. Permanently delete col2 (?permanent=true)
        const deleteResult = await adminApi.expectOk(
          adminApi.del(`/admin/tables/${table.id}/columns/${col2.id}?permanent=true`)
        );
        assert.eq(deleteResult.deleted, true, "column deletion returns deleted: true");
        assert.eq(deleteResult.permanent, true, "column deletion is marked permanent");

        // Permanently deleted column does NOT appear even with includeArchived=true
        const listAfterDelete = await adminApi.expectOk(
          adminApi.get(`/admin/tables/${table.id}/columns?includeArchived=true`)
        );
        assert.ok(
          !listAfterDelete.some((c) => c.id === col2.id),
          "permanently deleted column is completely removed from database"
        );
      },
    },
    {
      name: "system columns reject deletion and updates with SYSTEM_COLUMN_LOCKED",
      fn: async ({ adminApi, assert }) => {
        const usersTable = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        const systemCol = usersTable.columns.find((c) => c.isSystem && c.key === "email");
        assert.ok(systemCol, "email is identified as a system column");

        // Attempt archive/delete on system column
        const deleteAttempt = await adminApi.del(
          `/admin/tables/users/columns/${systemCol.id}?permanent=true`
        );
        assert.eq(deleteAttempt.status, 409, "deleting system column is rejected with 409 Conflict");
        assert.eq(
          deleteAttempt.body?.code,
          "SYSTEM_COLUMN_LOCKED",
          "correct error code returned for system column delete attempt"
        );

        // Attempt update on system column
        const patchAttempt = await adminApi.patch(
          `/admin/tables/users/columns/${systemCol.id}`,
          { label: "Hacked Email" }
        );
        assert.eq(patchAttempt.status, 409, "updating system column is rejected with 409 Conflict");
        assert.eq(
          patchAttempt.body?.code,
          "SYSTEM_COLUMN_LOCKED",
          "correct error code returned for system column patch attempt"
        );
      },
    },
    {
      name: "table columns can be reordered and mismatching IDs are rejected",
      fn: async ({ adminApi, assert, isolate }) => {
        const table = await adminApi.expectOk(
          adminApi.post("/admin/tables", {
            label: isolate.label("Reorder test table"),
            key: isolate.key("reorder_test_table"),
          })
        );

        const colA = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${table.id}/columns`, {
            label: "Column Alpha",
            key: isolate.key("col_alpha"),
            dataType: "text",
          })
        );
        const colB = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${table.id}/columns`, {
            label: "Column Beta",
            key: isolate.key("col_beta"),
            dataType: "text",
          })
        );

        // Reorder: put colB before colA
        await adminApi.expectOk(
          adminApi.put(`/admin/tables/${table.id}/columns/order`, {
            columnIds: [colB.id, colA.id],
          })
        );

        const columns = await adminApi.expectOk(adminApi.get(`/admin/tables/${table.id}/columns`));
        const indexA = columns.findIndex((c) => c.id === colA.id);
        const indexB = columns.findIndex((c) => c.id === colB.id);

        assert.ok(indexB < indexA, "Column Beta is positioned before Column Alpha after reordering");

        // Reorder with invalid/missing IDs is rejected
        const badReorder = await adminApi.put(`/admin/tables/${table.id}/columns/order`, {
          columnIds: [colA.id],
        });
        assert.eq(badReorder.status, 400, "incomplete column order is rejected with 400 Bad Request");
      },
    },
  ],
};
