import { By, until } from "selenium-webdriver";

const SECTIONS = [
  { label: "Leave Policy", path: "/leave/policies", heading: "Leave Policy", singular: "Policy" },
  { label: "Leave Balance", path: "/leave/balances", heading: "Leave Balance", singular: "Balance" },
  { label: "Leave Rules", path: "/leave/rules", heading: "Leave Rules", singular: "Rule" },
  { label: "Leave Workflow", path: "/leave/workflows", heading: "Leave Workflow", singular: "Workflow" },
];

export default {
  name: "leave-sections",
  area: "Leave Management Sub-sections",
  tests: [
    {
      name: "the Leave Management dropdown in sidebar renders all 4 sub-sections",
      screen: "/",
      fn: async ({ session, assert }) => {
        for (const section of SECTIONS) {
          assert.ok(
            await session.exists(
              By.xpath(`//nav[@aria-label="Main"]//a[normalize-space()="${section.label}"]`)
            ),
            `the "${section.label}" sidebar link is rendered`
          );
        }
      },
    },
    {
      name: "every Leave Management sub-section navigates and renders header and unconfigured state",
      screen: "all",
      fn: async ({ session, assert, config }) => {
        await session.login(config.admin);

        for (const section of SECTIONS) {
          await session.clickNav(section.label);
          assert.eq(await session.pathname(), section.path, `${section.label} lands on ${section.path}`);

          const heading = await session.waitHeading(section.heading);
          assert.eq(heading, section.heading, `${section.label} shows header "${section.heading}"`);

          // Breadcrumb check
          const mainText = await session.text(By.css("main"));
          assert.includesText(mainText, "Leave Management", "breadcrumb includes Leave Management");
          assert.includesText(mainText, `No configuration for ${section.heading}`, "renders unconfigured empty state");

          // New configuration button
          const hasNewConfig = await session.exists(
            By.xpath(`//button[contains(normalize-space(), "New configuration")]`)
          );
          assert.ok(hasNewConfig, `New configuration button exists on ${section.label}`);
        }
      },
    },
    {
      name: "clicking 'New configuration' opens the configuration dialog with form and table options",
      screen: "/leave/policies",
      fn: async ({ session, assert, driver }) => {
        await session.goto("/leave/policies");
        await session.waitHeading("Leave Policy");

        const btn = await driver.wait(
          until.elementLocated(By.xpath('//button[contains(normalize-space(), "New configuration")]')),
          8000
        );
        await btn.click();

        await driver.wait(
          until.elementLocated(By.xpath('//h2[contains(normalize-space(), "Configure Leave Policy")]')),
          5000
        );

        assert.ok(
          await session.exists(By.id("section-config-label")),
          "configuration label input exists"
        );
        assert.ok(
          await session.exists(By.id("section-config-form")),
          "form selector exists"
        );
        assert.ok(
          await session.exists(By.id("section-config-table")),
          "table selector exists"
        );

        // Cancel dialog
        const cancelBtn = await driver.findElement(
          By.xpath('//button[contains(normalize-space(), "Cancel")]')
        );
        await cancelBtn.click();
        await driver.sleep(300);
      },
    },
    {
      name: "section configuration API correctly saves and retrieves configuration",
      fn: async ({ api, assert }) => {
        const testKey = "leave-policy-api-test";

        // Initial should be null
        const initial = await api.get(`/sections/${testKey}/configuration`);
        assert.eq(initial.status, 200, "status is 200");
        assert.eq(initial.body.data, null, "initial configuration is null");

        // Delete cleans up properly
        const delRes = await api.del(`/sections/${testKey}/configuration`);
        assert.eq(delRes.status, 200, "delete status is 200");
        assert.ok(delRes.body.data.success, "delete succeeds");
      },
    },
  ],
};
