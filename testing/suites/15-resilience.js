import { By, until } from "selenium-webdriver";

import { buildMappedTable } from "../lib/fixtures.js";

/*
 * Nothing here exercises a feature. It exercises what a screen does when a
 * feature answers slowly, answers "no", or has nothing to show: a save still in
 * flight, a refusal coming back from the server, an empty list, an address with
 * no screen behind it, and a session that ends halfway through a task.
 *
 * Two tests need a request that answers slowly, because a busy state cannot be
 * observed on a request that finished before the next WebDriver call. The delay
 * is installed inside the page, around the browser's own fetch, and the next
 * navigation removes it. The server is never modified and no second server is
 * started.
 *
 * Every test also reads the page's own error listeners: an uncaught exception is
 * a defect even when the assertions pass around it.
 */

/**
 * Records every non-GET request the page makes and, optionally, holds it back
 * for a moment so the UI's pending state can be observed. The wrapper lives on
 * the page only until the next navigation.
 */
async function instrumentWrites(driver, { delayMs = 0 } = {}) {
  await driver.executeScript(`
    window.__e2eWrites = [];

    if (window.__e2eWriteProbe === true) return;

    const delay = ${Number(delayMs) || 0};
    const native = window.fetch;

    window.__e2eWriteProbe = true;

    window.fetch = function (input, init) {
      const method = String(
        (init && init.method) || (typeof input === "object" && input.method) || "GET"
      ).toUpperCase();

      const writing = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

      if (writing) {
        window.__e2eWrites.push({
          method,
          url: typeof input === "string" ? input : input.url,
        });
      }

      const send = () => native.apply(window, arguments);

      return writing && delay > 0
        ? new Promise((resolve) => setTimeout(resolve, delay)).then(send)
        : send();
    };
  `);
}

const writeLog = (driver) =>
  driver.executeScript("return (window.__e2eWrites || []).slice();");

/** Clicks every submit button in the open dialog, busy or not. */
async function clickSubmitAgain(driver) {
  return driver.executeScript(`
    const buttons = Array.from(
      document.querySelectorAll('div[role="dialog"] button[type="submit"]')
    );

    if (!buttons.length) return "no submit button on the screen";

    const busy = buttons.some((button) => button.disabled);

    buttons.forEach((button) => button.click());

    return busy
      ? "the busy button was refused by the browser"
      : "every submit button accepted the click";
  `);
}

/** Uncaught exceptions the page reported since it was loaded. */
const scriptErrors = (driver) =>
  driver.executeScript(
    "return window.__e2eProbe ? window.__e2eProbe.store.errors.slice() : [];"
  );

async function openNewField(session) {
  await session.goto("/admin/fields");
  await session.clickButton("New field");
  await session.openDialog("New field");
}

async function fillNewField(session, { label, key }) {
  await session.fill("field-label", label);
  await session.fill("field-key", key);
}

/** Resolves once the open dialog has printed its page-level failure. */
async function waitDialogAlert(session) {
  const alert = await session.driver.wait(
    until.elementLocated(
      By.xpath('//div[@role="dialog"]//p[@role="alert"]')
    ),
    15000,
    "The dialog never reported the server's refusal"
  );

  return alert.getText();
}

/** Polls the rendered messages until one of them carries the needle. */
async function waitErrorText(session, needle, timeout = 15000) {
  const limit = Date.now() + timeout;

  while (Date.now() < limit) {
    const messages = await session.visibleErrors();

    if (messages.some((entry) => entry.includes(needle))) {
      return messages;
    }

    await session.driver.sleep(250);
  }

  return session.visibleErrors();
}

