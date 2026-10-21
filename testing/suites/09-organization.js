import { By } from "selenium-webdriver";

import { buildEntityType, buildMappedTable } from "../lib/fixtures.js";

/*
 * The organization screens are the far end of the builder chain: a type needs a
 * profile form and table, which only exist because definitions, a mapping and a
 * configuration were all set up first. The campus fixture therefore comes from
 * the API, while everything a person can only reach through a screen is driven
 * in the browser.
 */
export default {
  name: "organization",
  area: "Organization structure",

  setup: async ({ adminApi, isolate }) => {
    // A campus nests under a region, which is what lets an entity have children.
    const region = await buildEntityType({ adminApi, isolate, name: "Region" });

    const campus = await buildEntityType({
      adminApi,
      isolate,
      name: "Campus",
      parentTypeId: region.typeId,
      profileSpecs: [{ name: "Head", dataType: "text", value: "Ayesha Rahman" }],
      sectionSpecs: [{ name: "Room", dataType: "text", value: "R-101" }],
    });

    return { region, campus };
  },

  tests: [
    {
      name: "an entity type created in the dialog is listed with zero counts",
      screen: "/organization",
      fn: async ({ session, assert, isolate }) => {
        const label = isolate.label("Department");
        const key = isolate.key("department");

        await session.goto("/organization");
        await session.clickButton("New entity type");
        await session.openDialog("New entity type");

        await session.fill("entity-type-label", label);
        await session.fill("entity-type-key", key);
        await session.submitDialog();
        await session.expectToast("was created");

        // The list is paged, so the new type is found by searching for it.
        await session.fill("Search entity types", label);
        await session.waitRow(label);

        const cells = await session.rowCells(label);
        const configurations = await session.columnHeaderIndex("Configurations");
        const entities = await session.columnHeaderIndex("Entities");
        const status = await session.columnHeaderIndex("Status");

        assert.eq(cells[configurations], "0", `a new type has no configurations: ${JSON.stringify(cells)}`);
        assert.eq(cells[entities], "0", `a new type has no entities: ${JSON.stringify(cells)}`);

        /*
         * A trailing actions cell follows Status, so the badge is read by its
         * header rather than by counting back from the end of the row.
         */
        assert.eq(
          String(cells[status] ?? "").toLowerCase(),
          "active",
          `the row is marked active: ${JSON.stringify(cells)}`
        );

        await session.reload();
        await session.waitForApp();
        await session.fill("Search entity types", label);
        await session.waitRow(label);

        assert.ok(await session.rowExists(label), "the type survives a reload");
      },
    },
    {
      name: "a nested type reports the parent it was filed under",
      screen: "/organization",
      fn: async ({ session, assert, isolate }) => {
        const parent = isolate.label("Department");
        const child = isolate.label("Team");

        await session.goto("/organization");
        await session.clickButton("New entity type");
        await session.openDialog("New entity type");

        await session.fill("entity-type-label", child);
        await session.fill("entity-type-key", isolate.key("team"));
        await session.selectOption("entity-type-parent", parent);
        await session.submitDialog();
        await session.expectToast("was created");

        await session.fill("Search entity types", child);
        await session.waitForRows();

        const parentCell = await session.rowCells(child, {
          column: "Parent",
        });

        assert.eq(parentCell, parent, "the list shows the parent type");
      },
    },
    {
      name: "a duplicate key is refused and the dialog explains it",
      screen: "/organization",
      area: "Organization — definition guards",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const taken = isolate.key("department");

        await session.goto("/organization");
        await session.clickButton("New entity type");
        await session.openDialog("New entity type");

        await session.fill("entity-type-label", isolate.label("Department two"));
        await session.fill("entity-type-key", taken);
        await session.submitDialog();

        const alert = await session.driver
          .wait(
            async (driver) => {
              const paragraphs = await driver.findElements(
                By.xpath('//div[@role="dialog"]//p[@role="alert"]')
              );

              for (const paragraph of paragraphs) {
                const text = (await paragraph.getText()).trim();

                if (text) {
                  return text;
                }
              }

              return undefined;
            },
            8000,
            "the dialog never reported the refusal"
          )
          .catch(() => null);

        assert.includesText(
          alert || "",
          "already exists",
          `the duplicate key is refused in the dialog: ${alert}`
        );
        assert.ok(
          !/ER_|UNIQUE|mysql|sql/i.test(alert || ""),
          `the message carries no internals: ${alert}`
        );

        await session.closeDialog("New entity type");

        const list = await adminApi.expectOk(
          adminApi.get(
            `/organization/entity-types?search=${encodeURIComponent(isolate.label("Department two"))}`
          ),
          "read the types back"
        );

        assert.ok(
          !list.some((entry) => entry.key === taken),
          `no second type carries that key: ${JSON.stringify(list.map((entry) => entry.key))}`
        );
      },
    },
    {
      name: "the configuration dialog refuses a form and table with no mapping between them",
      screen: "/organization/:id",
      fn: async ({ session, assert, isolate, adminApi, campus }) => {
        const loose = await adminApi.expectOk(
          adminApi.post("/admin/forms", {
            label: isolate.label("Unmapped form"),
            key: isolate.key("unmapped_form"),
          }),
          "create a form that maps to nothing"
        );

        await session.goto("/organization");
        await session.fill("Search entity types", campus.typeLabel);
        await session.waitForRows();

        const link = await session.driver.findElement(
          By.xpath(`//table//a[normalize-space()="${campus.typeLabel}"]`)
        );

        await link.click();
        await session.step("open the campus type");
        assert.eq(await session.waitHeading("Entity type"), "Entity type", "the type screen opened");

        await session.clickButton("New configuration");
        await session.openDialog("New configuration");

        await session.selectOption("configuration-form", isolate.label("Unmapped form"));
        await session.selectOption("configuration-table", campus.section.pair.tableLabel);

        const badge = await session.driver.wait(
          async (driver) => {
            const spans = await driver.findElements(
              By.xpath('//div[@role="dialog"]//p[contains(normalize-space(),"not mapped")]')
            );

            return spans.length ? (await spans[0].getText()).trim() : undefined;
          },
          8000,
          "the dialog never described the pair"
        );

        assert.includesText(badge, "not mapped", "the pair is marked as unusable");

        await session.clickButton("Create configuration");

        const local = await session.fieldError("configuration-table");
        const onScreen = await session.visibleErrors();

        assert.ok(
          /active mapping between them/.test(String(local ?? "")) ||
            onScreen.some((text) => /active mapping between them/.test(text)),
          `the save is refused before it reaches the server: ${JSON.stringify(onScreen)}`
        );

        await adminApi.del(`/admin/forms/${loose.id}`);
        await session.closeDialog("New configuration");
      },
    },
    {
      name: "a configuration attached through the dialog appears on the type",
      screen: "/organization/:id",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const pair = await buildMappedTable({
          adminApi,
          isolate,
          name: "Block",
          specs: [{ name: "Label", dataType: "text" }],
        });

        const label = isolate.label("Block section");

        await session.goto("/organization");
        await session.fill("Search entity types", isolate.label("Department"));
        await session.waitForRows();

        const link = await session.driver.findElement(
          By.xpath(`//table//a[normalize-space()="${isolate.label("Department")}"]`)
        );

        await link.click();
        await session.step("open the department type");

        await session.clickButton("New configuration");
        await session.openDialog("New configuration");

        await session.fill("configuration-label", label);
        await session.selectOption("configuration-scope", "Section");
        await session.selectOption("configuration-form", pair.formLabel);
        await session.selectOption("configuration-table", pair.tableLabel);

        await session.driver.wait(
          async (driver) => {
            const paragraphs = await driver.findElements(
              By.xpath('//div[@role="dialog"]//p[contains(normalize-space(),"Mapped with")]')
            );

            for (const paragraph of paragraphs) {
              if (await paragraph.isDisplayed()) {
                return true;
              }
            }

            return undefined;
          },
          8000,
          "the dialog never confirmed an active mapping for the pair"
        );

        await session.clickButton("Create configuration");
        await session.expectToast("was created");

        await session.waitItem(label);

        const items = await session.orderedItems("//main//ul");

        assert.ok(
          items.some((row) => row.includes(label) && row.includes("section")),
          `the configuration is listed with its scope: ${JSON.stringify(items.map((row) => row.slice(0, 60)))}`
        );

        await session.reload();
        await session.waitForApp();
        await session.waitItem(label);

        assert.ok(
          (await session.orderedItems("//main//ul")).some((row) => row.includes(label)),
          "the configuration survives a reload"
        );
      },
    },
    {
      name: "an entity created with its profile values keeps them on its own screen",
      screen: "/organization/:id",
      fn: async ({ session, assert, isolate, campus }) => {
        const entityName = isolate.label("North campus");

        await session.goto("/organization");
        await session.fill("Search entity types", campus.typeLabel);
        await session.waitForRows();

        // "New <type>" belongs to the type screen, not to the list of types.
        const typeLink = await session.driver.findElement(
          By.xpath(`//table//a[normalize-space()="${campus.typeLabel}"]`)
        );

        await typeLink.click();
        await session.step("open the campus type");
        await session.waitForMainText(`New ${campus.typeLabel.toLowerCase()}`);

        await session.clickButton(`New ${campus.typeLabel.toLowerCase()}`);
        await session.anyDialogTitle(campus.typeLabel.toLowerCase());

        await session.fill("entity-name", entityName);
        await session.fill(campus.profile.pair.columns[0].label, "Ayesha Rahman");
        await session.submitDialog();
        await session.expectToast("was created");

        await session.waitRow(entityName);

        const link = await session.driver.findElement(
          By.xpath(`//table//a[normalize-space()="${entityName}"]`)
        );

        await link.click();
        await session.step("open the entity");
        assert.eq(await session.waitHeading("Entity"), "Entity", "the entity screen opened");

        const main = await session.text(By.css("main"));

        assert.includesText(main, "Ayesha Rahman", "the profile value is shown on the entity");
        assert.includesText(
          main,
          campus.profile.pair.formLabel,
          "the profile names the form its values came through"
        );
        assert.includesText(main, "Edit profile", "the profile offers a way to change it");
      },
    },
    {
      name: "a section record added from the entity screen is listed under that entity",
      screen: "/organization/entities/:entityId",
      fn: async ({ session, assert, isolate, adminApi, campus }) => {
        const entityName = isolate.label("North campus");

        const entities = await adminApi.expectOk(
          adminApi.get(`/organization/entities?search=${encodeURIComponent(entityName)}`),
          "find the entity"
        );

        const entityId = entities?.[0]?.id;

        assert.ok(entityId, `the entity from the previous test is still there (${entityId})`);

        await session.goto(`/organization/entities/${entityId}`);
        await session.waitForApp();

        await session.clickButton(`Add to ${campus.section.label.toLowerCase()}`);
        await session.step("opened the section entry dialog");

        await session.fill(campus.section.pair.columns[0].label, "R-101");
        await session.submitDialog();
        await session.expectToast("was added");

        await session.waitForRows();

        assert.ok(await session.rowExists("R-101"), "the section row is listed on the entity");

        const stored = await adminApi.expectOk(
          adminApi.get(
            `/tables/${campus.section.pair.tableId}/records?organizationEntityId=${entityId}`
          ),
          "read the section rows for this entity"
        );

        const rows = Array.isArray(stored) ? stored : (stored?.data ?? []);

        assert.ok(
          rows.length >= 1 &&
            rows.every((row) => Number(row.organizationEntityId) === Number(entityId)),
          `the section list is scoped to the entity (${rows.length} row(s))`
        );
      },
    },
    {
      name: "the type refuses to archive while it still has entities",
      screen: "/organization",
      area: "Organization — definition guards",
      fn: async ({ session, assert, adminApi, campus }) => {
        /*
         * The guard only bites while the type still holds an entity. Checked
         * before the click, so a missing entity fails here with its own reason
         * instead of archiving the type and breaking the next two tests.
         */
        const before = await adminApi.expectOk(
          adminApi.get(`/organization/entity-types/${campus.typeId}`),
          "read the type before archiving"
        );

        assert.ok(
          Number(before.entityCount) > 0,
          `the type needs an entity for the guard to refuse (${before.entityCount})`
        );

        await session.goto("/organization");
        await session.fill("Search entity types", campus.typeLabel);
        await session.waitForRows();

        await session.clickInRow(campus.typeLabel, "Archive");
        await session.openDialog("Archive entity type");
        await session.clickButton("Archive type");

        const toast = await session.expectToast("Archive them first");

        assert.includesText(toast, "active entity record", `the refusal counts what blocks it: ${toast}`);

        const after = await adminApi.expectOk(
          adminApi.get(`/organization/entity-types/${campus.typeId}`),
          "read the type back"
        );

        assert.eq(after.status, "active", "a refused archive leaves the type usable");
      },
    },
    {
      name: "an entity with children refuses to archive first",
      screen: "/organization/entities/:entityId",
      area: "Organization — definition guards",
      fn: async ({ session, assert, isolate, adminApi, region, campus }) => {
        const parent = await adminApi.expectOk(
          adminApi.post("/organization/entities", {
            entityTypeId: region.typeId,
            name: isolate.label("North region"),
          }),
          "create the region that will hold a child"
        );

        await adminApi.expectOk(
          adminApi.post("/organization/entities", {
            entityTypeId: campus.typeId,
            name: isolate.label("Annex campus"),
            parentEntityId: parent.id,
          }),
          "file a campus under the region"
        );

        await session.goto(`/organization/entities/${parent.id}`);
        await session.waitForApp();

        const main = await session.text(By.css("main"));

        assert.ok(
          /\b1 child/.test(main),
          `the parent badge counts its child: ${main.slice(0, 300)}`
        );

        // The header Archive is the first in the DOM; section rows repeat it.
        const headerArchive = await session.driver.findElements(
          By.xpath('(//button[normalize-space()="Archive"])[1]')
        );

        assert.eq(headerArchive.length, 1, "the entity offers exactly one header archive control");

        await headerArchive[0].click();
        await session.step("archive the parent entity");

        await session.openDialog("Archive entity");
        await session.clickButton("Archive entity");

        const toast = await session.expectToast("Archive them first");

        assert.includesText(toast, "active child record", `the refusal names the children: ${toast}`);

        const after = await adminApi.expectOk(
          adminApi.get(`/organization/entities/${parent.id}`),
          "read the entity back"
        );

        assert.eq(after.status, "active", "a refused archive leaves the entity usable");
      },
    },
    {
      name: "the tree refuses a parent of the wrong type",
      screen: "/organization/entities/:entityId",
      area: "Organization — definition guards",
      fn: async ({ assert, isolate, adminApi, region, campus }) => {
        const campuses = await adminApi.expectOk(
          adminApi.get(
            `/organization/entities?search=${encodeURIComponent(isolate.label("North campus"))}`
          ),
          "find the campus entity"
        );

        const campusEntityId = campuses?.[0]?.id;

        assert.ok(campusEntityId, `the campus from the earlier test exists (${campusEntityId})`);

        const wrongType = await adminApi.post("/organization/entities", {
          entityTypeId: campus.typeId,
          name: isolate.label("Wrongly nested campus"),
          parentEntityId: campusEntityId,
        });

        assert.eq(
          wrongType.status,
          400,
          `a campus cannot hang under another campus (${JSON.stringify(wrongType.body).slice(0, 200)})`
        );
        assert.includesText(
          JSON.stringify(wrongType.body),
          "different entity type",
          "the refusal says why"
        );

        const missing = await adminApi.post("/organization/entities", {
          entityTypeId: campus.typeId,
          name: isolate.label("Orphan campus"),
          parentEntityId: 999999,
        });

        assert.eq(missing.status, 400, "a parent that does not exist is refused");

        const flat = await adminApi.post("/organization/entities", {
          entityTypeId: region.typeId,
          name: isolate.label("Nested region"),
          parentEntityId: campusEntityId,
        });

        assert.eq(
          flat.status,
          409,
          `a type with no parent type cannot nest (${JSON.stringify(flat.body).slice(0, 200)})`
        );
        assert.includesText(JSON.stringify(flat.body), "cannot be nested", "and says why");
      },
    },
    {
      name: "an entity manages user memberships through the UI and API",
      screen: "/organization/entities/:entityId",
      area: "Organization — user memberships",
      fn: async ({ session, assert, isolate, adminApi }) => {
        const entityName = isolate.label("North campus");
        const entities = await adminApi.expectOk(
          adminApi.get(`/organization/entities?search=${encodeURIComponent(entityName)}`),
          "find the entity"
        );
        const entityId = entities?.[0]?.id;
        assert.ok(entityId, `the campus entity exists (${entityId})`);

        const userList = await adminApi.expectOk(
          adminApi.get(`/admin/users?search=${encodeURIComponent("e2e.employee@leave.test")}`),
          "fetch employee user"
        );
        const candidate = (userList || []).find((u) => u.email === "e2e.employee@leave.test") || userList[0];
        assert.ok(candidate, "found an active user candidate for membership");
        const candidateOption = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") + ` (${candidate.email})`;

        await session.goto(`/organization/entities/${entityId}`);
        await session.waitForApp();

        await session.clickButton("Add member");
        await session.anyDialogTitle("Add Member");

        await session.selectOption("member-user-id", candidateOption);
        await session.selectOption("member-role", "Lead / Head");
        await session.submitDialog();
        await session.expectToast("was added as");

        await session.driver.wait(
          async (driver) => {
            const items = await driver.findElements(
              By.xpath(`//main//li[contains(., "${candidate.email}")]`)
            );
            return items.length > 0 ? items[0] : undefined;
          },
          8000,
          "the member never appeared in the members panel"
        );

        let memberItem = await session.driver.findElement(
          By.xpath(`//main//li[contains(., "${candidate.email}")]`)
        );
        let itemText = await memberItem.getText();
        assert.includesText(itemText, "Lead", "the member has the Lead badge");

        const duplicate = await adminApi.post(`/organization/entities/${entityId}/members`, {
          userId: candidate.id,
          role: "member",
        });
        assert.eq(duplicate.status, 409, "duplicate member assignment is refused with 409");
        assert.includesText(JSON.stringify(duplicate.body), "already a member", "refusal reason explains duplicate");

        const changeRoleButton = await memberItem.findElement(
          By.xpath('.//button[normalize-space()="Change role"]')
        );
        await changeRoleButton.click();
        await session.anyDialogTitle("Edit Role");
        await session.selectOption("member-role", "Manager");
        await session.submitDialog();
        await session.expectToast("Role updated");

        await session.driver.wait(
          async () => {
            const text = await (await session.driver.findElement(
              By.xpath(`//main//li[contains(., "${candidate.email}")]`)
            )).getText();
            return text.includes("Manager") ? true : undefined;
          },
          8000,
          "the member badge never updated to Manager"
        );

        const memberships = await adminApi.expectOk(
          adminApi.get(`/organization/users/${candidate.id}/memberships`),
          "read user memberships"
        );
        const match = memberships.find((m) => Number(m.organizationEntityId) === Number(entityId));
        assert.ok(match, "user memberships endpoint lists the entity membership");
        assert.eq(match.role, "manager", "user membership role is manager");

        memberItem = await session.driver.findElement(
          By.xpath(`//main//li[contains(., "${candidate.email}")]`)
        );
        const removeButton = await memberItem.findElement(
          By.xpath('.//button[normalize-space()="Remove"]')
        );
        await removeButton.click();
        await session.openDialog("Remove member");
        await session.clickButton("Remove member");
        await session.expectToast("was removed");

        const afterMemberships = await adminApi.expectOk(
          adminApi.get(`/organization/users/${candidate.id}/memberships`),
          "read user memberships after removal"
        );
        assert.ok(
          !afterMemberships.some((m) => Number(m.organizationEntityId) === Number(entityId)),
          "user is no longer a member of the entity"
        );
      },
    },
  ],
};
