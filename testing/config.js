import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

export const TESTING_DIR = here;
export const ROOT_DIR = path.resolve(here, "..");
export const ARTIFACTS_DIR = path.join(here, "reports", "artifacts");

dotenv.config({ path: path.join(here, ".env") });

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing ${name} in testing/.env (copy testing/.env.example and fill it in).`
    );
  }

  return value;
}

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const argv = process.argv.slice(2);

function flag(name) {
  return argv.includes(`--${name}`);
}

function option(name, fallback = null) {
  const index = argv.indexOf(`--${name}`);

  return index === -1 ? fallback : argv[index + 1];
}

const runId = option(
  "run-id",
  new Date().toISOString().replace(/[-:TZ.]/g, "").slice(2, 14)
);

export const config = {
  runId,

  webBaseUrl: (option("base-url") || process.env.E2E_BASE_URL || "http://localhost:5173").replace(/\/$/, ""),
  apiBaseUrl: process.env.E2E_API_URL || "http://localhost:4000/api/v1",

  admin: {
    email: required("E2E_ADMIN_EMAIL"),
    password: required("E2E_ADMIN_PASSWORD"),
  },

  limited: {
    email: process.env.E2E_LIMITED_EMAIL,
    password: process.env.E2E_LIMITED_PASSWORD,
  },

  // Accounts the suite must never modify or log in as.
  protectedEmails: (process.env.E2E_PROTECTED_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),

  userTestDomain: process.env.E2E_USER_EMAIL_DOMAIN || "leave.test",

  headless: flag("headless"),
  slowMo: Number(process.env.E2E_SLOW_MO || 0),
  keepOpen: flag("keep-open"),

  // Only suites whose name contains one of these substrings are executed.
  suiteFilter: option("suite"),
  testFilter: option("test"),

  timeouts: {
    element: Number(process.env.E2E_ELEMENT_TIMEOUT || 12000),
    toast: Number(process.env.E2E_TOAST_TIMEOUT || 8000),
    pageLoad: 30000,
  },

  reportsDir: path.join(here, "reports"),
  artifactsDir: ARTIFACTS_DIR,
};

export const isolate = {
  // Every row this suite creates carries the run tag, so leftovers are findable.
  tag: `E2E${runId}`,
  label: (name) => `${name} ${isolate.tag}`,
  key: (name) =>
    `${name}_${isolate.tag}`.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
  email: (name) =>
    `${name}.${isolate.tag.toLowerCase()}@${config.userTestDomain}`,
};
