import fs from "node:fs";
import path from "node:path";

import { config, isolate } from "./config.js";
import { createDriver } from "./lib/browser.js";
import { ApiClient } from "./lib/api.js";
import { RunRecorder } from "./lib/report.js";
import { AssertionError, Session, eq, includesText, ok } from "./lib/session.js";
import { suites } from "./suites/index.js";

async function readBudget() {
  const response = await fetch(`${config.apiBaseUrl}/health`).catch(() => null);

  if (!response) {
    return null;
  }

  const header = response.headers.get("ratelimit") || "";
  const remaining = Number((header.match(/r=(\d+)/) || [])[1]);
  const reset = Number((header.match(/t=(\d+)/) || [])[1]);

  return Number.isFinite(remaining) ? { remaining, reset } : null;
}

/**
 * The API grants 300 requests per 15 minutes per address and a full browser pass
 * spends them quickly. Waiting for the window is slower but honest; the alternative
 * is a run that fails on 429s that have nothing to do with the product.
 */
async function guardBudget(floor = 60) {
  let budget = await readBudget();

  if (!budget) {
    return;
  }

  let waited = 0;

  while (budget && budget.remaining < floor && waited < 16 * 60) {
    const pause = Math.min((budget.reset || 30) + 2, 60);

    console.log(
      `  ! rate-limit budget is ${budget.remaining} requests; waiting ${pause}s for the window to reset`
    );

    await new Promise((resolve) => setTimeout(resolve, pause * 1000));
    waited += pause;
    budget = await readBudget();
  }

  if (budget) {
    console.log(`  ✓ api budget: ${budget.remaining} requests left in the current window`);
  }
}

function banner() {
  console.log("");
  console.log(`Selenium E2E — run ${config.runId}`);
  console.log(`  app      ${config.webBaseUrl}`);
  console.log(`  api      ${config.apiBaseUrl}`);
  console.log(`  browser  chrome ${config.headless ? "(headless)" : "(visible window)"}`);
  console.log(`  isolation  data created by this run is tagged ${isolate.tag}`);
  console.log("");
}

async function precondition() {
  const health = await fetch(`${config.apiBaseUrl}/health`).catch((error) => {
    throw new Error(`API is not reachable at ${config.apiBaseUrl}: ${error.message}`);
  });

  if (health.status !== 200) {
    throw new Error(`API health returned ${health.status}; start the server first.`);
  }

  const web = await fetch(config.webBaseUrl).catch((error) => {
    throw new Error(`Web app is not reachable at ${config.webBaseUrl}: ${error.message}`);
  });

  if (web.status !== 200) {
    throw new Error(`Web app returned ${web.status}; start the Vite dev server first.`);
  }

  console.log("  ✓ API and web app both answered");
}

function selectSuites() {
  let chosen = suites;

  if (config.suiteFilter) {
    const needles = config.suiteFilter.split(",").map((entry) => entry.trim().toLowerCase());

    chosen = chosen.filter((suite) =>
      needles.some((needle) => suite.name.toLowerCase().includes(needle))
    );
  }

  if (config.testFilter) {
    const needle = config.testFilter.toLowerCase();

    chosen = chosen
      .map((suite) => ({
        ...suite,
        tests: suite.tests.filter((test) => test.name.toLowerCase().includes(needle)),
      }))
      .filter((suite) => suite.tests.length);
  }

  return chosen.filter((suite) => suite.tests.length);
}

