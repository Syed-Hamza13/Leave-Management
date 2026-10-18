import path from "node:path";

import dotenv from "dotenv";

import { ROOT_DIR, config } from "./config.js";

/*
 * Removes the rows an E2E run left behind. Every definition a suite creates
 * carries the run tag in both its label and its key, so the tag is what this
 * script searches for and nothing else is touched.
 *
 * It reports first and deletes only when told to, because the same database
 * holds the developer's own work:
 *
 *   node cleanup.js                            what would go
 *   node cleanup.js --yes                      delete it
 *   node cleanup.js --run-id 261018123456      only that run's rows
 *
 * Audit events are deliberately kept: they are the evidence of what was tested,
 * and they stay readable when the object they describe has gone.
 */
dotenv.config({ path: path.join(ROOT_DIR, "server/.env") });

let db;

try {
  ({ db } = await import("../server/src/config/database.js"));
} catch (error) {
  console.error(`\nCannot reach the server's database module: ${error.message}`);
  console.error("Run this from a checkout whose server/.env points at the test database.\n");
  process.exit(1);
}

const apply = process.argv.includes("--yes");

const runIdIndex = process.argv.indexOf("--run-id");
const runId = runIdIndex === -1 ? null : String(process.argv[runIdIndex + 1] || "");

if (runIdIndex !== -1 && !/^\d{6,14}$/.test(runId)) {
  console.error(`\n--run-id expects the digits of a run tag, for example 261018123456.\n`);
  process.exit(1);
}

const TAG = runId ? `%e2e${runId.toLowerCase()}%` : "%e2e%";

const BATCH = 500;

const chunks = (list, size = BATCH) =>
  list.length
    ? Array.from({ length: Math.ceil(list.length / size) }, (_, index) =>
        list.slice(index * size, index * size + size)
      )
    : [];

/** A condition that matches nothing, used when a parent list came back empty. */
const NONE = { sql: "1 = 0", params: [] };

/** `column IN (…)` with nothing expanded when the list is empty. */
function whereIn(column, values) {
  if (!values.length) {
    return NONE;
  }

  return {
    sql: `${column} IN (${values.map(() => "?").join(", ")})`,
    params: values,
  };
}

function combine(...conditions) {
  const used = conditions.filter((entry) => entry.sql !== NONE.sql);

  if (!used.length) {
    return NONE;
  }

  return {
    sql: used.map((entry) => `(${entry.sql})`).join(" OR "),
    params: used.flatMap((entry) => entry.params),
  };
}

async function idsOf(table, condition, extra = "") {
  // A condition with nothing in it means no ids matched, never "every row".
  if (condition.sql === "1 = 0") {
    return [];
  }

  const where = extra ? `(${extra}) AND (${condition.sql})` : `(${condition.sql})`;

  const [rows] = await db.query(`SELECT id FROM ${table} WHERE ${where}`, condition.params);

  return rows.map((row) => row.id);
}

async function labeledIds(table, keyColumn, extra = "") {
  return idsOf(
    table,
    combine({ sql: "label LIKE ?", params: [TAG] }, { sql: `${keyColumn} LIKE ?`, params: [TAG] }),
    extra
  );
}

const plan = [];

function step(label, run) {
  plan.push({ label, run });
}

