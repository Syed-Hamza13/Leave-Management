import { By } from "selenium-webdriver";

import { isolate } from "../config.js";

export default {
  name: "smoke",
  area: "Harness and application shell",
  tests: [
    {
      name: "the login screen renders and the harness can drive it",
      screen: "/login",
      fn: async ({ session, assert, driver }) => {
        await session.ensureSignedOut();

        assert.eq(await session.heading(), "Leave Management System", "login heading");
        assert.ok(
          await session.exists(By.css("input#email")),
          "the email input is present"
        );
        assert.ok(
          await session.exists(By.css("input[type=password]")),
          "the password input is present"
        );

        const size = await driver.manage().window().getSize();

        assert.ok(size.width >= 1200, `browser window is wide enough, got ${size.width}px`);
      },
    },
    {
      name: "signing in reaches the dashboard with the shell chrome",
      screen: "/",
      fn: async ({ session, assert, config }) => {
        await session.login(config.admin);

        assert.eq(await session.heading(), "Dashboard", "dashboard heading");
        assert.ok(await session.exists(By.css("#app-navigation")), "the sidebar rendered");
        assert.includesText(
          await session.text(By.css("main")),
          "Signed in as",
          "the dashboard names the signed-in user"
        );
        assert.includesText(
          await session.documentTitle(),
          "Dashboard",
          "document title tracks the route"
        );
      },
    },
    {
      name: "the run tag is visible to the report so leftovers are traceable",
      fn: async ({ assert }) => {
        assert.ok(isolate.tag.startsWith("E2E"), `isolation tag looks right: ${isolate.tag}`);
        assert.eq(isolate.key("Leave_Request"), `leave_request_${isolate.tag.toLowerCase()}`, "key builder");
      },
    },
  ],
};
