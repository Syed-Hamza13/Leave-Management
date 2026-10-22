import { By } from "selenium-webdriver";

import { ApiClient } from "../lib/api.js";

/*
 * Accounts are the one table the record surface must never touch, so this suite
 * watches both halves: the dialog an administrator uses, and the API rule that
 * keeps an administrator from locking themselves out. Every account it creates is a
 * throwaway on the test domain, and sign-in attempts run in separate cookie jars so
 * the browser stays logged in as the configured admin.
 *
 * The create and set-password routes share one sensitive window of 20 requests per
 * 15 minutes, so the suite creates few accounts and reuses them. The last two tests
 * depend on the earlier ones: the shared account is deactivated, revived, signed in
 * with, and given a new password in turn.
 */

const PASSWORD = "E2eStaff!2026";

async function accountByEmail(adminApi, email) {
  const found = await adminApi.expectOk(
    adminApi.get(`/admin/users?search=${encodeURIComponent(email)}`),
    `look up ${email}`
  );

  const rows = Array.isArray(found) ? found : [];

  return rows.find((row) => row.email === String(email).toLowerCase()) ?? null;
}

/** Reads a cell once the list has settled for it, instead of racing the re-fetch. */
async function expectCell(session, assert, match, column, expected, timeout = 10000) {
  await session.waitForRows();

  const limit = Date.now() + timeout;

  let seen = null;

  while (Date.now() < limit) {
    seen = await session.rowCells(match, { column }).catch(() => null);

    if (seen === expected) {
      return seen;
    }

    await session.driver.sleep(300);
  }

  assert.eq(seen, expected, `the "${column}" cell of the row for ${match}`);

  return seen;
}

async function fillNewAccount(session, { email, firstName, password, lastName = null }) {
  await session.fill("user-email", email);
  await session.fill("user-first-name", firstName);

  if (lastName) {
    await session.fill("user-last-name", lastName);
  }

  await session.fill("user-password", password);
  await session.fill("user-confirm-password", password);
}

async function signIn(account, password) {
  const client = new ApiClient();

  return client
    .login({ email: account, password })
    .then(() => client)
    .catch(() => null);
}

