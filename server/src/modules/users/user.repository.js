import { db } from "../../config/database.js";
import { parseJsonColumn } from "../../lib/jsonColumn.js";
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

export async function cleanupUserReferences(executor, userIds) {
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).map(Number).filter((id) => id > 0);
  if (ids.length === 0) return;

  const idSet = new Set(ids);

  // 1. Clean up user_reference columns in user_profile_values
  const [userRefCols] = await executor.execute(
    `SELECT id, column_key, config FROM column_definitions WHERE data_type = 'user_reference'`
  );

  if (userRefCols.length > 0) {
    const colIds = userRefCols.map((c) => c.id);
    const placeholders = colIds.map(() => "?").join(",");
    const [profileRows] = await executor.execute(
      `SELECT id, user_id, column_definition_id, value FROM user_profile_values WHERE column_definition_id IN (${placeholders})`,
      colIds
    );

    for (const row of profileRows) {
      const parsed = parseJsonColumn(row.value);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((item) => !idSet.has(Number(item)));
        if (filtered.length !== parsed.length) {
          if (filtered.length === 0) {
            await executor.execute(`DELETE FROM user_profile_values WHERE id = ?`, [row.id]);
          } else {
            await executor.execute(
              `UPDATE user_profile_values SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [JSON.stringify(filtered), row.id]
            );
          }
        }
      } else if (parsed !== null && parsed !== undefined && parsed !== "") {
        if (idSet.has(Number(parsed))) {
          await executor.execute(`DELETE FROM user_profile_values WHERE id = ?`, [row.id]);
        }
      }
    }
  }

  // 2. Clean up user_reference columns in table_records (managed dynamic tables)
  const [tableRefCols] = await executor.execute(
    `SELECT c.id, c.table_id, c.column_key, c.config
     FROM column_definitions c
     JOIN table_definitions t ON c.table_id = t.id
     WHERE c.data_type = 'user_reference' AND t.storage_kind = 'managed'`
  );

  if (tableRefCols.length > 0) {
    const colsByTableId = new Map();
    for (const col of tableRefCols) {
      if (!colsByTableId.has(col.table_id)) {
        colsByTableId.set(col.table_id, []);
      }
      colsByTableId.get(col.table_id).push(col);
    }

    const tableIds = Array.from(colsByTableId.keys());
    const tablePlaceholders = tableIds.map(() => "?").join(",");
    const [records] = await executor.execute(
      `SELECT id, table_id, data FROM table_records WHERE table_id IN (${tablePlaceholders})`,
      tableIds
    );

    for (const record of records) {
      const data = parseJsonColumn(record.data) || {};
      let changed = false;
      const cols = colsByTableId.get(record.table_id) || [];

      for (const col of cols) {
        const key = col.column_key;
        const val = data[key];
        if (val === undefined || val === null) continue;

        if (Array.isArray(val)) {
          const filtered = val.filter((item) => !idSet.has(Number(item)));
          if (filtered.length !== val.length) {
            data[key] = filtered;
            changed = true;
          }
        } else {
          if (idSet.has(Number(val))) {
            data[key] = null;
            changed = true;
          }
        }
      }

      if (changed) {
        await executor.execute(
          `UPDATE table_records SET data = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
          [JSON.stringify(data), record.id]
        );
      }
    }
  }

  // 3. Clear creator / updater fields
  for (const id of ids) {
    await executor.execute(`UPDATE table_records SET updated_by = NULL WHERE updated_by = ?`, [id]);
    await executor.execute(`UPDATE organization_entities SET created_by = NULL WHERE created_by = ?`, [id]);
    await executor.execute(`UPDATE organization_entities SET updated_by = NULL WHERE updated_by = ?`, [id]);
    await executor.execute(`UPDATE user_roles SET assigned_by = NULL WHERE assigned_by = ?`, [id]);
  }
}

export async function cleanupDanglingUserReferences(executor) {
  const [users] = await executor.execute(`SELECT id FROM users`);
  const existingIds = new Set(users.map((u) => u.id));

  // 1. user_profile_values
  const [userRefCols] = await executor.execute(
    `SELECT id, column_key, config FROM column_definitions WHERE data_type = 'user_reference'`
  );
  if (userRefCols.length > 0) {
    const colIds = userRefCols.map((c) => c.id);
    const placeholders = colIds.map(() => "?").join(",");
    const [profileRows] = await executor.execute(
      `SELECT id, value FROM user_profile_values WHERE column_definition_id IN (${placeholders})`,
      colIds
    );
    for (const row of profileRows) {
      const parsed = parseJsonColumn(row.value);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((item) => existingIds.has(Number(item)));
        if (filtered.length !== parsed.length) {
          if (filtered.length === 0) {
            await executor.execute(`DELETE FROM user_profile_values WHERE id = ?`, [row.id]);
          } else {
            await executor.execute(
              `UPDATE user_profile_values SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [JSON.stringify(filtered), row.id]
            );
          }
        }
      } else if (parsed !== null && parsed !== undefined && parsed !== "") {
        if (!existingIds.has(Number(parsed))) {
          await executor.execute(`DELETE FROM user_profile_values WHERE id = ?`, [row.id]);
        }
      }
    }
  }

  // 2. table_records
  const [tableRefCols] = await executor.execute(
    `SELECT c.id, c.table_id, c.column_key, c.config
     FROM column_definitions c
     JOIN table_definitions t ON c.table_id = t.id
     WHERE c.data_type = 'user_reference' AND t.storage_kind = 'managed'`
  );
  if (tableRefCols.length > 0) {
    const colsByTableId = new Map();
    for (const col of tableRefCols) {
      if (!colsByTableId.has(col.table_id)) colsByTableId.set(col.table_id, []);
      colsByTableId.get(col.table_id).push(col);
    }
    const tableIds = Array.from(colsByTableId.keys());
    const tablePlaceholders = tableIds.map(() => "?").join(",");
    const [records] = await executor.execute(
      `SELECT id, table_id, data FROM table_records WHERE table_id IN (${tablePlaceholders})`,
      tableIds
    );
    for (const record of records) {
      const data = parseJsonColumn(record.data) || {};
      let changed = false;
      const cols = colsByTableId.get(record.table_id) || [];
      for (const col of cols) {
        const key = col.column_key;
        const val = data[key];
        if (val === undefined || val === null) continue;
        if (Array.isArray(val)) {
          const filtered = val.filter((item) => existingIds.has(Number(item)));
          if (filtered.length !== val.length) {
            data[key] = filtered;
            changed = true;
          }
        } else {
          if (!existingIds.has(Number(val))) {
            data[key] = null;
            changed = true;
          }
        }
      }
      if (changed) {
        await executor.execute(
          `UPDATE table_records SET data = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
          [JSON.stringify(data), record.id]
        );
      }
    }
  }
}

export async function deleteUserRow(executor, userId) {
  await cleanupUserReferences(executor, [userId]);
  await executor.execute(`DELETE FROM user_profile_values WHERE user_id = ?`, [userId]);
  await executor.execute(`DELETE FROM user_roles WHERE user_id = ?`, [userId]);
  await executor.execute(`DELETE FROM user_devices WHERE user_id = ?`, [userId]);
  await executor.execute(`DELETE FROM user_sessions WHERE user_id = ?`, [userId]);
  const [result] = await executor.execute(`DELETE FROM users WHERE id = ?`, [userId]);
  return result.affectedRows > 0;
}