async function buildPlan() {
  /*
   * Every base set is read before anything is deleted: the tag lives on the
   * parent row, so removing a parent first would hide its children.
   */
  const forms = await labeledIds("form_definitions", "form_key");
  const fields = await labeledIds("field_definitions", "field_key");
  const tables = await labeledIds("table_definitions", "table_key", "is_system = 0");
  const dropdowns = await labeledIds("dropdown_definitions", "dropdown_key");
  const types = await labeledIds("organization_entity_types", "type_key");

  const columns = await idsOf(
    "column_definitions",
    combine(
      { sql: "label LIKE ?", params: [TAG] },
      { sql: "column_key LIKE ?", params: [TAG] },
      whereIn("table_id", tables)
    )
  );

  const mappings = await idsOf(
    "form_table_mappings",
    combine(whereIn("form_id", forms), whereIn("table_id", tables), {
      sql: "label LIKE ?",
      params: [TAG],
    })
  );

  const records = await idsOf(
    "table_records",
    combine(whereIn("table_id", tables), { sql: "CAST(data AS CHAR) LIKE ?", params: [TAG] })
  );

  const entities = await idsOf(
    "organization_entities",
    combine(whereIn("entity_type_id", types), { sql: "name LIKE ?", params: [TAG] })
  );

  const accounts = await db
    .query("SELECT id, email FROM users WHERE email LIKE ?", [`%@${config.userTestDomain}`])
    .then(([rows]) =>
      rows.filter(
        (row) =>
          row.email.toLowerCase() !== String(config.admin.email).toLowerCase() &&
          (!config.limited.email || row.email.toLowerCase() !== config.limited.email.toLowerCase()) &&
          !config.protectedEmails.includes(row.email.toLowerCase())
      )
    );

  const accountIds = accounts.map((row) => row.id);

  step("organization configuration rows", [
    "entity_type_configurations",
    combine(whereIn("entity_type_id", types), whereIn("form_id", forms), whereIn("table_id", tables), whereIn("mapping_id", mappings), {
      sql: "label LIKE ?",
      params: [TAG],
    }),
  ]);

  step("field to column pairings", [
    "field_column_mappings",
    combine(whereIn("mapping_id", mappings), whereIn("column_id", columns)),
  ]);

  step("form to table mappings", ["form_table_mappings", whereIn("id", mappings)]);
  step("stored rows", ["table_records", whereIn("id", records)]);
  step("organization entities", ["organization_entities", whereIn("id", entities)]);
  step("form field attachments", [
    "form_fields",
    combine(whereIn("form_id", forms), whereIn("field_id", fields)),
  ]);
  step("table columns", ["column_definitions", combine(whereIn("id", columns), whereIn("table_id", tables))]);
  step("table definitions", ["table_definitions", whereIn("id", tables)]);
  step("field definitions", ["field_definitions", whereIn("id", fields)]);
  step("form definitions", ["form_definitions", whereIn("id", forms)]);
  step("option sets", ["dropdown_definitions", whereIn("id", dropdowns)]);
  step("entity types", ["organization_entity_types", whereIn("id", types)]);
  step("test accounts", ["users", whereIn("id", accountIds)]);

  return accounts;
}

/**
 * Deletes one step's rows, in batches, and reports the count. Children are
 * always deleted before their parents, so no foreign key has to be disabled.
 *
 * The two self-references in this schema (an entity under an entity, a type
 * under a type) answer SET NULL, so an entire tagged set can go in one
 * statement whatever order the rows are deleted in.
 */
async function runStep([table, condition]) {
  const ids = await idsOf(table, condition);

  if (apply && ids.length) {
    for (const batch of chunks(ids)) {
      await db.query(
        `DELETE FROM ${table} WHERE id IN (${batch.map(() => "?").join(", ")})`,
        batch
      );
    }
  }

  return ids.length;
}

async function main() {
  const accounts = await buildPlan();

  console.log("");
  console.log(apply ? "E2E cleanup — deleting" : "E2E cleanup — reporting only (add --yes to delete)");
  console.log(`Looking for rows tagged ${TAG}`);
  console.log("");

  let total = 0;

  for (const entry of plan) {
    const count = await runStep(entry.run);

    total += count;

    console.log(`  ${String(count).padStart(5)}  ${entry.label}${apply && count ? " removed" : ""}`);
  }

  console.log("");
  console.log(`  ${String(total).padStart(5)}  rows ${apply ? "removed" : "found"}`);

  if (accounts.length) {
    console.log("");
    console.log(`  accounts: ${accounts.map((row) => row.email).join(", ")}`);
  }

  if (!apply && total) {
    console.log("");
    console.log("  Nothing was changed. Re-run with --yes to remove these rows.");
  }

  console.log("");
}

try {
  await main();
} catch (error) {
  console.error("");
  console.error(
    `E2E cleanup failed: ${error.code || error.name || "Error"} — ${error.sqlMessage || error.message || "no further detail"}`
  );

  if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
    console.error("  The database in server/.env could not be reached, so nothing was changed.");
  }

  if (error.sql) {
    console.error(`  statement: ${String(error.sql).slice(0, 200)}`);
  }

  console.error("");
  process.exitCode = 1;
} finally {
  await db.end();
}