export default {
  name: "users",
  area: "Users — accounts, roles, sign-in state",
  async setup({ adminApi, isolate, config }) {
    const email = isolate.email("staff");

    const account = await adminApi.expectOk(
      adminApi.post("/admin/users", {
        email,
        firstName: "Samina",
        lastName: "Iqbal",
        password: PASSWORD,
        roleKeys: ["employee"],
      }),
      "create the employee account the suite works on"
    );

    if (config.protectedEmails.includes(account.email)) {
      throw new Error(`Refusing to mutate a protected account (${account.email}).`);
    }

    return { account, accountEmail: account.email };
  },
  tests: [
    {
      name: "the accounts screen lists people with their role, status and sign-in stamp",
      screen: "/admin/users",
      fn: async ({ session, assert, accountEmail, adminApi }) => {
        await session.goto("/admin/users");
        await session.waitHeading("Users");
        await session.waitForRows();

        for (const header of ["Account", "Roles", "Status", "Last sign-in", "Created"]) {
          assert.ok(
            (await session.columnHeaderIndex(header)) !== null,
            `the list has a "${header}" column`
          );
        }

        await session.fill("Search accounts", accountEmail);
        await session.driver.sleep(1200);

        assert.ok(await session.rowExists(accountEmail), `the new account is listed (${accountEmail})`);

        await expectCell(session, assert, accountEmail, "Roles", "Employee");
        await expectCell(session, assert, accountEmail, "Status", "active");
        await expectCell(session, assert, accountEmail, "Last sign-in", "Never");

        const stored = await accountByEmail(adminApi, accountEmail);

        assert.ok(stored?.id, "the same account is readable through the API");
        assert.ok(
          !/password_hash|passwordHash|\$2[aby]\$|\$argon2/i.test(JSON.stringify(stored)),
          "the API never returns a password hash"
        );
      },
    },
    {
      name: "an account created in the dialog is listed with the role ticked in it",
      screen: "/admin/users",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const email = isolate.email("manager");

        await session.goto("/admin/users");
        await session.waitHeading("Users");

        await session.clickButton("New account");
        await session.openDialog("New account");

        await fillNewAccount(session, {
          email,
          firstName: "Rehana",
          lastName: "Farooq",
          password: PASSWORD,
        });
        await session.setCheckbox("user-role-manager", true);

        const submit = await session.submitDialog();

        assert.eq(submit, "Create account", "the dialog asks to create the account");

        const toast = await session.expectToast("was created");

        assert.includesText(toast, email, `the toast names the account: ${toast}`);

        await session.fill("Search accounts", email);
        await session.driver.sleep(1200);

        await expectCell(session, assert, email, "Roles", "Manager");

        const stored = await accountByEmail(adminApi, email);

        assert.eq(stored?.firstName, "Rehana", "the profile arrived as typed");
        assert.eq(
          (stored?.roles ?? []).map((role) => role.key).join(","),
          "manager",
          "the server stored exactly the ticked role"
        );
      },
    },
    {
      name: "the dialog stops a mismatched confirmation before the server is asked",
      screen: "/admin/users",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const email = isolate.email("mismatch");

        await session.goto("/admin/users");
        await session.clickButton("New account");
        await session.openDialog("New account");

        await session.fill("user-email", email);
        await session.fill("user-first-name", "Nadia");
        await session.fill("user-password", PASSWORD);
        await session.fill("user-confirm-password", `${PASSWORD}x`);

        await session.clickButton("Create account");

        const error = await session.fieldError("user-confirm-password");

        assert.includesText(error || "", "do not match", `the password fields are marked: ${error}`);

        assert.ok(
          await session.exists(By.css('[role="dialog"]')),
          "the dialog stays open with the draft intact"
        );

        const found = await adminApi.expectOk(
          adminApi.get(`/admin/users?search=${encodeURIComponent(email)}`),
          "check the account was never created"
        );

        assert.eq(
          (Array.isArray(found) ? found : []).filter((row) => row.email === email).length,
          0,
          "a locally refused create leaves no account behind"
        );

        await session.closeDialog("New account");
      },
    },
    {
      name: "a password below the account policy is refused and reported on its field",
      screen: "/admin/users",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const email = isolate.email("weakpass");

        await session.goto("/admin/users");
        await session.clickButton("New account");
        await session.openDialog("New account");

        /*
         * Long enough to clear the schema's minimum, so the request reaches the
         * policy check and the dialog can carry the policy's own message rather
         * than the generic "Validation failed" a short password would produce.
         */
        await fillNewAccount(session, { email, firstName: "Imran", password: "alllowercase" });

        await session.submitDialog();

        const alert = (await session.waitDialogError()).join(" ");

        assert.includesText(
          alert || "",
          "does not meet the account policy",
          `the dialog carries the server's own reason: ${alert}`
        );

        const fieldError = await session.fieldError("user-password");

        assert.ok(
          /at least 8|uppercase|number|special|lowercase/i.test(fieldError || ""),
          `the password field says which rule broke: ${fieldError}`
        );

        const found = await adminApi.expectOk(
          adminApi.get(`/admin/users?search=${encodeURIComponent(email)}`),
          "check the weak account was not created"
        );

        assert.eq(
          (Array.isArray(found) ? found : []).length,
          0,
          "no account exists for the refused password"
        );

        await session.closeDialog("New account");
      },
    },
    {
      name: "a duplicate email is refused with the account's own message",
      screen: "/admin/users",
      fn: async ({ session, assert, accountEmail, adminApi }) => {
        await session.goto("/admin/users");
        await session.clickButton("New account");
        await session.openDialog("New account");

        await fillNewAccount(session, {
          email: accountEmail,
          firstName: "Someone Else",
          password: PASSWORD,
        });

        await session.submitDialog();

        const alert = (await session.waitDialogError()).join(" ");

        assert.includesText(
          alert || "",
          "already has an account",
          `the refusal names the email: ${alert}`
        );

        const dialogText = `${alert} ${(await session.dialogHasError()).join(" ")}`;

        assert.ok(
          !/ER_|duplicate|SQL|mysql|constraint/i.test(dialogText),
          `the refusal carries no database detail: ${dialogText}`
        );

        const fieldError = await session.fieldError("user-email");

        assert.includesText(fieldError || "", "already exists", `the email field is marked: ${fieldError}`);

        const stored = await accountByEmail(adminApi, accountEmail);

        assert.eq(stored?.firstName, "Samina", "the existing account kept its own name");

        await session.closeDialog("New account");
      },
    },
    {
      name: "search and the role filter narrow the list to the accounts asked for",
      screen: "/admin/users",
      fn: async ({ session, assert, isolate, accountEmail, adminUser }) => {
        await session.goto("/admin/users");
        await session.waitForRows();

        await session.fill("Search accounts", isolate.tag);
        await session.driver.sleep(1500);

        assert.ok(await session.rowExists(accountEmail), "the tagged account survives the search");
        assert.ok(
          !(await session.rowExists(adminUser.email)),
          "the administrator's own account is filtered out"
        );

        // An empty sendKeys("") never reaches the debounced search box, so the
        // list would stay filtered and the next assertion would fail for the
        // wrong reason.
        await session.setReactValue("Search accounts", "");
        await session.driver.sleep(1500);
        await session.waitRow(adminUser.email);

        await session.selectOption("users-role", "Employee");
        await session.driver.sleep(1500);

        assert.ok(await session.rowExists(accountEmail), "the role filter keeps the employee");
        assert.ok(
          !(await session.rowExists(adminUser.email)),
          "and drops accounts that do not hold it"
        );

        await session.selectOption("users-role", "Super Admin");
        await session.driver.sleep(1500);

        assert.ok(
          !(await session.rowExists(accountEmail)),
          "switching the filter to another role drops it again"
        );

        await session.selectOption("users-role", "All roles");
        await session.selectOption("users-status", "All statuses");
        await session.driver.sleep(1500);

        assert.ok(await session.rowExists(accountEmail), "clearing the filters restores the list");
      },
    },
    {
      name: "an account is renamed and deactivated from its row, and the email stays fixed",
      screen: "/admin/users",
      fn: async ({ session, assert, account, accountEmail, adminApi }) => {
        await session.goto("/admin/users");
        await session.fill("Search accounts", accountEmail);
        await session.driver.sleep(1500);
        await session.waitRow(accountEmail);

        await session.clickInRow(accountEmail, "Edit");

        const title = await session.anyDialogTitle(`Edit ${accountEmail}`);

        assert.includesText(title, accountEmail, `the dialog names the account: ${title}`);

        assert.ok(
          !(await session.exists(By.css("#user-email"))),
          "the email is shown as text, never as an editable field"
        );

        await session.fill("user-first-name", "Samina R.");
        await session.selectOption("user-status", "Deactivated");

        await session.submitDialog();
        await session.expectToast("was saved");

        const stored = await adminApi.expectOk(
          adminApi.get(`/admin/users/${account.id}`),
          "read the account back"
        );

        assert.eq(stored.firstName, "Samina R.", "the rename reached the server");
        assert.eq(stored.status, "disabled", "deactivating is stored as disabled");

        await expectCell(session, assert, accountEmail, "Status", "disabled");
      },
    },
    {
      name: "a deactivated account is refused at sign-in, and signing in stamps the row",
      screen: "/admin/users",
      fn: async ({ session, assert, accountEmail, adminApi }) => {
        assert.ok(
          (await signIn(accountEmail, PASSWORD)) === null,
          "a deactivated account cannot sign in"
        );

        const list = await adminApi.expectOk(
          adminApi.get(`/admin/users?search=${encodeURIComponent(accountEmail)}`),
          "find the account again"
        );

        const id = (Array.isArray(list) ? list : [])[0]?.id;

        assert.ok(id, `the account is still there (${id})`);

        await adminApi.expectOk(
          adminApi.patch(`/admin/users/${id}`, { status: "active" }),
          "reactivate the account"
        );

        const client = await signIn(accountEmail, PASSWORD);

        assert.ok(client, "the reactivated account signs in again");

        await session.goto("/admin/users");
        await session.fill("Search accounts", accountEmail);
        await session.driver.sleep(1500);
        await session.waitForRows();

        let stamp = null;

        for (let attempt = 0; attempt < 30 && !/\d{4}-\d{2}-\d{2}/.test(stamp || ""); attempt += 1) {
          stamp = await session.rowCells(accountEmail, { column: "Last sign-in" });

          if (stamp === null) {
            break;
          }

          await session.driver.sleep(300);
        }

        assert.ok(
          /\d{4}-\d{2}-\d{2}/.test(stamp || ""),
          `the row carries the date the account signed in, not "Never" (${stamp})`
        );
      },
    },
    {
      name: "an administrator set password closes the sessions the account had open",
      screen: "/admin/users",
      fn: async ({ session, assert, accountEmail, adminApi }) => {
        const opened = await signIn(accountEmail, PASSWORD);

        assert.ok(opened, "the account can open a session with the suite password");
        assert.eq((await opened.me()).status, 200, "and that session is accepted");

        await session.goto("/admin/users");
        await session.fill("Search accounts", accountEmail);
        await session.driver.sleep(1500);
        await session.waitRow(accountEmail);

        await session.clickInRow(accountEmail, "Set password");
        await session.anyDialogTitle("Set a new password for");

        const changed = `${PASSWORD}x`;

        await session.fill("reset-password", changed);
        await session.fill("reset-password-confirm", PASSWORD);
        await session.clickButton("Set password");

        const mismatch = await session.fieldError("reset-password-confirm");

        assert.includesText(
          mismatch || "",
          "do not match",
          `the dialog checks the confirmation first: ${mismatch}`
        );

        await session.fill("reset-password-confirm", changed);
        await session.clickButton("Set password");

        const toast = await session.expectToast("A new password was set for");

        assert.includesText(toast, accountEmail, `the toast names the account: ${toast}`);

        assert.ok(
          (await opened.me()).status >= 400,
          "the session opened with the old password is no longer accepted"
        );

        assert.ok((await signIn(accountEmail, PASSWORD)) === null, "the old password no longer works");

        const withNew = await signIn(accountEmail, changed);

        assert.ok(withNew, "the new password opens a session");

        const list = await adminApi.expectOk(
          adminApi.get(`/admin/users?search=${encodeURIComponent(accountEmail)}`),
          "find the account"
        );

        await adminApi.expectOk(
          adminApi.put(
            `/admin/users/${(Array.isArray(list) ? list : [])[0]?.id}/password`,
            { password: PASSWORD }
          ),
          "restore the suite password"
        );
      },
    },
    {
      name: "the API refuses to let an administrator strip their own access",
      screen: "/admin/users",
      fn: async ({ adminApi, assert, adminUser, session }) => {
        const demoted = await adminApi.put(`/authorization/users/${adminUser.id}/roles`, {
          roleKeys: ["employee"],
        });

        assert.eq(demoted.status, 403, "removing your own administrator role is refused");
        assert.includesText(
          JSON.stringify(demoted.body),
          "your own administrator access",
          "the refusal says why"
        );

        const unknown = await adminApi.put(`/authorization/users/${adminUser.id}/roles`, {
          roleKeys: ["not_a_role"],
        });

        assert.eq(unknown.status, 400, "an unknown role key is refused outright");

        const still = await adminApi.expectOk(
          adminApi.get("/authorization/permissions"),
          "read the administrator's own access back"
        );

        assert.ok(
          (still.roles ?? []).some((role) => ["super_admin", "admin"].includes(role.key)),
          `the refused writes left the account able to administer: ${JSON.stringify(still.roles)}`
        );

        await session.goto("/admin/users");
        await session.fill("Search accounts", adminUser.email);
        await session.driver.sleep(1500);

        const cells = await session.rowCells(adminUser.email, { column: "Roles" });

        assert.ok(
          /Super Admin|Administrator/.test(cells || ""),
          `the screen still shows the administrator role: ${cells}`
        );
      },
    },
    {
      name: "the accounts surface never carries an authentication secret",
      fn: async ({ adminApi, assert, accountEmail }) => {
        const list = await adminApi.expectOk(
          adminApi.get("/admin/users?pageSize=200"),
          "read the account list"
        );

        const dump = JSON.stringify(list);

        assert.ok(Array.isArray(list) && list.length > 0, "the list carries rows");

        for (const forbidden of [
          "passwordHash",
          "password_hash",
          "$2a$",
          "$argon2",
          "device_id",
          "deviceId",
          "csrf",
          "refreshToken",
        ]) {
          assert.ok(!dump.includes(forbidden), `no row leaks "${forbidden}"`);
        }

        const one = await accountByEmail(adminApi, accountEmail);

        assert.eq(
          Object.keys(one ?? {})
            .filter((key) => /password/i.test(key) && key !== "passwordChangedAt")
            .join(","),
          "",
          "a single account reports no password field of its own"
        );
      },
    },
    {
      name: "users table supports dynamic custom columns and persists profile values",
      fn: async ({ adminApi, assert, isolate }) => {
        const usersTable = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        const customColKey = isolate.key("empid");

        // 1. Add a custom column to users table
        const addedCol = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${usersTable.id}/columns`, {
            label: "Employee Code",
            key: customColKey,
            dataType: "text",
            isSearchable: true,
          })
        );
        assert.eq(addedCol.key, customColKey, "custom column added to users table");
        assert.eq(addedCol.isSystem, false, "custom column is not system");

        // 2. Create user with custom value
        const userEmail = isolate.email("profile");
        const createdUser = await adminApi.expectOk(
          adminApi.post("/admin/users", {
            email: userEmail,
            firstName: "Profile",
            lastName: "Tester",
            password: "Password123!",
            roleKeys: ["employee"],
            values: { [customColKey]: "EMP-7777" },
          })
        );
        assert.eq(createdUser.values?.[customColKey], "EMP-7777", "custom field value returned on create");

        // 3. Fetch user by ID
        const fetchedUser = await adminApi.expectOk(adminApi.get(`/admin/users/${createdUser.id}`));
        assert.eq(fetchedUser.values?.[customColKey], "EMP-7777", "custom field value returned on get");

        // 4. Update user with new custom value
        const updatedUser = await adminApi.expectOk(
          adminApi.patch(`/admin/users/${createdUser.id}`, {
            values: { [customColKey]: "EMP-8888" },
          })
        );
        assert.eq(updatedUser.values?.[customColKey], "EMP-8888", "custom field value updated");

        // 5. Search matches custom column value
        const searchRes = await adminApi.expectOk(
          adminApi.get("/admin/users?search=EMP-8888")
        );
        const match = (searchRes || []).find((u) => u.id === createdUser.id);
        assert.ok(match, "user found via searchable custom profile value");

        // 6. Clean up: archive custom column
        await adminApi.expectOk(
          adminApi.del(`/admin/tables/${usersTable.id}/columns/${addedCol.id}`)
        );
      },
    },
    {
      name: "users table supports dedicated phone (mobile number) data type with numeric validation",
      fn: async ({ adminApi, assert, isolate }) => {
        const usersTable = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        const phoneColKey = isolate.key("mobile_no");

        // 1. Add custom phone column to users table
        const phoneCol = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${usersTable.id}/columns`, {
            label: "Mobile No.",
            key: phoneColKey,
            dataType: "phone",
          })
        );
        assert.eq(phoneCol.dataType, "phone", "column created with phone data type");

        // 2. Reject non-numeric phone values
        const badCreate = await adminApi.post("/admin/users", {
          email: isolate.email("badphone"),
          firstName: "Bad",
          lastName: "Phone",
          password: "Password123!",
          roleKeys: ["employee"],
          values: { [phoneColKey]: "123-abc-456" },
        });
        assert.eq(badCreate.status, 400, "non-numeric phone number is rejected with 400");

        // 3. Accept valid numeric phone value
        const userEmail = isolate.email("validphone");
        const createdUser = await adminApi.expectOk(
          adminApi.post("/admin/users", {
            email: userEmail,
            firstName: "Valid",
            lastName: "Phone",
            password: "Password123!",
            roleKeys: ["employee"],
            values: { [phoneColKey]: "9876543210" },
          })
        );
        assert.eq(createdUser.values?.[phoneColKey], "9876543210", "valid phone number stored and returned");

        // 4. Update phone number
        const updatedUser = await adminApi.expectOk(
          adminApi.patch(`/admin/users/${createdUser.id}`, {
            values: { [phoneColKey]: "9998887776" },
          })
        );
        assert.eq(updatedUser.values?.[phoneColKey], "9998887776", "phone number successfully updated");

        // 5. Clean up: delete column permanently
        await adminApi.expectOk(
          adminApi.del(`/admin/tables/users/columns/${phoneCol.id}?permanent=true`)
        );
      },
    },
    {
      name: "users table custom columns can be reordered and order persists",
      fn: async ({ adminApi, assert, isolate }) => {
        const usersTable = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        const col1Key = isolate.key("field_a");
        const col2Key = isolate.key("field_b");

        const col1 = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${usersTable.id}/columns`, {
            label: "Custom Field A",
            key: col1Key,
            dataType: "text",
          })
        );
        const col2 = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${usersTable.id}/columns`, {
            label: "Custom Field B",
            key: col2Key,
            dataType: "text",
          })
        );

        // Fetch all manageable custom columns currently active
        const tableBefore = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        const customCols = tableBefore.columns.filter((c) => !c.isSystem && c.status === "active");

        // Create reordered array with col2 placed before col1
        const otherIds = customCols.map((c) => c.id).filter((id) => id !== col1.id && id !== col2.id);
        const newOrderIds = [col2.id, col1.id, ...otherIds];

        // Reorder via tableId as string "users"
        await adminApi.expectOk(
          adminApi.put("/admin/tables/users/columns/order", {
            columnIds: newOrderIds,
          })
        );

        const tableAfter = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        const colsAfter = tableAfter.columns.filter((c) => !c.isSystem && c.status === "active");
        const idx1 = colsAfter.findIndex((c) => c.id === col1.id);
        const idx2 = colsAfter.findIndex((c) => c.id === col2.id);

        assert.ok(idx2 < idx1, "Custom Field B is positioned before Custom Field A in users table");

        // Clean up: permanently delete both test columns
        await adminApi.expectOk(adminApi.del(`/admin/tables/users/columns/${col1.id}?permanent=true`));
        await adminApi.expectOk(adminApi.del(`/admin/tables/users/columns/${col2.id}?permanent=true`));
      },
    },
    {
      name: "users custom column permanent deletion removes definition and cascades profile values",
      fn: async ({ adminApi, assert, isolate }) => {
        const usersTable = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        const colKey = isolate.key("temp_field");

        const col = await adminApi.expectOk(
          adminApi.post(`/admin/tables/${usersTable.id}/columns`, {
            label: "Temporary Custom Field",
            key: colKey,
            dataType: "text",
          })
        );

        // Create user with value for this custom column
        const user = await adminApi.expectOk(
          adminApi.post("/admin/users", {
            email: isolate.email("cascade_test"),
            firstName: "Cascade",
            lastName: "Tester",
            password: "Password123!",
            roleKeys: ["employee"],
            values: { [colKey]: "ShouldBeDeleted" },
          })
        );
        assert.eq(user.values?.[colKey], "ShouldBeDeleted", "custom field value set on user");

        // Delete custom column permanently via /admin/tables/users/columns/:id?permanent=true
        const deleteRes = await adminApi.expectOk(
          adminApi.del(`/admin/tables/users/columns/${col.id}?permanent=true`)
        );
        assert.eq(deleteRes.deleted, true, "deleted is true");
        assert.eq(deleteRes.permanent, true, "permanent is true");

        // Verify column no longer exists in users table
        const tableAfter = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        assert.ok(!tableAfter.columns.some((c) => c.id === col.id), "column is removed from users table definition");

        // Verify user profile values no longer include the deleted column key
        const userAfter = await adminApi.expectOk(adminApi.get(`/admin/users/${user.id}`));
        assert.ok(!userAfter.values || userAfter.values[colKey] === undefined, "profile value was purged");
      },
    },
    {
      name: "users table rejects deletion of system columns like email, roles, status",
      fn: async ({ adminApi, assert }) => {
        const usersTable = await adminApi.expectOk(adminApi.get("/admin/tables/users"));
        const systemColumns = usersTable.columns.filter((c) => c.isSystem);
        assert.ok(systemColumns.length >= 4, "users table has system columns seeded");

        for (const sysCol of systemColumns) {
          const attempt = await adminApi.del(
            `/admin/tables/users/columns/${sysCol.id}?permanent=true`
          );
          assert.eq(
            attempt.status,
            409,
            `deleting system column "${sysCol.key}" is rejected with 409 Conflict`
          );
          assert.eq(
            attempt.body?.code,
            "SYSTEM_COLUMN_LOCKED",
            `system column "${sysCol.key}" reports SYSTEM_COLUMN_LOCKED code`
          );
        }
      },
    },
  ],
};
