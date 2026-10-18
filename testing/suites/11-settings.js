import { By } from "selenium-webdriver";

import { ApiClient } from "../lib/api.js";

/*
 * Mail settings are the only screen whose save changes an outbound credential, so
 * every case here is a refusal: a port outside the range, an address that is not an
 * email, a host carrying a scheme. Each of those fails before the server writes
 * anything, which keeps this installation's own configuration intact while still
 * proving the card checks its values. The stored state is read before the suite and
 * re-read at the end to make that claim testable.
 *
 * "Test connection" is deliberately never clicked: it opens a real socket to
 * whatever host the card holds, which is a side effect no test should cause.
 */

const PASSWORD = "E2eViewer!2026";

async function smtpState(adminApi) {
  return adminApi.expectOk(adminApi.get("/admin/settings/smtp"), "read the stored mail settings");
}

function keys(list) {
  return (list ?? []).map((entry) => (typeof entry === "string" ? entry : entry.key));
}

export default {
  name: "settings",
  area: "Settings — SMTP card, validation and permission gates",
  async setup({ adminApi, isolate, config }) {
    const me = await adminApi.me();

    if (!keys(me.permissions).includes("admin.settings.manage")) {
      throw new Error(
        `The configured E2E admin (${config.admin.email}) has no admin.settings.manage, so the mail card cannot be edited or gated.`
      );
    }

    const before = await smtpState(adminApi);

    /*
     * An account that may view settings but not change them, to prove the gate is
     * the permission and not the screen.
     */
    const viewer = await adminApi.expectOk(
      adminApi.post("/admin/users", {
        email: isolate.email("settingsviewer"),
        firstName: "Zubair",
        lastName: "Ahmed",
        password: PASSWORD,
        roleKeys: ["admin"],
      }),
      "create the administrator account used for the permission gate"
    );

    return { before, viewer };
  },
  tests: [
    {
      name: "the settings card shows the transport but never the stored password",
      screen: "/admin/settings",
      fn: async ({ session, assert, adminApi, before }) => {
        await session.goto("/admin/settings");
        await session.waitHeading("Platform settings");
        await session.waitForText("Outgoing mail (SMTP)");

        const main = await session.text(By.css("main"));

        assert.includesText(
          main,
          "Credentials are encrypted at rest",
          "the card says the credential stays hidden"
        );

        const badge = await session.anyText(
          By.xpath(
            '//span[contains(normalize-space(),"Password stored") or contains(normalize-space(),"No password stored")]'
          )
        );

        assert.ok(
          badge && badge.includes("Password stored") === before.passwordConfigured,
          `the badge agrees with the server (${badge} vs ${before.passwordConfigured})`
        );

        assert.eq(
          await session.controlValue("smtp-password"),
          "",
          "the password field is empty, never a mask of the secret"
        );

        const dump = JSON.stringify(await smtpState(adminApi));

        assert.ok(
          !/envelope|"password"\s*:|"iv"\s*:|ciphertext/i.test(dump),
          `the read endpoint carries no credential: ${dump.slice(0, 300)}`
        );
      },
    },
    {
      name: "the save button waits for a real change on the card",
      screen: "/admin/settings",
      fn: async ({ session, assert, adminApi, before }) => {
        await session.goto("/admin/settings");
        await session.waitForText("Outgoing mail (SMTP)");

        assert.eq(await session.isDisabled("Save mail settings"), true, "nothing is savable before an edit");
        assert.eq(await session.isDisabled("Discard changes"), true, "and there is nothing to discard");

        await session.fill("smtp-host", "mail.internal.test");

        assert.eq(await session.isDisabled("Save mail settings"), false, "a typed host makes the card dirty");
        assert.eq(await session.isDisabled("Discard changes"), false, "and the discard becomes available");

        await session.clickButton("Discard changes");

        assert.eq(
          await session.controlValue("smtp-host"),
          before.host,
          "discarding puts the stored value back in the field"
        );

        const state = await smtpState(adminApi);

        assert.eq(state.host, before.host, "and the discarded host was never saved");
      },
    },
    {
      name: "a port outside the range is refused and reported on its field",
      screen: "/admin/settings",
      fn: async ({ session, assert, adminApi, before }) => {
        await session.goto("/admin/settings");
        await session.waitForText("Outgoing mail (SMTP)");

        await session.fill("smtp-port", "99999");
        await session.clickButton("Save mail settings");

        const error = await session.fieldError("smtp-port");

        assert.includesText(error || "", "65535", `the port field names its limit: ${error}`);

        const alert = await session.anyText(By.xpath('//main//p[@role="alert"]'));

        assert.ok(alert, "the card reports the failure on itself");
        assert.ok(
          !/ER_|SQL|mysql|stack/i.test(alert || ""),
          `and leaks no server detail: ${alert}`
        );

        await session.clickButton("Discard changes");

        const state = await smtpState(adminApi);

        assert.eq(state.port, before.port, "the refused save left the stored port alone");
      },
    },
    {
      name: "an address that is not an email is refused before it is stored",
      screen: "/admin/settings",
      fn: async ({ session, assert, adminApi, before }) => {
        await session.goto("/admin/settings");
        await session.waitForText("Outgoing mail (SMTP)");

        await session.fill("smtp-from", "not-an-email");
        await session.clickButton("Save mail settings");

        const error = await session.fieldError("smtp-from");

        assert.includesText(error || "", "valid email", `the address field says what is wrong: ${error}`);

        await session.clickButton("Discard changes");

        const state = await smtpState(adminApi);

        assert.eq(state.fromAddress, before.fromAddress, "no invalid address was stored");
      },
    },
    {
      name: "a host carrying a scheme is refused with the hostname rule",
      screen: "/admin/settings",
      fn: async ({ session, assert, adminApi, before }) => {
        await session.goto("/admin/settings");
        await session.waitForText("Outgoing mail (SMTP)");

        await session.fill("smtp-host", "https://smtp.test");
        await session.clickButton("Save mail settings");

        const error = await session.fieldError("smtp-host");
        const alert = await session.anyText(By.xpath('//main//p[@role="alert"]'));

        assert.ok(
          /hostname|smtp\.example\.com|scheme/i.test(`${error} ${alert}`),
          `the refusal explains the shape it wants: ${error} | ${alert}`
        );

        await session.clickButton("Discard changes");

        const state = await smtpState(adminApi);

        assert.eq(state.host, before.host, "the host the server refused was never written");
      },
    },
    {
      name: "the authentication picker takes the username out of the card when it is not needed",
      screen: "/admin/settings",
      fn: async ({ session, assert, before }) => {
        await session.goto("/admin/settings");
        await session.waitForText("Outgoing mail (SMTP)");

        const passwordMode = before.authMode === "password";

        assert.eq(
          await session.isControlDisabled("smtp-username"),
          !passwordMode,
          `username is editable exactly when the mode needs it (${before.authMode})`
        );

        await session.selectOption("smtp-auth-mode", passwordMode ? "No authentication" : "Username and password");

        assert.eq(
          await session.isControlDisabled("smtp-username"),
          passwordMode,
          "switching the mode flips the username field with it"
        );
        assert.eq(
          await session.isControlDisabled("smtp-password"),
          passwordMode,
          "and the password field too"
        );

        await session.clickButton("Discard changes");

        assert.eq(
          await session.controlValue("smtp-auth-mode"),
          before.authMode,
          "discarding returns the picker to its stored mode"
        );
      },
    },
    {
      name: "the TLS switch changes only the draft, not the server",
      screen: "/admin/settings",
      fn: async ({ session, assert, adminApi, before }) => {
        await session.goto("/admin/settings");
        await session.waitForText("Outgoing mail (SMTP)");

        const beforeHint = await session.anyText(By.xpath('//p[@id="smtp-secure-hint"]'));

        await session.setCheckbox("smtp-secure", !before.secure);

        const afterHint = await session.anyText(By.xpath('//p[@id="smtp-secure-hint"]'));

        assert.ok(afterHint, `the switch keeps its hint while the draft changes: ${afterHint}`);
        assert.ok(
          afterHint !== beforeHint,
          `the hint follows the switch (${beforeHint} → ${afterHint})`
        );

        assert.includesText(
          afterHint,
          before.secure ? "STARTTLS" : "465",
          "and names the mode the switch now describes"
        );

        await session.clickButton("Discard changes");

        const state = await smtpState(adminApi);

        assert.eq(state.secure, before.secure, "the switch was never saved");
      },
    },
    {
      name: "an account that may view settings cannot change them",
      screen: "/admin/settings",
      fn: async ({ session, assert, adminApi, viewer, config }) => {
        const viewerApi = new ApiClient();

        await viewerApi.login({ email: viewer.email, password: PASSWORD });

        const mine = await viewerApi.me();

        assert.ok(
          keys(mine.permissions).includes("admin.settings.view"),
          `the administrator really may view settings (${keys(mine.permissions).join(",")})`
        );
        assert.ok(
          !keys(mine.permissions).includes("admin.settings.manage"),
          "and really may not manage them"
        );

        const forbidden = await viewerApi.patch("/admin/settings/smtp", { port: 2525 });

        assert.eq(forbidden.status, 403, "the API refuses the change from a viewer");

        try {
          await session.login({ email: viewer.email, password: PASSWORD });

          await session.goto("/admin/settings");
          await session.waitForText("Outgoing mail (SMTP)");

          const main = await session.text(By.css("main"));

          assert.includesText(
            main,
            "You can review these settings but not change them",
            "the card says what is missing"
          );

          assert.eq(await session.isControlDisabled("smtp-host"), true, "the host field is locked");
          assert.eq(await session.isControlDisabled("smtp-port"), true, "the port field is locked");
          assert.eq(
            await session.exists(session.button("Save mail settings")),
            false,
            "and there is no save control at all"
          );
        } finally {
          await adminApi.patch(`/admin/users/${viewer.id}`, { status: "disabled" });
          await session.login(config.admin);
        }

        const state = await smtpState(adminApi);

        assert.ok(
          state.port !== 2525,
          `the refused write never reached the stored port (${state.port})`
        );
      },
    },
    {
      name: "the card leaves the mail state exactly as it found it",
      fn: async ({ adminApi, assert, before }) => {
        const after = await smtpState(adminApi);

        for (const key of ["host", "port", "secure", "username", "fromAddress", "authMode"]) {
          assert.eq(after[key], before[key], `${key} is untouched after the whole suite`);
        }

        assert.eq(after.passwordConfigured, before.passwordConfigured, "the credential was never written or cleared");

        const events = await adminApi.expectOk(
          adminApi.get("/admin/audit/events?action=settings.smtp.update&pageSize=50"),
          "look for a settings save in the audit trail"
        );

        const rows = Array.isArray(events) ? events : [];

        assert.eq(
          rows.filter((row) => row.summary?.host === "mail.internal.test").length,
          0,
          "no draft typed by this run reached the mail settings"
        );
      },
    },
  ],
};
