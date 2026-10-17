import { By } from "selenium-webdriver";

export default {
  name: "auth",
  area: "Authentication and session",
  tests: [
    {
      name: "a malformed email is stopped by the browser and refused by the API",
      screen: "/login",
      fn: async ({ session, assert, adminApi }) => {
        await session.ensureSignedOut();
        await session.fill("email", "not-an-email");
        await session.fill("password", "Whatever1!x");
        await session.clickButton("Sign in");

        const blocked = await session.formSubmissionBlocked();

        assert.ok(
          blocked.reported,
          `the browser must refuse to submit a malformed address (${blocked.reason})`
        );
        assert.ok(!(await session.isLoggedIn()), "the browser is still unauthenticated");
        assert.eq(await session.pathname(), "/login", "stayed on the login route");

        /*
         * The same rule has to hold for a client that never renders the form, so
         * the server's own rejection is checked through the API.
         */
        const rejected = await adminApi.raw("POST", "/auth/login", {
          email: "not-an-email",
          password: "Whatever1!x",
        });

        assert.eq(rejected.status, 400, "the API refuses the malformed address");
        assert.includesText(
          JSON.stringify(rejected.body),
          "Invalid email address",
          "the API names the failing field"
        );
      },
    },
    {
      name: "an empty password reports the required error",
      screen: "/login",
      fn: async ({ session, assert }) => {
        await session.ensureSignedOut();
        await session.fill("email", "someone@example.com");
        await session.fill("password", "");
        await session.clickButton("Sign in");

        const blocked = await session.formSubmissionBlocked();

        assert.ok(
          !blocked.reported,
          `the browser lets an optional password field through to the API (${blocked.reason})`
        );

        const shown = await session.fieldError("password");
        const onScreen = await session.visibleErrors();

        assert.includesText(
          shown || "",
          "Password is required",
          `password field error (screen shows ${JSON.stringify(onScreen)})`
        );
      },
    },
    {
      name: "wrong credentials are refused with a neutral message",
      screen: "/login",
      fn: async ({ session, assert, config }) => {
        await session.ensureSignedOut();
        await session.fill("email", config.admin.email);
        await session.fill("password", "WrongPassword!1");
        await session.clickButton("Sign in");

        await session.waitForText("Invalid email or password.");
        assert.eq(await session.pathname(), "/login", "still on /login after a rejected sign-in");

        const text = await session.text(By.css("main, body"));

        assert.ok(!/password_hash|ER_|SELECT .* FROM/i.test(text), "no internal detail leaked to the page");
      },
    },
    {
      name: "a valid sign-in sets the session and CSRF cookies",
      screen: "/",
      fn: async ({ session, assert, config }) => {
        await session.goto("/login");
        await session.login(config.admin);

        assert.ok((await session.cookie("leave.sid")) !== null, "the session cookie is set");
        assert.ok((await session.cookie("csrf-token")) !== null, "the CSRF cookie is set");
        assert.eq(await session.heading(), "Dashboard", "dashboard heading after sign-in");
      },
    },
    {
      name: "the sidebar names the signed-in account",
      screen: "/",
      fn: async ({ session, assert, config }) => {
        await session.login(config.admin);

        assert.includesText(await session.sidebarUserText(), config.admin.email, "sidebar shows the account");
      },
    },
    {
      name: "the session survives a full page reload",
      screen: "/admin/fields",
      fn: async ({ session, assert }) => {
        await session.goto("/admin/fields");
        await session.reload();

        assert.ok(await session.isLoggedIn(), "still authenticated after reload");
        assert.eq(await session.pathname(), "/admin/fields", "the deep link is restored");
      },
    },
    {
      name: "signing out returns to the login screen and locks the dashboard again",
      screen: "/login",
      fn: async ({ session, assert, config }) => {
        await session.login(config.admin);
        await session.logout();

        assert.eq(await session.pathname(), "/login", "signed out to /login");

        await session.goto("/");
        await session.waitPath("/login");

        assert.ok(!(await session.isLoggedIn()), "the dashboard is not reachable while signed out");

        await session.login(config.admin);
      },
    },
    {
      name: "a deleted session cookie sends a protected route back to sign-in",
      screen: "/login",
      fn: async ({ session, assert, config }) => {
        await session.login(config.admin);
        await session.deleteCookie("leave.sid");
        await session.goto("/admin/users");

        await session.waitPath("/login", 15000);
        assert.ok(!(await session.isLoggedIn()), "the shell is gone without a session");

        await session.login(config.admin);
      },
    },
    {
      name: "the readiness endpoint answers and the login failure path stays clean",
      fn: async ({ adminApi, assert }) => {
        const health = await adminApi.get("/health");

        assert.eq(health.status, 200, "health status");

        const rejected = await adminApi.raw("POST", "/auth/login", { email: "nope", password: "" });

        assert.eq(rejected.status, 400, "malformed login payload status");
        assert.eq(rejected.body.message, "Validation failed", "validation envelope message");
        assert.ok(
          JSON.stringify(rejected.body).includes("Invalid email address"),
          "the field error text is returned"
        );
        assert.ok(
          !JSON.stringify(rejected.body).match(/sql|stack|insert into/i),
          "the validation response carries no SQL or stack detail"
        );
      },
    },
    {
      name: "an account that is not active cannot sign in",
      fn: async ({ adminApi, assert, isolate }) => {
        const email = isolate.email("disabled");
        const created = await adminApi.post("/admin/users", {
          email,
          password: "E2eCreated!2026",
          firstName: "E2E",
          lastName: "Disabled",
        });

        assert.eq(
          created.status,
          201,
          `bootstrap account created (${JSON.stringify(created.body).slice(0, 250)})`
        );

        const userId = created.body?.data?.id;

        assert.ok(typeof userId === "number", "the create response carries the new id");

        const update = await adminApi.patch(`/admin/users/${userId}`, { status: "disabled" });

        assert.eq(update.status, 200, `account disabled (${JSON.stringify(update.body).slice(0, 250)})`);

        const attempt = await adminApi.raw("POST", "/auth/login", {
          email,
          password: "E2eCreated!2026",
        });

        assert.eq(attempt.status, 401, "a non-active account is refused");
        assert.includesText(
          JSON.stringify(attempt.body),
          "Invalid email or password",
          "the refusal stays generic and does not confirm the account exists"
        );
      },
    },
  ],
};
