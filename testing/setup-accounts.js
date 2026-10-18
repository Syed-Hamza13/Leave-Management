import path from "node:path";

import dotenv from "dotenv";

import { ROOT_DIR, config } from "./config.js";

/*
 * Creates the two accounts the browser suite owns:
 *   - an administrator that performs every configuration flow
 *   - a limited account used only to prove the permission wall holds
 *
 * It never reads or writes an account outside the E2E emails, so the developer's
 * own sign-in and rows stay untouched.
 */
dotenv.config({ path: path.join(ROOT_DIR, "server/.env") });

const { db } = await import("../server/src/config/database.js");
const { hashPassword, validatePassword } = await import(
  "../server/src/modules/auth/password.policy.js"
);

const ROLE_BY_KEY = new Map();

async function loadRoles() {
  const [rows] = await db.query("SELECT id, role_key FROM roles");

  for (const row of rows) {
    ROLE_BY_KEY.set(row.role_key, row.id);
  }
}

async function ensureAccount({ email, password, role, first, last }) {
  const errors = validatePassword(password);

  if (errors.length) {
    throw new Error(
      `Password for ${email} breaks the app policy: ${errors.join(" ")}`
    );
  }

  const roleId = ROLE_BY_KEY.get(role);

  if (!roleId) {
    throw new Error(`Role "${role}" does not exist in the roles table.`);
  }

  const [existing] = await db.query(
    "SELECT id, status FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  let userId;

  if (existing.length) {
    userId = existing[0].id;

    await db.query(
      "UPDATE users SET password_hash = ?, status = 'active', password_changed_at = CURRENT_TIMESTAMP, first_name = ?, last_name = ? WHERE id = ?",
      [await hashPassword(password), first, last, userId]
    );

    console.log(`   ↻ ${email} already existed (id ${userId}), password reset and status active`);
  } else {
    const [result] = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, status, password_changed_at)
       VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
      [email, await hashPassword(password), first, last]
    );

    userId = result.insertId;
    console.log(`   + ${email} created (id ${userId})`);
  }

  const [held] = await db.query(
    "SELECT id FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1",
    [userId, roleId]
  );

  if (!held.length) {
    await db.query(
      "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
      [userId, roleId]
    );
  }

  const [assigned] = await db.query(
    "SELECT r.role_key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?",
    [userId]
  );

  console.log(`     roles: ${assigned.map((row) => row.role_key).join(", ")}`);

  return userId;
}

async function main() {
  await loadRoles();

  console.log("");
  console.log("E2E account setup");

  await ensureAccount({
    email: config.admin.email,
    password: config.admin.password,
    role: process.env.E2E_ADMIN_ROLE || "super_admin",
    first: "E2E",
    last: "Admin",
  });

  if (config.limited.email && config.limited.password) {
    await ensureAccount({
      email: config.limited.email,
      password: config.limited.password,
      role: process.env.E2E_LIMITED_ROLE || "employee",
      first: "E2E",
      last: "Employee",
    });
  } else {
    console.log("   - no limited account configured; permission-wall tests will skip");
  }

  const [protectedRows] = await db.query(
    "SELECT id, email FROM users WHERE email NOT IN (?)",
    [[config.admin.email, config.limited.email].filter(Boolean)]
  );

  console.log("");
  console.log(
    `Accounts this suite will never touch: ${protectedRows.map((row) => `${row.id}:${row.email}`).join(", ")}`
  );
  console.log("");
}

try {
  await main();
} catch (error) {
  console.error("");
  console.error(
    `E2E account setup failed: ${error.code || error.name || "Error"} — ${error.sqlMessage || error.message || "no further detail"}`
  );

  if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
    console.error("  The database in server/.env could not be reached.");
  }

  console.error("");
  process.exitCode = 1;
} finally {
  await db.end();
}
