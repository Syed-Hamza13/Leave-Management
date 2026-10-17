import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function clip(value, max = 4000) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);

  if (!text) {
    return "";
  }

  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export class RunRecorder {
  constructor() {
    this.startedAt = new Date();
    this.suites = [];
    this.current = null;
    this.environment = {
      webBaseUrl: config.webBaseUrl,
      apiBaseUrl: config.apiBaseUrl,
      headless: config.headless,
      runId: config.runId,
    };
  }

  startSuite(name, area) {
    const suite = { name, area, tests: [] };

    this.suites.push(suite);
    this.activeSuite = suite;

    return suite;
  }

  startTest(name, details = {}) {
    this.current = {
      suite: this.activeSuite.name,
      area: details.area || this.activeSuite.area,
      screen: details.screen || "",
      name,
      status: "running",
      steps: [],
      observations: { network: [], console: [], pageErrors: [] },
      startedAt: new Date().toISOString(),
      failure: null,
      artifacts: {},
    };

    this.activeSuite.tests.push(this.current);

    return this.current;
  }

  setScreen(screen) {
    if (this.current) {
      this.current.screen = screen;
    }
  }

  step(label, data = {}) {
    if (!this.current) {
      return;
    }

    this.current.steps.push({
      label,
      at: new Date().toISOString(),
      url: data.url || null,
      note: data.note || null,
    });
  }

  observe(kind, entries) {
    if (!this.current || !entries?.length) {
      return;
    }

    const stepLabel = this.current.steps.at(-1)?.label || "(before first step)";

    for (const entry of entries) {
      this.current.observations[kind].push({ step: stepLabel, ...entry });
    }
  }

  async screenshot(driver, name) {
    try {
      const base64 = await driver.takeScreenshot();
      const file = `${this.current.suite}-${name}-${nowStamp()}.png`;
      const full = path.join(config.artifactsDir, file);

      fs.writeFileSync(full, base64, "base64");
      this.current.artifacts[name] = path
        .relative(config.reportsDir, full)
        .replace(/\\/g, "/");
    } catch {
      // A dead browser cannot screenshot; the failure text is still recorded.
    }
  }

  finishTest(status, extra = {}) {
    if (!this.current) {
      return;
    }

    this.current.status = status;
    this.current.finishedAt = new Date().toISOString();
    this.current.durationMs =
      new Date(this.current.finishedAt) - new Date(this.current.startedAt);

    if (extra.notes) {
      this.current.notes = extra.notes;
    }
  }

  failTest(error, driver) {
    const test = this.current;

    test.status = "failed";
    test.failure = {
      message: clip(error.message || String(error), 1500),
      name: error.name || "Error",
      stack: clip(error.stack || "", 3000),
      step: test.steps.at(-1)?.label || "(no step recorded)",
      screen: test.screen,
      area: test.area,
      isSeleniumError: Boolean(error.name && /Stale|NoSuch|Timeout|InvalidSelector|ElementClick/.test(error.name)),
    };

    if (driver) {
      return this.screenshot(driver, "failure");
    }
  }

  skipTest(reason) {
    this.current.status = "skipped";
    this.current.notes = reason;
  }

  summary() {
    const tests = this.suites.flatMap((suite) => suite.tests);

    return {
      total: tests.length,
      passed: tests.filter((test) => test.status === "passed").length,
      failed: tests.filter((test) => test.status === "failed").length,
      skipped: tests.filter((test) => test.status === "skipped").length,
    };
  }

  write() {
    const finishedAt = new Date();
    const summary = this.summary();
    const stamp = nowStamp();

    const payload = {
      run: {
        runId: config.runId,
        startedAt: this.startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt - this.startedAt,
        environment: this.environment,
        summary,
      },
      suites: this.suites.map((suite) => ({
        name: suite.name,
        area: suite.area,
        tests: suite.tests.map((test) => ({
          ...test,
          failure: test.failure
            ? { ...test.failure, stack: undefined }
            : null,
          failureStack: test.failure?.stack || null,
        })),
      })),
    };

    fs.writeFileSync(
      path.join(config.reportsDir, `run-${stamp}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    );

    const markdown = this.toMarkdown(payload);
    const latest = path.join(config.reportsDir, "LATEST.md");

    fs.writeFileSync(path.join(config.reportsDir, `run-${stamp}.md`), markdown, "utf8");
    fs.writeFileSync(latest, markdown, "utf8");
    fs.writeFileSync(
      path.join(config.reportsDir, "LATEST.json"),
      JSON.stringify(payload, null, 2),
      "utf8"
    );

    return { stamp, summary, markdown, jsonPath: path.join(config.reportsDir, `run-${stamp}.json`) };
  }

  toMarkdown(payload) {
    const lines = [];
    const { run } = payload;

    lines.push(`# Selenium E2E report — run ${run.runId}`);
    lines.push("");
    lines.push(
      `- Finished: ${run.finishedAt} (${Math.round(run.durationMs / 1000)}s)`
    );
    lines.push(`- App under test: ${run.environment.webBaseUrl}`);
    lines.push(`- API: ${run.environment.apiBaseUrl}`);
    lines.push(
      `- Tests: **${run.summary.total}** — passed ${run.summary.passed}, failed ${run.summary.failed}, skipped ${run.summary.skipped}`
    );
    lines.push("");

    const failures = payload.suites
      .flatMap((suite) => suite.tests.map((test) => ({ suite, test })))
      .filter(({ test }) => test.status === "failed");

    lines.push("## Failures by part of the system");
    lines.push("");

    if (!failures.length) {
      lines.push("No failures recorded in this run.");
      lines.push("");
    } else {
      const byArea = new Map();

      for (const entry of failures) {
        const key = entry.test.area || entry.test.suite;

        byArea.set(key, [...(byArea.get(key) || []), entry]);
      }

      for (const [area, entries] of byArea) {
        lines.push(`### ${area} — ${entries.length} failing test(s)`);
        lines.push("");

        for (const { test } of entries) {
          const badNetwork = test.observations.network.filter(
            (item) => item.status >= 400
          );
          const badConsole = test.observations.console;
          const badPage = test.observations.pageErrors;

          lines.push(`- **${test.suite} → ${test.name}**`);
          lines.push(`  - Screen: \`${test.screen || "n/a"}\``);
          lines.push(`  - Failed at step: _${test.failure.step}_`);
          lines.push(`  - Error: \`${test.failure.name}\` — ${test.failure.message.replace(/\n/g, " ")}`);

          if (badNetwork.length) {
            lines.push(`  - Failing API calls in this test:`);

            for (const item of badNetwork) {
              lines.push(
                `    - \`${item.method} ${item.url}\` → **${item.status}** at step _${item.step}_ :: ${clip(item.body, 220).replace(/\n/g, " ")}`
              );
            }
          }

          if (badPage.length) {
            lines.push(`  - Browser JS errors:`);

            for (const item of badPage) {
              lines.push(`    - ${clip(item.message, 200).replace(/\n/g, " ")} _(step: ${item.step})_`);
            }
          }

          if (badConsole.length) {
            lines.push(`  - Console (first 3 of ${badConsole.length}):`);

            for (const item of badConsole.slice(0, 3)) {
              lines.push(`    - ${item.level}: ${clip(item.message, 200).replace(/\n/g, " ")}`);
            }
          }

          if (test.artifacts.failure) {
            lines.push(`  - Screenshot: \`${test.artifacts.failure}\``);
          }

          lines.push(`  - Steps run: ${test.steps.map((step) => step.label).join(" → ")}`);
          lines.push("");
        }
      }
    }

    lines.push("## All tests");
    lines.push("");
    lines.push("| Suite | Test | Screen | Status | ms |");
    lines.push("| --- | --- | --- | --- | ---: |");

    for (const suite of payload.suites) {
      for (const test of suite.tests) {
        lines.push(
          `| ${suite.name} | ${test.name} | ${test.screen || "—"} | ${test.status} | ${test.durationMs ?? "—"} |`
        );
      }
    }

    lines.push("");

    return lines.join("\n");
  }
}
