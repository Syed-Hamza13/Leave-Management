import { db } from "../../config/database.js";
import { limitClause } from "../../lib/pagination.js";

/*
 * `users` is an authentication-owned table. This repository reads and writes
 * account administration columns only; the auth columns keep their existing
 * meaning and no endpoint accepts raw SQL or an arbitrary column name.
 */

export const USER_SORT_KEYS = [
  "email",
  "firstName",
  "lastName",
  "status",
  "lastLoginAt",
  "createdAt",
];

const SORT_COLUMNS = {
  email: "u.email",
  firstName: "u.first_name",
  lastName: "u.last_name",
  status: "u.status",
  lastLoginAt: "u.last_login_at",
  createdAt: "u.created_at",
};

const USER_COLUMNS = `
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.status,
  u.last_login_at,
  u.password_changed_at,
  u.created_at,
  u.updated_at
`;

function buildUserFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.status) {
    conditions.push("u.status = ?");
    params.push(query.status);
  }

  if (query.search) {
    conditions.push(`(
      u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?
      OR EXISTS (
        SELECT 1
        FROM user_profile_values upv
        INNER JOIN column_definitions cd ON cd.id = upv.column_definition_id
        WHERE upv.user_id = u.id
          AND cd.is_searchable = 1
          AND JSON_UNQUOTE(JSON_EXTRACT(upv.value, '$')) LIKE ?
      )
    )`);

    const pattern = `%${query.search}%`;

    params.push(pattern, pattern, pattern, pattern);
  }

  if (query.role) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
          AND r.role_key = ?
      )
    `);

    params.push(query.role);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

/*
 * Sort terms come from parseSort() against USER_SORT_KEYS, so every emitted
 * fragment is a server-owned column plus a validated direction keyword.
 */
function buildOrderBy(sort = []) {
  const terms = sort
    .filter((term) => SORT_COLUMNS[term.key])
    .map((term) => `${SORT_COLUMNS[term.key]} ${term.direction === "desc" ? "DESC" : "ASC"}`);

  return `ORDER BY ${terms.length > 0 ? `${terms.join(", ")},` : ""} u.id DESC`;
}

export async function findUsers(query = {}) {
  const { where, params } = buildUserFilters(query);

  const [rows] = await db.execute(
    `
      SELECT ${USER_COLUMNS}
      FROM users u
      ${where}
      ${buildOrderBy(query.sort)}
      ${limitClause(query.limit, query.offset)}
    `,
    params
  );

  return rows;
}

export async function countUsers(query = {}) {
  const { where, params } = buildUserFilters(query);

  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM users u
      ${where}
    `,
    params
  );

  return Number(rows[0]?.total ?? 0);
}

export async function findUserRowById(userId) {
  const [rows] = await db.execute(
    `
      SELECT ${USER_COLUMNS}
      FROM users u
      WHERE u.id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

export async function findUserRowByEmail(email) {
  const [rows] = await db.execute(
    `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );

  return rows[0] || null;
}

export async function findRolesForUserIds(userIds = []) {
  if (userIds.length === 0) return [];

  const placeholders = userIds.map(() => "?").join(", ");

  const [rows] = await db.execute(
    `
      SELECT ur.user_id, r.role_key, r.label
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id IN (${placeholders})
      ORDER BY r.role_key
    `,
    userIds
  );

  return rows;
}

export async function findRoleKeysForUser(userId) {
  const [rows] = await db.execute(
    `
      SELECT r.role_key, r.label
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      ORDER BY r.role_key
    `,
    [userId]
  );

  return rows;
}

export async function insertUser(executor, { email, passwordHash, firstName, lastName, status }) {
  const [result] = await executor.execute(
    `
      INSERT INTO users (
        email,
        password_hash,
        first_name,
        last_name,
        status,
        password_changed_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [email, passwordHash, firstName, lastName ?? null, status ?? "active"]
  );

  return result.insertId;
}

export async function updateUserProfile(executor, userId, { firstName, lastName }) {
  const sets = [];
  const params = [];

  if (firstName !== undefined) {
    sets.push("first_name = ?");
    params.push(firstName);
  }

  if (lastName !== undefined) {
    sets.push("last_name = ?");
    params.push(lastName ?? null);
  }

  if (sets.length === 0) return 0;

  params.push(userId);

  const [result] = await executor.execute(
    `
      UPDATE users
      SET ${sets.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return result.affectedRows;
}

export async function updateUserStatus(executor, userId, status) {
  const [result] = await executor.execute(
    `
      UPDATE users
      SET status = ?
      WHERE id = ?
    `,
    [status, userId]
  );

  return result.affectedRows;
}

export async function updateUserPassword(executor, userId, passwordHash) {
  const [result] = await executor.execute(
    `
      UPDATE users
      SET password_hash = ?,
          password_changed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [passwordHash, userId]
  );

  return result.affectedRows;
}

/*
 * Used by the lockout guards: the accounts that can still reach administration
 * while they stay active.
 */
export async function findActiveAccountByRoleKeys(roleKeys = []) {
  if (roleKeys.length === 0) return [];

  const placeholders = roleKeys.map(() => "?").join(", ");

  const [rows] = await db.execute(
    `
      SELECT DISTINCT u.id
      FROM users u
      INNER JOIN user_roles ur ON ur.user_id = u.id
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE u.status = 'active'
        AND r.role_key IN (${placeholders})
    `,
    roleKeys
  );

  return rows.map((row) => Number(row.id));
}

export async function findProfileValuesByUserIds(userIds = []) {
  if (userIds.length === 0) return new Map();

  const placeholders = userIds.map(() => "?").join(", ");

  const [rows] = await db.execute(
    `
      SELECT upv.user_id, cd.column_key, upv.value
      FROM user_profile_values upv
      INNER JOIN column_definitions cd ON cd.id = upv.column_definition_id
      WHERE upv.user_id IN (${placeholders})
        AND cd.status = 'active'
    `,
    userIds
  );

  const byUserId = new Map(userIds.map((id) => [Number(id), {}]));

  for (const row of rows) {
    const userMap = byUserId.get(Number(row.user_id));
    if (userMap) {
      let parsed = row.value;
      if (typeof parsed === "string") {
        const trimmed = parsed.trim();
        if (
          (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
          (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
          (trimmed.startsWith('"') && trimmed.endsWith('"'))
        ) {
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            // keep as string
          }
        }
      }
      userMap[row.column_key] = parsed;
    }
  }

  return byUserId;
}

export async function upsertUserProfileValues(executor, userId, valuesMap, customColumnsByKey) {
  if (!valuesMap || typeof valuesMap !== "object") return;

  for (const [columnKey, rawVal] of Object.entries(valuesMap)) {
    const col = customColumnsByKey.get(columnKey);
    if (!col) continue;

    if (rawVal === null || rawVal === undefined || rawVal === "") {
      await executor.execute(
        `DELETE FROM user_profile_values WHERE user_id = ? AND column_definition_id = ?`,
        [userId, col.id]
      );
    } else {
      const jsonVal = JSON.stringify(rawVal);
      await executor.execute(
        `
          INSERT INTO user_profile_values (user_id, column_definition_id, value)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP
        `,
        [userId, col.id, jsonVal]
      );
    }
  }
}

