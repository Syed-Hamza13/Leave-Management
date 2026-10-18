import { By, Key, until } from "selenium-webdriver";

const NAV_ITEMS = [
  ["Dashboard", "/", "Dashboard"],
  ["Browse records", "/records", "Records"],
  ["Fields", "/admin/fields", "Fields"],
  ["Dropdowns", "/admin/dropdowns", "Dropdowns"],
  ["Forms", "/admin/forms", "Forms"],
  ["Tables", "/admin/tables", "Tables"],
  ["Form mappings", "/admin/mappings", "Form mappings"],
  ["Users", "/admin/users", "Users"],
  ["Structure", "/organization", "Organization structure"],
  ["Platform settings", "/admin/settings", "Platform settings"],
  ["Audit trail", "/admin/audit", "Audit trail"],
];

export default {
  name: "navigation",
  area: "Application shell and navigation",
  tests: [
    {
      name: "the sidebar lists every shipped screen under its group heading",
      screen: "/",
      fn: async ({ session, assert }) => {
        const sidebar = await session.sidebarUserText();

        // Group headings are rendered uppercase by CSS, so compare loosely.
        for (const heading of ["Records", "Administration", "Organization", "Settings"]) {
          assert.includesText(
            sidebar.toLowerCase(),
            heading.toLowerCase(),
            `group heading ${heading}`
          );
        }

        for (const [label] of NAV_ITEMS) {
          assert.ok(
            await session.exists(
              By.xpath(`//nav[@aria-label="Main"]//a[normalize-space()="${label}"]`)
            ),
            `the "${label}" link is rendered`
          );
        }
      },
    },
    {
      name: "every sidebar link opens its screen and updates the document title",
      screen: "all",
      fn: async ({ session, assert, config }) => {
        await session.login(config.admin);

        for (const [label, path, heading] of NAV_ITEMS) {
          await session.clickNav(label);
          assert.eq(await session.pathname(), path, `${label} lands on ${path}`);
          assert.eq(
            await session.waitHeading(heading),
            heading,
            `${label} shows its own heading`
          );
          assert.includesText(
            await session.documentTitle(),
            heading,
            `${label} sets the document title`
          );
        }
      },
    },
    {
      name: "the dashboard cards navigate into the builders",
      screen: "/",
      fn: async ({ session, assert }) => {
        await session.goto("/");

        const card = await session.driver.wait(
          until.elementLocated(By.xpath('//a[contains(normalize-space(),"Fields")]')),
          8000
        );

        await card.click();
        await session.step("clicked the dashboard card");

        assert.eq(await session.pathname(), "/admin/fields", "the card links to the fields screen");
      },
    },
    {
      name: "the skip link reaches the main region by keyboard",
      screen: "/",
      fn: async ({ session, assert, driver }) => {
        await session.goto("/");

        await driver.actions({ async: true }).keyDown(Key.TAB).keyUp(Key.TAB).perform();

        const active = await driver.executeScript(
          "return document.activeElement ? document.activeElement.textContent : null;"
        );

        assert.includesText(String(active || ""), "Skip to main content", "the first tab stop is the skip link");

        await driver.executeScript(
          `document.querySelector('a[href="#main-content"]').click();`
        );

        const focusedId = await driver.executeScript("return document.activeElement.id;");

        assert.eq(focusedId, "main-content", "the skip link moves focus into the main region");
      },
    },
    {
      name: "the mobile drawer is closed to keyboard users and opens on demand",
      screen: "/",
      fn: async ({ session, assert, driver }) => {
        const original = await driver.manage().window().getSize();

        await driver.manage().window().setSize({ width: 480, height: 900 });
        await session.goto("/");

        const drawer = await driver.findElement(By.css("#app-navigation"));

        assert.ok(!(await drawer.isDisplayed()), "the off-canvas drawer is hidden at mobile width");

        await session.clickButton("Menu");
        await driver.wait(until.elementIsVisible(drawer), 5000);
        assert.ok(await drawer.isDisplayed(), "the drawer opens after tapping Menu");

        await session.clickNav("Fields");
        assert.eq(await session.pathname(), "/admin/fields", "a drawer link still navigates");

        await driver.manage().window().setSize({ width: original.width, height: original.height });
        await session.goto("/");
      },
    },
    {
      name: "an address that matches no screen reports rather than blanking",
      screen: "/definitely-not-a-route",
      fn: async ({ session, assert }) => {
        await session.goto("/definitely-not-a-route");

        await session.waitForText("This page does not exist");
        assert.ok(
          await session.exists(By.xpath('//a[normalize-space()="Back to the dashboard"]')),
          "the not-found state offers a way back"
        );
      },
    },
    {
      name: "a limited account is turned away from an administration screen",
      screen: "/admin/fields",
      area: "Authorization and permissions",
      requires: ["limited"],
      fn: async ({ session, assert, config, limitedApi }) => {
        await session.login(config.admin);
        await session.logout();
        await session.login(config.limited);

        const permissions = (await limitedApi.me()).permissions;

        assert.ok(!permissions.includes("admin.fields.view"), "the limited account really lacks the permission");

        await session.goto("/admin/fields");
        await session.waitForText("You do not have access to this area");

        assert.includesText(await session.documentTitle(), "Fields", "the route title still renders");

        await session.login(config.admin);
        await session.goto("/admin/fields");
        assert.eq(
          await session.waitHeading("Fields"),
          "Fields",
          "the same screen opens for the administrator"
        );
      },
    },
    {
      name: "a limited account cannot write through the API either",
      screen: "/admin/fields",
      area: "Authorization and permissions",
      requires: ["limited"],
      fn: async ({ limitedApi, assert, isolate }) => {
        const attempt = await limitedApi.post("/admin/fields", {
          label: isolate.label("Forbidden field"),
          key: isolate.key("forbidden_field"),
          dataType: "text",
        });

        assert.eq(attempt.status, 403, "the API refuses the write");
        assert.ok(
          !JSON.stringify(attempt.body).match(/INSERT|SQL|stack/i),
          "the refusal carries no internals"
        );
      },
    },
  ],
};