async function main() {
  banner();
  await precondition();

  const recorder = new RunRecorder();
  const adminApi = new ApiClient();
  const adminUser = await adminApi.login(config.admin);

  if (config.protectedEmails.includes(adminUser.email.toLowerCase())) {
    throw new Error(
      `Refusing to run: the configured E2E admin (${adminUser.email}) is a protected account.`
    );
  }

  console.log(`  ✓ signed in as ${adminUser.email} (id ${adminUser.id})`);

  let limitedApi = null;

  if (config.limited.email && config.limited.password) {
    limitedApi = new ApiClient();

    try {
      limitedApi.user = await limitedApi.login(config.limited);
      console.log(`  ✓ limited account available (${config.limited.email})`);
    } catch (error) {
      console.log(`  ! limited account unusable: ${error.message.split("\n")[0]}`);
      limitedApi = null;
    }
  }

  const chosen = selectSuites();

  if (!chosen.length) {
    throw new Error("No suites matched the filter.");
  }

  console.log(`  ${chosen.length} suite(s), ${chosen.reduce((sum, suite) => sum + suite.tests.length, 0)} test(s) queued`);
  console.log("");

  const driver = await createDriver();
  const session = new Session(driver, recorder);

  const context = {
    config,
    isolate,
    driver,
    session,
    api: adminApi,
    adminApi,
    limitedApi,
    adminUser,
    assert: { ok, eq, includesText, AssertionError },
  };

  const started = Date.now();

  try {
    await session.start("/login");
    await session.login(config.admin);

    const me = await adminApi.me();

    ok(me.user?.id === adminUser.id, "Browser session and API session describe the same account");

    for (const suite of chosen) {
      await guardBudget();
      recorder.startSuite(suite.name, suite.area);

      if (suite.requires?.includes("limited") && !limitedApi) {
        for (const test of suite.tests) {
          recorder.startTest(test.name, { area: suite.area });
          recorder.skipTest("No limited-role account configured.");
          recorder.finishTest("skipped", { notes: "requires a limited account" });
        }

        continue;
      }

      let suiteContext = context;

      /*
       * A suite may build its own fixtures once through the API. A failure here
       * is reported against every test in the suite rather than aborting the run,
       * because the next suite still has something to say about the product.
       */
      if (suite.setup) {
        try {
          suiteContext = { ...context, ...(await suite.setup(context)) };
          console.log(`  · ${suite.name} fixtures ready`);
        } catch (error) {
          for (const test of suite.tests) {
            recorder.startTest(test.name, { area: suite.area, screen: test.screen || "" });
            recorder.failTest(error, driver);
            recorder.finishTest("failed");
            console.log(`  ✗ ${suite.name} › ${test.name} — fixture: ${String(error.message).split("\n")[0]}`);
          }

          continue;
        }
      }

      for (const test of suite.tests) {
        recorder.startTest(test.name, {
          area: test.area || suite.area,
          screen: test.screen || "",
        });

        try {
          await test.fn(suiteContext);
          await session.capture("final");
          recorder.finishTest("passed");
          console.log(`  ✓ ${suite.name} › ${test.name}`);
        } catch (error) {
          await session.capture("failure").catch(() => {});
          recorder.failTest(error, driver);
          recorder.finishTest("failed");
          console.log(
            `  ✗ ${suite.name} › ${test.name} — ${error.name === "AssertionError" ? "" : `${error.name}: `}${String(error.message).split("\n")[0]}`
          );

          if (!config.keepOpen && error.name !== "AssertionError" && /browser has closed|no such window|script timeout/i.test(error.message)) {
            throw error;
          }
        }
      }
    }
  } finally {
    if (!config.keepOpen) {
      await driver.quit().catch(() => {});
    }
  }

  const { stamp, summary } = recorder.write();
  const jsonPath = path.join(config.reportsDir, `run-${stamp}.json`);

  fs.writeFileSync(
    path.join(config.reportsDir, "LATEST.txt"),
    `${summary.total} tests in ${Math.round((Date.now() - started) / 1000)}s — ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped\n`
  );

  console.log("");
  console.log(
    `Result: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.skipped} skipped`
  );
  console.log(`Report: testing/reports/run-${stamp}.md`);
  console.log(`Evidence: testing/reports/artifacts/`);
  console.log("");

  if (summary.failed) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error("");
  console.error(`Suite could not run: ${error.message}`);
  console.error("");

  if (error.stack && !(error instanceof AssertionError)) {
    console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  }

  process.exitCode = 2;
}
