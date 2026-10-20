import { By, until, Key } from "selenium-webdriver";

import { config } from "../config.js";
import { drainConsole, drainProbe, installProbe } from "./browser.js";

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

export function ok(condition, message) {
  if (!condition) {
    throw new AssertionError(message);
  }
}

export function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new AssertionError(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

export function includesText(haystack, needle, label) {
  if (!String(haystack ?? "").includes(needle)) {
    throw new AssertionError(
      `${label}: expected text to contain ${JSON.stringify(needle)}, got ${JSON.stringify(String(haystack ?? "").slice(0, 400))}`
    );
  }
}

const escape = (value) => String(value).replace(/[\s]+/g, " ").trim();

export class Session {
  constructor(driver, recorder) {
    this.driver = driver;
    this.recorder = recorder;
  }

  // ---------------------------------------------------------------- lifecycle

  async start(url = "/") {
    await this.driver.get(`${config.webBaseUrl}${url}`);
    await installProbe(this.driver);
    await this.settle();
    await this.capture("load " + url);
  }

  async reload() {
    await this.driver.navigate().refresh();
    await installProbe(this.driver);
    await this.settle();
    await this.capture("reload");
  }

  async settle() {
    await this.driver.wait(
      until.elementLocated(By.css("#app-navigation, form, main")),
      config.timeouts.element
    );
  }

  /**
   * The shell only renders after AuthProvider resolves /auth/me, so a fresh page
   * load can show "Loading..." for a moment. Waits until the app has committed to
   * a signed-in or signed-out view, then reports which one.
   */
  async settleAuth() {
    const signedIn = By.css("#app-navigation");
    const signedOut = By.css("input#email");

    try {
      await this.driver.wait(
        async (driver) => {
          const nav = await driver.findElements(signedIn);

          if (nav.length) {
            return "in";
          }

          const login = await driver.findElements(signedOut);

          return login.length ? "out" : undefined;
        },
        config.timeouts.element,
        "The app never resolved the sign-in state"
      );
    } catch {
      return "unknown";
    }

    await this.driver.sleep(150);

    return (await this.driver.findElements(signedIn)).length ? "in" : "out";
  }

  async step(label, data = {}) {
    await this.capture(label);
    this.recorder.step(label, { url: await this.pathname().catch(() => null), ...data });
    if (config.slowMo) {
      await this.driver.sleep(config.slowMo);
    }
  }

  /** Drains the in-page network probe plus the browser console into the recorder. */
  async capture(label) {
    const probe = await drainProbe(this.driver);

    if (probe) {
      this.recorder.observe("network", probe.network);
      this.recorder.observe("pageErrors", probe.errors);
    }

    this.recorder.observe("console", await drainConsole(this.driver));
  }

  // ------------------------------------------------------------- navigation

  async goto(path, label = null) {
    await this.driver.navigate().to(`${config.webBaseUrl}${path}`);
    await installProbe(this.driver);
    await this.settle();
    await this.settleAuth();
    await this.step(label || `open ${path}`);
  }

  async clickNav(label) {
    const link = await this.driver.wait(
      until.elementLocated(
        By.xpath(`//nav[@aria-label="Main"]//a[normalize-space()="${label}"]`)
      ),
      config.timeouts.element
    );

    await link.click();
    await this.step(`navigate to ${label}`);
  }

  async pathname() {
    return this.driver.executeScript("return location.pathname;");
  }

  async waitPath(expected, timeout = null) {
    await this.driver.wait(
      async (driver) => (await driver.executeScript("return location.pathname;")) === expected,
      timeout || config.timeouts.element,
      `Expected to land on ${expected}`
    );

    await this.step(`route ${expected}`);
  }

  async heading() {
    const el = await this.driver.findElement(By.css("h1"));

    return escape(await el.getText());
  }

  /**
   * A route swap paints the new heading a moment after the URL changes, so a
   * heading read straight after a navigation can still see the previous screen.
   * Waits for the expected heading, then returns whatever is on screen.
   */
  async waitHeading(expected, timeout = null) {
    const limit = Date.now() + (timeout || config.timeouts.element);

    while (Date.now() < limit) {
      const current = await this.heading().catch(() => null);

      if (current === expected) {
        return current;
      }

      await this.driver.sleep(150);
    }

    return this.heading().catch(() => null);
  }

  /**
   * Native constraint validation runs before React sees the submit, so a value
   * the browser itself rejects never reaches the API. Reports which layer stopped
   * it instead of guessing.
   */
  async formSubmissionBlocked() {
    return this.driver.executeScript(`
      // A dialog carries the form under test; the page behind it may carry one too.
      const form =
        document.querySelector('div[role="dialog"] form') || document.querySelector("form");

      if (!form) return { form: false, reason: "no form on the screen" };

      const invalid = [...form.elements].filter(
        (element) => element.willValidate && !element.checkValidity()
      );

      return {
        form: true,
        reason: invalid.length
          ? invalid.map((element) => element.id + ": " + element.validationMessage).join(" | ")
          : "the browser would submit",
        reported: form.reportValidity === undefined ? null : !form.checkValidity(),
      };
    `);
  }

  /** Every error message the screen currently shows, field-level and page-level. */
  async visibleErrors() {
    const paragraphs = await this.driver.findElements(
      By.xpath(
        '//p[contains(@class,"text-red")] | //p[contains(@class,"text-danger")] | //div[contains(@class,"border-red")] | //p[contains(@id,"-error")] | //p[@role="alert"] | //div[@role="alert"]'
      )
    );

    const messages = [];

    for (const paragraph of paragraphs) {
      const text = escape(await paragraph.getText().catch(() => ""));

      if (text) {
        messages.push(text);
      }
    }

    return messages;
  }

  async documentTitle() {
    return this.driver.getTitle();
  }

  // ---------------------------------------------------------------- locating

  text(locator) {
    return this.driver
      .findElement(locator)
      .then(async (el) => escape(await el.getText()))
      .catch(() => null);
  }

  async anyText(locator) {
    const found = await this.driver.findElements(locator);

    if (!found.length) {
      return null;
    }

    return escape(await found[0].getText());
  }

  exists(locator, timeout = 0) {
    if (!timeout) {
      return this.driver.findElements(locator).then((found) => found.length > 0);
    }

    return this.driver
      .wait(until.elementLocated(locator), timeout)
      .then(() => true)
      .catch(() => false);
  }

  async waitForText(needle, timeout = null) {
    const limit = timeout || config.timeouts.toast;
    const body = await this.driver.wait(
      until.elementLocated(By.css("body")),
      config.timeouts.element
    );

    return this.driver.wait(
      async () => {
        const text = await body.getText();

        return text.includes(needle) ? true : undefined;
      },
      limit,
      `Never saw "${needle}" on the page`
    );
  }

  /*
   * The screen area, not the whole page. A permission context that is still
   * resolving paints "Checking access…" in `main` while the sidebar already
   * carries every nav label, so a body-wide text wait can settle on content that
   * has nothing to do with the screen under test.
   */
  async waitForMainText(needle, timeout = null) {
    const limit = timeout || config.timeouts.toast;

    return this.driver.wait(
      async () => {
        const texts = await this.textsOf(By.css("main"));

        return texts.some((entry) => entry.includes(needle)) ? true : undefined;
      },
      limit,
      `Never saw "${needle}" in the screen area`
    );
  }

  button(text, { root = null, partial = false } = {}) {
    const base = root ? ".//button" : "//button";
    const matcher = partial
      ? `contains(normalize-space(.),"${text}")`
      : `normalize-space(.)="${text}"`;

    return By.xpath(`${base}[${matcher} or (${matcher} and @type="submit")]`);
  }

  /** The visible button element whose accessible label matches (used for submit buttons in dialogs). */
  async findButton(text, options = {}) {
    const locator = this.button(text, options);
    const buttons = await this.driver.findElements(locator);
    const usable = [];

    for (const button of buttons) {
      if (await button.isDisplayed()) {
        usable.push(button);
      }
    }

    if (!usable.length) {
      throw new AssertionError(`No visible button labelled "${text}"`);
    }

    return usable.at(-1);
  }

  async clickByAriaLabel(fragment, options = {}) {
    const button = await this.driver.wait(
      until.elementLocated(
        By.xpath(`(//button[contains(@aria-label,"${fragment}")])[last()]`)
      ),
      options.timeout || config.timeouts.element
    );

    await this.driver.actions({ async: true }).move({ origin: button }).perform();
    await button.click();
    await this.step(options.step || `click [aria-label~="${fragment}"]`);

    return button;
  }

  async clickButton(text, options = {}) {
    if (text === "Sign in") {
      await this.driver
        .executeScript(`
          if (window.__setTurnstileTokenForTesting) {
            window.__setTurnstileTokenForTesting("cf-turnstile-test-token");
          }
        `)
        .catch(() => {});
    }

    const limit = Date.now() + (options.timeout || config.timeouts.element);
    let lastError = null;

    while (Date.now() < limit) {
      try {
        const button = await this.findButton(text, options);

        if (!(await button.isEnabled())) {
          await this.driver.sleep(150);
          continue;
        }

        await this.driver.actions({ async: true }).move({ origin: button }).perform();
        await button.click();
        await this.step(options.step || `click ${text}`);

        return button;
      } catch (error) {
        // React re-renders the footer of a submitting dialog, which invalidates
        // the reference between the lookup and the click. Looking again is safe.
        lastError = error;
        await this.driver.sleep(150);
      }
    }

    throw new AssertionError(
      `Button "${text}" never became clickable (${String(lastError?.message).split("\n")[0]})`
    );
  }

  async isDisabled(text, options = {}) {
    try {
      const button = await this.findButton(text, options);

      return await button.getAttribute("disabled") !== null
        ? true
        : !(await button.isEnabled());
    } catch {
      return null;
    }
  }

  /**
   * Resolves the control a visible label belongs to through its `for`
   * attribute. Checkbox and Toggle render the input before the label, so a
   * following-sibling search walks past them into an unrelated control; `for`
   * names the right one whatever React generated for the id.
   */
  async controlByLabelFor(idOrLabel, { prefix = false } = {}) {
    const matcher = prefix
      ? `starts-with(normalize-space(), "${idOrLabel} ")`
      : `normalize-space()="${idOrLabel}"`;

    const labels = await this.driver.findElements(By.xpath(`//label[@for][${matcher}]`));

    for (const label of labels) {
      const target = await label.getAttribute("for");

      if (!target) {
        continue;
      }

      const found = await this.driver.findElements(By.xpath(`//*[@id="${target}"]`));

      if (found.length) {
        return found[0];
      }
    }

    return null;
  }

  /** Native control by id, with a label lookup fallback for useId-generated ids. */
  async control(idOrLabel, { timeout = null } = {}) {
    const limit = Date.now() + (timeout || config.timeouts.element);
    const isPlainId = /^[a-z][a-z0-9_-]*$/i.test(idOrLabel) && !idOrLabel.includes(" ");

    while (Date.now() < limit) {
      if (isPlainId) {
        const byId = await this.driver.findElements(By.css(`#${idOrLabel}`));

        if (byId.length) {
          return byId[0];
        }
      }

      const byFor = await this.controlByLabelFor(idOrLabel);

      if (byFor) {
        return byFor;
      }

      const byLabel = await this.driver.findElements(
        By.xpath(
          `//label[normalize-space()="${idOrLabel}"]/following::input[1] | //label[normalize-space()="${idOrLabel}"]/following::select[1] | //label[normalize-space()="${idOrLabel}"]/following::textarea[1]`
        )
      );

      if (byLabel.length) {
        return byLabel[0];
      }

      /*
       * Required fields append a marker inside the label element, so the visible
       * text is the label plus " * (required)". Prefix matching keeps a test
       * able to name the field the way a human reads it.
       */
      const byForPrefix = await this.controlByLabelFor(idOrLabel, { prefix: true });

      if (byForPrefix) {
        return byForPrefix;
      }

      const byPrefix = await this.driver.findElements(
        By.xpath(
          `//label[starts-with(normalize-space(), "${idOrLabel}")]/following::input[1] | //label[starts-with(normalize-space(), "${idOrLabel}")]/following::select[1] | //label[starts-with(normalize-space(), "${idOrLabel}")]/following::textarea[1]`
        )
      );

      if (byPrefix.length) {
        return byPrefix[0];
      }

      await this.driver.sleep(150);
    }

    throw new AssertionError(`No form control found for "${idOrLabel}"`);
  }

  async fill(idOrLabel, value) {
    const first = await this.control(idOrLabel);
    const type = await first.getAttribute("type");

    // Chrome's segmented date widget never accepts an ISO string as keystrokes.
    if (type === "date" || type === "datetime-local") {
      await this.setDate(idOrLabel, value);

      return this.control(idOrLabel);
    }

    await first.clear().catch(() => {});

    // Clearing a controlled input re-renders it, so the value is typed into a
    // freshly located element.
    const input = await this.control(idOrLabel);

    await input.sendKeys(String(value ?? ""));
    await this.step(`type ${idOrLabel}`);

    return input;
  }

  /** Sets a native date input the way React reads it: the property setter plus an input event. */
  async setDate(idOrLabel, value) {
    const control = await this.control(idOrLabel);

    await this.driver.executeScript(
      `
        const [element, raw] = arguments;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

        setter.call(element, raw);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      `,
      control,
      String(value ?? "")
    );

    await this.step(`set date ${idOrLabel}`);

    return this.control(idOrLabel);
  }

  /**
   * A filter row that refetches on every keystroke turns a typed phrase into one
   * request per character, so a value that only ever filters is set the way a paste
   * does it: one input event, whatever the string.
   */
  async setReactValue(idOrLabel, value) {
    const control = await this.control(idOrLabel);
    const tag = await control.getTagName();

    const script =
      tag === "textarea"
        ? `
            const [element, raw] = arguments;
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(element, raw);
          `
        : `
            const [element, raw] = arguments;

            if (element.tagName === "SELECT") {
              element.value = raw;
            } else {
              Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, raw);
            }
          `;

    await this.driver.executeScript(
      `${script}
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      `,
      control,
      String(value ?? "")
    );

    await this.step(`set ${idOrLabel}`);

    return this.control(idOrLabel);
  }

  async selectOption(idOrLabel, optionText) {
    const control = await this.control(idOrLabel);

    await this.driver.wait(
      async () => {
        const disabled = await control.getAttribute("disabled");

        return disabled === null ? true : undefined;
      },
      config.timeouts.element,
      `Select "${idOrLabel}" stayed disabled (options never loaded)`
    );

    const options = await control.findElements(By.css("option"));

    for (const option of options) {
      const label = escape(await option.getText());

      if (label === optionText || label.startsWith(optionText)) {
        await option.click();
        await this.step(`choose ${optionText} in ${idOrLabel}`);

        return label;
      }
    }

    const available = (await Promise.all(options.map((o) => o.getText()))).map(escape);

    throw new AssertionError(
      `Option "${optionText}" is not in "${idOrLabel}". Available: ${available.join(" | ")}`
    );
  }

  async optionLabels(idOrLabel) {
    const control = await this.control(idOrLabel);
    const options = await control.findElements(By.css("option"));
    const labels = await Promise.all(options.map((option) => option.getText()));

    return labels.map(escape);
  }

  async setCheckbox(idOrLabel, want = true) {
    const control = await this.control(idOrLabel);
    const is = await control.isSelected();

    if (is !== want) {
      await control.click();
    }

    await this.step(`${want ? "check" : "uncheck"} ${idOrLabel}`);
  }

  async controlValue(idOrLabel) {
    const control = await this.control(idOrLabel);

    return control.getAttribute("value");
  }

  async isControlDisabled(idOrLabel) {
    const control = await this.control(idOrLabel);

    return (await control.getAttribute("disabled")) !== null;
  }

  /**
   * A checkbox with no value attribute reports "on" through the DOM `value`
   * property, which says nothing about its state, so ticks are read separately.
   */
  async isChecked(idOrLabel) {
    const control = await this.control(idOrLabel);

    return control.isSelected();
  }

  async fieldError(idOrLabel, { timeout = 5000 } = {}) {
    const limit = Date.now() + timeout;

    while (Date.now() < limit) {
      const text = await this.readFieldErrorOnce(idOrLabel);

      if (text) {
        return text;
      }

      await this.driver.sleep(200);
    }

    return this.readFieldErrorOnce(idOrLabel);
  }

  /**
   * FormField renders the control's hint as a sibling <p> too, and swaps it for
   * the error only once the server answers. Reading the first sibling therefore
   * reports the hint as though it were the refusal whenever the round-trip is
   * slower than the read, so only error-shaped text is accepted here.
   */
  async readFieldErrorOnce(idOrLabel) {
    const control = await this.control(idOrLabel, { timeout: 4000 }).catch(() => null);

    if (control) {
      const id = await control.getAttribute("id");

      if (id) {
        /*
         * Dynamic fields build their id from React's useId, which contains
         * characters a CSS identifier cannot carry, so the error paragraph is
         * matched by attribute instead of by selector.
         */
        const formal = await this.driver.findElements(
          By.xpath(`//p[@id="${id}-error"] | //*[@id="${id}-error"]`)
        );

        if (formal.length) {
          const text = escape(await formal[0].getText());

          if (text) {
            return text;
          }
        }
      }

      // Screens like the login form render the message as the sibling <p>.
      const sibling = await control.findElements(
        By.xpath(
          'following-sibling::p[1][@role="alert" or contains(@class,"danger") or contains(@class,"red-")]'
        )
      );

      if (sibling.length) {
        const text = escape(await sibling[0].getText());

        if (text) {
          return text;
        }
      }
    }

    const byLabel = await this.driver.findElements(
      By.xpath(
        `//label[normalize-space()="${idOrLabel}"]/following::*[@role="alert" or contains(@id,"-error") or contains(@class,"danger") or contains(@class,"red-")][1]`
      )
    );

    return byLabel.length ? escape(await byLabel[0].getText()) : null;
  }

  /** Clicks the dialog's own submit button, whatever it is called. */
  async submitDialog() {
    const limit = Date.now() + config.timeouts.element;

    while (Date.now() < limit) {
      const buttons = await this.driver.findElements(
        By.xpath('//div[@role="dialog"]//button[@type="submit"]')
      );

      for (const button of buttons) {
        if ((await button.isDisplayed()) && (await button.isEnabled())) {
          const label = escape(await button.getText());

          await button.click();
          await this.step(`submit dialog: ${label}`);

          return label;
        }
      }

      await this.driver.sleep(150);
    }

    throw new AssertionError("The open dialog never offered an enabled submit button");
  }

  async dialogHasError() {
    const paragraphs = await this.driver.findElements(
      By.xpath('//div[@role="dialog"]//p[@role="alert"] | //div[@role="dialog"]//p[contains(@id,"-error")]')
    );

    const messages = [];

    for (const paragraph of paragraphs) {
      const text = escape(await paragraph.getText());

      if (text) {
        messages.push(text);
      }
    }

    return messages;
  }

  /**
   * A refused save paints its message only after the round-trip, so reading the
   * dialog straight after the click races the server. This waits for the message
   * and returns whatever the dialog says, empty when nothing ever arrived.
   */
  async waitDialogError(timeout = 8000) {
    const limit = Date.now() + timeout;

    while (Date.now() < limit) {
      const messages = await this.dialogHasError();

      if (messages.length) {
        return messages;
      }

      await this.driver.sleep(200);
    }

    return this.dialogHasError();
  }

  // ------------------------------------------------------------------ dialogs

  async openDialog(title) {
    await this.driver.wait(
      until.elementLocated(
        By.xpath(`//div[@role="dialog"]//h2[normalize-space()="${title}"]`)
      ),
      config.timeouts.element,
      `Dialog "${title}" did not open`
    );

    await this.step(`dialog ${title}`);

    return By.xpath(`//div[@role="dialog"][.//h2[normalize-space()="${title}"]]`);
  }

  async dialog(title) {
    return this.driver.wait(
      until.elementLocated(
        By.xpath(`//div[@role="dialog"]//h2[normalize-space()="${title}"]/ancestor::div[@role="dialog"]`)
      ),
      config.timeouts.element
    );
  }

  async closeDialog(title) {
    const dialog = await this.driver.findElements(
      By.xpath(`//div[@role="dialog"]//h2[normalize-space()="${title}"]/ancestor::div[@role="dialog"]`)
    );

    if (!dialog.length) {
      return;
    }

    const closer = await dialog[0].findElements(By.css('[aria-label="Close dialog"]'));

    if (closer.length) {
      await closer[0].click();
    } else {
      await this.driver.actions({ async: true }).keyDown(Key.ESCAPE).keyUp(Key.ESCAPE).perform();
    }

    await this.step(`close dialog ${title}`);
  }

  async dialogOpen(title) {
    const found = await this.driver.findElements(
      By.xpath(`//div[@role="dialog"]//h2[normalize-space()="${title}"]`)
    );

    return found.length > 0;
  }

  /** The h2 of whichever dialog is currently mounted — titles are sometimes derived from the row. */
  async dialogTitle() {
    await this.driver.wait(
      until.elementLocated(By.xpath('//div[@role="dialog"]//h2')),
      config.timeouts.element,
      "No dialog is open"
    );

    const heading = await this.driver.findElement(By.xpath('//div[@role="dialog"]//h2'));

    return escape(await heading.getText());
  }

  async anyDialogTitle(fragment) {
    const title = (await this.dialogTitle()).toLowerCase();

    includesText(title, fragment.toLowerCase(), "dialog title");

    return title;
  }

  // ------------------------------------------------------------------- toasts

  /*
   * Texts of every element matching the locator, read one element at a time.
   * A toast unmounts itself while a wait predicate is still holding the element,
   * and a stale reference there is not a test failure — it is the message leaving.
   */
  async textsOf(locator) {
    const found = await this.driver.findElements(locator);
    const texts = [];

    for (const entry of found) {
      try {
        texts.push(await entry.getText());
      } catch {
        // Removed between locating and reading.
      }
    }

    return texts;
  }

  async expectToast(needle, timeout = null) {
    const limit = timeout || config.timeouts.toast;
    const region = By.css('[role="status"]');

    await this.driver.wait(
      async (driver) => {
        const regions = await driver.findElements(region);

        for (const entry of regions) {
          try {
            const text = await entry.getText();

            if (text.includes(needle)) {
              return text;
            }
          } catch {
            // The toast dismissed itself mid-read.
          }
        }

        return undefined;
      },
      limit,
      `No toast containing "${needle}" appeared`
    );

    const toast = await this.anyText(region);

    await this.step(`toast: ${needle}`);

    return toast;
  }

  async expectNoErrorToast(timeout = 1500) {
    await this.driver.sleep(timeout);

    const toasts = await this.driver.findElements(By.css('[role="status"] p'));

    for (const toast of toasts) {
      const text = escape(await toast.getText());

      if (/could not|failed|invalid|error/i.test(text)) {
        throw new AssertionError(`Unexpected error toast: "${text}"`);
      }
    }
  }

  // -------------------------------------------------------------------- table

  async waitForRows(timeout = null) {
    const limit = timeout || config.timeouts.element;

    await this.waitForApp();

    await this.driver.wait(
      async (driver) => {
        const error = await driver.findElements(By.xpath('//p[normalize-space()="This table could not be loaded."]'));

        if (error.length) {
          throw new AssertionError("The data table reported a load error.");
        }

        const rows = await driver.findElements(By.css("table tbody tr"));

        return rows.length > 0 ? rows : undefined;
      },
      limit,
      "The data table never rendered rows"
    );

    await this.step("table rows ready");
  }

  /**
   * Every fetch repaints the table, which invalidates row handles partway through
   * an iteration and turns a healthy screen into a StaleElementReferenceError.
   * The rows are therefore read in one synchronous page script: cells per row,
   * already whitespace-normalised, so no handle outlives the render it came from.
   */
  async rowTexts() {
    return this.driver.executeScript(
      `return Array.from(document.querySelectorAll("table tbody tr")).map((row) => {
         const cells = Array.from(row.querySelectorAll("td"));
         const sources = cells.length ? cells : [row];

         return sources.map((node) => (node.innerText || "").replace(/\\s+/g, " ").trim());
       });`
    );
  }

  async rowCells(matchText, { column = null } = {}) {
    const rows = await this.rowTexts();

    for (const cells of rows) {
      if (escape(cells.join(" ")).includes(matchText)) {
        if (column === null) {
          return cells;
        }

        const index = await this.columnHeaderIndex(column);

        return index === null ? null : (cells[index] ?? null);
      }
    }

    return null;
  }

  async columnHeaderIndex(label) {
    const headers = await this.driver.executeScript(
      `return Array.from(document.querySelectorAll("table thead th"))
         .map((th) => (th.innerText || "").replace(/\\s+/g, " ").trim());`
    );

    /*
     * Headers are uppercased by CSS and the rendered form is what is read, so
     * the comparison has to ignore case. A header also carries its sort
     * indicator, hence the prefix match.
     */
    const wanted = escape(label).toLowerCase();

    for (const [index, header] of headers.entries()) {
      const text = header.toLowerCase();

      if (text === wanted || text.startsWith(wanted)) {
        return index;
      }
    }

    return null;
  }

  async rowExists(matchText) {
    const rows = await this.rowTexts();

    return rows.some((cells) => escape(cells.join(" ")).includes(matchText));
  }

  /**
   * Lists are paginated, so a row that is not on screen is not a row that does
   * not exist. Tests that compare a filtered list with the unfiltered one count
   * rows instead of looking for a particular label.
   */
  async countRows() {
    return (await this.rowTexts()).length;
  }

  /**
   * A save closes its dialog before the list has re-fetched, so a row asserted
   * immediately can be legitimately missing. This polls and reports the rows that
   * were actually on screen when the wait ran out.
   */
  async waitRow(matchText, timeout = null) {
    const limit = Date.now() + (timeout || config.timeouts.element);

    await this.waitForApp();

    while (Date.now() < limit) {
      if (await this.rowExists(matchText)) {
        return true;
      }

      await this.driver.sleep(250);
    }

    const seen = (await this.rowTexts())
      .slice(0, 8)
      .map((cells) => escape(cells.join(" ")));

    throw new AssertionError(
      `No table row carries "${matchText}". Visible rows: ${JSON.stringify(seen)}`
    );
  }

  /** The same wait for the <li> lists the builder detail screens use. */
  async waitItem(matchText, timeout = null) {
    const limit = Date.now() + (timeout || config.timeouts.element);

    await this.waitForApp();

    while (Date.now() < limit) {
      if (await this.itemExists(matchText)) {
        return true;
      }

      await this.driver.sleep(250);
    }

    const items = await this.orderedItems();

    throw new AssertionError(
      `No list item carries "${matchText}". Visible items: ${JSON.stringify(items.slice(0, 8))}`
    );
  }

  /** True when a list item or a table row carries the given text — builders mix both. */
  async itemExists(matchText) {
    const items = await this.driver.findElements(
      By.xpath(`//li[contains(normalize-space(), "${matchText}")]`)
    );

    if (items.length) {
      return true;
    }

    return this.rowExists(matchText);
  }

  /**
   * Builders mark their ordered lists up as `<ol>` and their plain lists as
   * `<ul>`, so both are accepted here.
   */
  async orderedItems(containerXpath = "//ol | //ul") {
    const items = await this.driver.findElements(
      By.xpath(`${containerXpath}//li[normalize-space()]`)
    );

    return Promise.all(items.map(async (item) => escape(await item.getText())));
  }

  /**
   * The permission gate renders "Checking access…" while /authorization/permissions
   * is in flight, and the shell keeps a skeleton sidebar until the account is
   * known. Waiting for both to clear turns a bare element timeout into a failure
   * that names the part of the app that was still loading.
   */
  async waitForApp(timeout = null) {
    const limit = Date.now() + (timeout || config.timeouts.element);

    while (Date.now() < limit) {
      const busy = await this.driver.executeScript(`
        const body = document.body ? document.body.innerText : "";

        return /Checking access|Loading .{0,30}…/.test(body);
      `);

      if (!busy) {
        return true;
      }

      await this.driver.sleep(200);
    }

    const text = await this.driver.executeScript(
      "return document.body ? document.body.innerText.slice(0, 200) : '';"
    );

    throw new AssertionError(
      `The application never finished loading: still showing ${JSON.stringify(text)}`
    );
  }

  /**
   * A list repaints whenever a fetch lands, which can happen between finding a
   * row's control and clicking it, so the lookup is retried on a stale reference
   * rather than failing the test on a repaint. Giving up reports the rows that
   * were actually on screen, because the usual cause is a row that is not there.
   */
  async clickInRow(matchText, buttonText, timeout = null) {
    const limit = Date.now() + (timeout || config.timeouts.element);

    while (Date.now() < limit) {
      try {
        const rows = await this.driver.findElements(By.css("table tbody tr"));

        for (const row of rows) {
          if (!escape(await row.getText()).includes(matchText)) {
            continue;
          }

          const buttons = await row.findElements(By.xpath(".//button | .//a"));

          for (const button of buttons) {
            if (escape(await button.getText()) === buttonText) {
              await this.driver.actions({ async: true }).move({ origin: button }).perform();
              await button.click();
              await this.step(`${buttonText} on row ${matchText}`);

              return true;
            }
          }
        }
      } catch (error) {
        if (!/stale element reference|not attached/i.test(String(error?.message))) {
          throw error;
        }
      }

      await this.driver.sleep(250);
    }

    const seen = (await this.rowTexts())
      .slice(0, 8)
      .map((cells) => escape(cells.join(" ")));

    throw new AssertionError(
      `No "${buttonText}" control found in the row containing "${matchText}". Visible rows: ${JSON.stringify(seen)}`
    );
  }

  /** Same as clickInRow but for the <li> lists the builder detail screens use. */
  async clickInItem(matchText, buttonText) {
    await this.waitForApp();

    const button = await this.driver.wait(
      until.elementLocated(
        By.xpath(
          `//li[contains(normalize-space(), "${matchText}")]//button[normalize-space()="${buttonText}"]`
        )
      ),
      config.timeouts.element,
      `No "${buttonText}" control in the list item "${matchText}"`
    );

    await this.driver.actions({ async: true }).move({ origin: button }).perform();
    await button.click();
    await this.step(`${buttonText} on item ${matchText}`);

    return button;
  }

  async clickHeaderSort(label) {
    const header = await this.driver.wait(
      until.elementLocated(
        By.xpath(`//table//th[normalize-space(.)="${label}" or starts-with(normalize-space(.),"${label}")]//button`)
      ),
      config.timeouts.element
    );

    await header.click();
    await this.step(`sort by ${label}`);
  }

  async ariaSort(label) {
    const header = await this.driver.findElement(
      By.xpath(`//table//th[normalize-space(.)="${label}" or starts-with(normalize-space(.),"${label}")]`)
    );

    return header.getAttribute("aria-sort");
  }

  async paginationSummary() {
    return this.anyText(
      By.xpath('//nav[@aria-label="Pagination"]//p | //nav[@aria-label="Pagination"]')
    );
  }

  // ------------------------------------------------------------------- auth

  async login(account) {
    await this.goto("/login");

    if ((await this.settleAuth()) === "in") {
      const shown = (await this.sidebarUserText()).toLowerCase();

      if (shown.includes(account.email.toLowerCase())) {
        await this.step("already signed in");

        return;
      }

      // A different account owns this browser session; sign it out first.
      await this.logout();
    }

    await this.fill("email", account.email);
    await this.fill("password", account.password);

    // If Turnstile is rendered on the login page, provide test token so automated test can sign in
    await this.driver.executeScript(`
      if (window.__setTurnstileTokenForTesting) {
        window.__setTurnstileTokenForTesting("cf-turnstile-test-token");
      }
    `).catch(() => {});

    await this.clickButton("Sign in", { step: "submit login" });

    await this.waitSignedIn(25000);
    await this.settleAuth();
    await this.step("signed in");
  }

  /**
   * A sign-in reached from a protected address returns the person to that
   * address, so the landing path is whatever screen was asked for. What proves
   * the sign-in worked is that /login is behind us and the shell is standing.
   */
  async waitSignedIn(timeout = null) {
    await this.driver.wait(
      async (driver) => {
        if ((await driver.executeScript("return location.pathname;")) === "/login") {
          return undefined;
        }

        const nav = await driver.findElements(By.css("#app-navigation"));

        return nav.length ? true : undefined;
      },
      timeout || config.timeouts.element,
      "Signing in never left the login screen"
    );
  }

  async logout() {
    await this.clickButton("Sign out");
    await this.waitPath("/login");
    await this.settleAuth();
    await this.step("signed out");
  }

  /** Signs out when a previous test left the browser authenticated. */
  async ensureSignedOut() {
    await this.goto("/login");

    if ((await this.settleAuth()) === "in") {
      await this.logout();
    }

    await this.goto("/login");
    await this.settleAuth();
  }

  async isLoggedIn() {
    await this.settleAuth();

    return (await this.driver.findElements(By.css("#app-navigation"))).length > 0;
  }

  async sidebarUserText() {
    const aside = await this.driver.findElement(By.css("#app-navigation"));

    return escape(await aside.getText());
  }

  async cookie(name) {
    const found = await this.driver.manage().getCookie(name);

    return found ? found.value : null;
  }

  async deleteCookie(name) {
    await this.driver.manage().deleteCookie(name);
    await this.step(`delete cookie ${name}`);
  }
}