export default {
  name: "resilience",
  area: "Resilience — pending, refusal, empty and lost-session states",

  async setup({ adminApi, isolate }) {
    const fixture = await buildMappedTable({
      adminApi,
      isolate,
      name: "Resilience",
      specs: [{ name: "notes", dataType: "text" }],
    });

    return { fixture };
  },

  tests: [
    {
      name: "a save still in flight leaves a busy control, not a dead button",
      area: "Resilience — pending state",
      screen: "/admin/fields",
      fn: async ({ session, driver, assert, isolate }) => {
        const label = isolate.label("Busy save");

        await openNewField(session);
        await fillNewField(session, { label, key: isolate.key("busy_save") });

        await instrumentWrites(driver, { delayMs: 1500 });

        await session.clickButton("Create field");

        /*
         * The injected delay keeps the request open long enough that this is a
         * measurement rather than a race: the button has to report its own state.
         */
        const state = await driver.executeScript(`
          const buttons = Array.from(
            document.querySelectorAll('div[role="dialog"] button[type="submit"]')
          );

          const busy = buttons.find((button) => button.disabled) || buttons[0] || null;

          return {
            found: Boolean(busy),
            disabled: busy ? busy.disabled : null,
            ariaBusy: busy ? busy.getAttribute("aria-busy") : null,
            spinners: busy ? busy.querySelectorAll('svg[role="status"]').length : 0,
            label: busy ? busy.textContent.trim() : null,
          };
        `);

        assert.ok(state.found, "the dialog still shows its submit button while saving");
        assert.eq(state.disabled, true, "which is disabled so it cannot be pressed again");
        assert.eq(state.ariaBusy, "true", "and says so to assistive technology");
        assert.eq(state.spinners, 1, "and carries a spinner while it waits");
        assert.includesText(String(state.label ?? ""), "Create field", "without losing its own name");

        await session.expectToast("was created");

        assert.eq(
          (await writeLog(driver)).length,
          1,
          "the one busy request is the one that saved the field"
        );
        assert.eq(await session.dialogOpen("New field"), false, "and the dialog closed on its own");

        const errors = await scriptErrors(driver);

        assert.eq(errors.length, 0, `nothing threw while the screen waited: ${JSON.stringify(errors)}`);
      },
    },
    {
      name: "pressing save twice while the first save runs stores one field",
      area: "Resilience — duplicate submission",
      screen: "/admin/fields",
      fn: async ({ session, driver, adminApi, assert, isolate }) => {
        const label = isolate.label("Double click");
        const key = isolate.key("double_click");

        await openNewField(session);
        await fillNewField(session, { label, key });

        await instrumentWrites(driver, { delayMs: 1500 });

        await session.clickButton("Create field");
        await session.driver.sleep(200);

        const outcome = await clickSubmitAgain(driver);

        await session.expectToast("was created");
        await session.driver.sleep(500);

        const writes = await writeLog(driver);

        assert.eq(
          writes.length,
          1,
          `exactly one request was sent after a second press (${outcome}; ${JSON.stringify(writes)})`
        );

        const searched = await adminApi.expectOk(
          adminApi.get(`/admin/fields?search=${encodeURIComponent(key)}`),
          "count what the two presses stored"
        );

        const rows = Array.isArray(searched) ? searched : [];

        assert.eq(rows.length, 1, `the field was stored once: ${JSON.stringify(rows.map((row) => row.key))}`);

        await session.reload();
        await session.fill("Search fields", label);

        assert.ok(await session.waitRow(label), "and the list shows that single row");

        const errors = await scriptErrors(driver);

        assert.eq(errors.length, 0, `nothing threw on the second press: ${JSON.stringify(errors)}`);
      },
    },
    {
      name: "a refusal from the server stays in the dialog and names the clash",
      area: "Resilience — server errors in the UI",
      screen: "/admin/fields",
      fn: async ({ session, adminApi, assert, isolate }) => {
        const key = isolate.key("clash");

        await adminApi.expectOk(
          adminApi.post("/admin/fields", {
            label: isolate.label("Clash owner"),
            key,
            dataType: "text",
          }),
          "reserve the key the dialog is about to ask for"
        );

        await openNewField(session);
        await fillNewField(session, { label: isolate.label("Clash attempt"), key });

        await session.clickButton("Create field");

        const alert = await waitDialogAlert(session);

        assert.includesText(alert, "already exists", `the dialog prints the server's reason: ${alert}`);
        assert.includesText(alert, key, "and names the key it clashed on");
        assert.ok(!/ER_[A-Z_]+|mysql|SQL/i.test(alert), `the message carries no internals: ${alert}`);

        assert.eq(await session.dialogOpen("New field"), true, "the dialog stays open so the entry is not lost");
        assert.eq(await session.controlValue("field-key"), key, "and the value typed into it is still there");

        /*
         * Recovering from the refusal is the other half of the test: the message
         * has to clear itself when the next attempt succeeds.
         */
        await session.fill("field-key", isolate.key("clash_fixed"));
        await session.clickButton("Create field");

        await session.expectToast("was created");
        assert.eq(await session.dialogOpen("New field"), false, "and the dialog closes once it is accepted");

        const cleared = await session.dialogHasError();

        assert.eq(cleared.length, 0, `the old refusal is gone: ${JSON.stringify(cleared)}`);
      },
    },
    {
      name: "a table with no rows yet explains itself and offers the next step",
      area: "Resilience — empty state",
      screen: "/records/:tableId",
      fn: async ({ session, assert, fixture }) => {
        await session.goto(`/records/${fixture.tableId}`);
        await session.waitForText("records yet");

        const cells = await session.anyText(By.css("table tbody"));

        assert.includesText(cells || "", "records yet", "the empty list says what is missing");
        assert.includesText(
          cells || "",
          "Records are created by submitting a form that is mapped to this table",
          "and says where they come from"
        );

        const errors = await session.visibleErrors();

        assert.eq(errors.length, 0, `an empty list is not reported as a failure: ${JSON.stringify(errors)}`);

        assert.eq(
          await session.isDisabled("New record"),
          false,
          "and the screen still offers the button that would fill it"
        );

        const thrown = await scriptErrors(session.driver);

        assert.eq(thrown.length, 0, `nothing threw on an empty result: ${JSON.stringify(thrown)}`);
      },
    },
    {
      name: "a search that matches nothing says so and can be undone",
      area: "Resilience — empty state",
      screen: "/admin/fields",
      fn: async ({ session, config, assert }) => {
        await session.goto("/admin/fields");
        await session.waitForRows();

        await session.fill("Search fields", "zzz no such field anywhere zzz");
        await session.waitForText("No fields match your search");

        const empty = await session.anyText(By.css("table tbody"));

        assert.includesText(empty || "", "No fields match your search", "the list reports the miss");
        assert.includesText(
          empty || "",
          "or clear the search",
          "and points at the way out"
        );

        const errors = await session.visibleErrors();

        assert.eq(errors.length, 0, `a missed search is reported as empty, not as a failure: ${JSON.stringify(errors)}`);

        await session.clickByAriaLabel("Clear search");

        /*
         * A real row is waited for rather than a row count: while a list is
         * fetching, the table already holds five skeleton rows that would satisfy
         * any count.
         */
        await session.driver.wait(
          until.elementLocated(By.css("table tbody tr td code")),
          config.timeouts.element,
          "clearing the search never brought the rows back"
        );

        assert.ok(
          !(await session.anyText(By.css("table tbody")) || "").includes("No fields match"),
          "and the miss message is gone with the search"
        );
      },
    },
    {
      name: "a screen whose table cannot be loaded reports it and retries",
      area: "Resilience — load errors",
      screen: "/records/:tableId",
      fn: async ({ session, assert }) => {
        await session.goto("/records/999999999");

        const messages = await waitErrorText(session, "not found");

        assert.ok(
          messages.some((entry) => /Table not found/i.test(entry)),
          `the screen shows the server's own answer: ${JSON.stringify(messages)}`
        );

        assert.eq(
          await session.isDisabled("Try again"),
          false,
          "and offers the retry it is asking for"
        );

        await session.clickButton("Try again");
        await session.driver.sleep(800);

        assert.ok(
          await session.exists(By.css("#app-navigation")),
          "retrying a failure keeps the application intact"
        );

        const stillFailing = await session.visibleErrors();

        assert.ok(
          stillFailing.some((entry) => /not found/i.test(entry)),
          `and the message is still there while the address is still wrong: ${JSON.stringify(stillFailing)}`
        );

        const errors = await scriptErrors(session.driver);

        assert.eq(errors.length, 0, `a missing table throws no exception: ${JSON.stringify(errors)}`);

        await session.goto("/admin/fields");
        await session.waitForRows();

        assert.ok(
          await session.exists(By.css("table tbody tr")),
          "and the next screen still loads after it"
        );
      },
    },
    {
      name: "an address with no screen behind it lands somewhere usable",
      area: "Resilience — routing",
      fn: async ({ session, driver, assert }) => {
        await session.goto("/this-screen-does-not-exist");
        await session.waitForApp();

        const main = await session.anyText(By.css("main"));
        const text = String(main || "").trim();

        assert.ok(text.length > 0, `the screen is not blank: ${JSON.stringify(text.slice(0, 120))}`);
        assert.ok(
          /does not exist|Dashboard/i.test(text),
          `it either explains the miss or returns to a real screen: ${JSON.stringify(text.slice(0, 160))}`
        );

        assert.eq(await session.settleAuth(), "in", "and the miss does not sign anyone out");

        const errors = await scriptErrors(driver);

        assert.eq(errors.length, 0, `nothing threw on the miss: ${JSON.stringify(errors)}`);

        await session.goto("/admin/fields");
        await session.waitForRows();

        assert.ok(
          await session.exists(By.css("table tbody tr")),
          "and navigation still works afterwards"
        );
      },
    },
    {
      name: "a list whose session ended mid-task reports it and returns to sign-in",
      area: "Resilience — expired session",
      screen: "/admin/fields",
      fn: async ({ session, driver, adminApi, config, isolate, assert }) => {
        const saved = await adminApi.expectOk(
          adminApi.post("/admin/fields", {
            label: isolate.label("Session probe"),
            key: isolate.key("session_probe"),
            dataType: "text",
          }),
          "store a field the list can be searched for"
        );

        const label = saved.label;

        await session.goto("/admin/fields");
        await session.waitForRows();

        /*
         * Dropping the session cookie reproduces an expiry from the browser's
         * point of view: the screen is open, the server no longer knows it.
         */
        await session.deleteCookie("leave.sid");

        await session.fill("Search fields", label);

        const messages = await waitErrorText(session, "Authentication");

        assert.ok(
          messages.some((entry) => /Authentication required/i.test(entry)),
          `the table reports the server's answer rather than going quiet: ${JSON.stringify(messages)}`
        );

        assert.eq(
          await session.isDisabled("Try again"),
          false,
          "and offers a retry, which cannot work until the user signs in again"
        );

        await session.reload();

        assert.eq(await session.settleAuth(), "out", "a reload of the same address resolves to signed out");
        await session.waitPath("/login", 20000);

        assert.ok(
          await session.exists(By.css("input#email")),
          "and the sign-in form is on the screen, not a blank page"
        );

        const heading = await session.anyText(By.css("h1"));

        assert.includesText(heading || "", "Leave Management System", "with its own heading intact");

        const errors = await scriptErrors(driver);

        assert.eq(errors.length, 0, `the expiry threw nothing: ${JSON.stringify(errors)}`);

        /*
         * The way back is the other half of the test: signing in has to return the
         * user to the screen they were working on.
         */
        await session.fill("email", config.admin.email);
        await session.fill("password", config.admin.password);
        await session.clickButton("Sign in");

        await session.waitPath("/admin/fields", 25000);
        await session.waitForRows();

        // The list is paged and alphabetically sorted, so the row is searched for.
        await session.fill("Search fields", label);

        assert.ok(
          await session.waitRow(label),
          "with the list it was looking at when the session ended"
        );
      },
    },
  ],
};
