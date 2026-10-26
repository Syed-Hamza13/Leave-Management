import { By } from "selenium-webdriver";

const USER_LEAVE_ITEMS = [
  ["Leave Overview", "/leave", "Leave Dashboard"],
  ["My Leaves", "/leave/my-leaves", "My Leave Applications"],
  ["Apply Leave", "/leave/apply", "Apply for Leave"],
  ["Approvals", "/leave/approvals", "Approval Queue"],
  ["Team Calendar", "/leave/calendar", "Team Absence Calendar"],
];

const ADMIN_LEAVE_ITEMS = [
  ["Policies & Rules", "/admin/leave/policies", "Leave Policies"],
  ["Employee Balances", "/admin/leave/balances", "Employee Leave Balances"],
  ["Calendars & Holidays", "/admin/leave/calendars", "Calendars & Holidays"],
  ["Reports & Register", "/admin/leave/reports", "Leave Reports"],
];

export default {
  name: "leave-navigation",
  area: "Leave module navigation and RBAC visibility",
  tests: [
    {
      name: "the sidebar renders Leave and Leave Management groups for administrator",
      screen: "/leave",
      fn: async ({ session, assert, config }) => {
        await session.login(config.admin);

        for (const [label] of [...USER_LEAVE_ITEMS, ...ADMIN_LEAVE_ITEMS]) {
          assert.ok(
            await session.exists(
              By.xpath(`//nav[@aria-label="Main"]//a[normalize-space()="${label}"]`)
            ),
            `the "${label}" link is rendered in sidebar`
          );
        }
      },
    },
    {
      name: "every leave navigation link opens its screen and renders its heading",
      screen: "/leave",
      fn: async ({ session, assert, config }) => {
        await session.login(config.admin);

        for (const [label, path, heading] of [...USER_LEAVE_ITEMS, ...ADMIN_LEAVE_ITEMS]) {
          await session.clickNav(label);
          assert.eq(await session.pathname(), path, `${label} lands on ${path}`);
          assert.eq(
            await session.waitHeading(heading),
            heading,
            `${label} shows heading "${heading}"`
          );
        }
      },
    },
    {
      name: "a limited account sees personal leave features but is denied leave administration",
      screen: "/leave",
      requires: ["limited"],
      fn: async ({ session, assert, config, limitedApi }) => {
        await session.login(config.admin);
        await session.logout();
        await session.login(config.limited);

        const permissions = (await limitedApi.me()).permissions;
        assert.ok(!permissions.includes("leave.policies.manage"), "the limited account lacks admin permission");

        // User should see the personal leave link
        assert.ok(
          await session.exists(
            By.xpath('//nav[@aria-label="Main"]//a[normalize-space()="Apply Leave"]')
          ),
          "limited user sees Apply Leave in navigation"
        );

        // User should NOT see admin leave links
        assert.ok(
          !(await session.exists(
            By.xpath('//nav[@aria-label="Main"]//a[normalize-space()="Policies & Rules"]')
          )),
          "limited user cannot see Policies & Rules in navigation"
        );

        // Direct navigation to admin leave routes should display access denied
        await session.goto("/admin/leave/policies");
        await session.waitForText("You do not have access to this area");
      },
    },
  ],
};
