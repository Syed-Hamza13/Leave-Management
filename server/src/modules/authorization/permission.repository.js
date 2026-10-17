import { db } from "../../config/database.js";

export async function findPermissionKeysByUserId(userId) {
  const [rows] = await db.execute(
    `
      SELECT DISTINCT p.permission_key
      FROM user_roles ur
      INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
      INNER JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ?
    `,
    [userId]
  );

  return rows.map((row) => row.permission_key);
}

export async function findRoleKeysByUserId(userId) {
  const [rows] = await db.execute(
    `
      SELECT r.role_key, r.label
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      ORDER BY r.id ASC
    `,
    [userId]
  );

  return rows;
}

export async function findAllRoles() {
  const [rows] = await db.execute(
    `
      SELECT id, role_key, label, description, is_system, created_at
      FROM roles
      ORDER BY id ASC
    `
  );

  return rows;
}

export async function replaceUserRoles(connection, userId, roleIds, assignedBy) {
  await connection.execute(
    `
      DELETE FROM user_roles
      WHERE user_id = ?
    `,
    [userId]
  );

  if (roleIds.length === 0) return;

  const values = roleIds.map(() => "(?, ?, ?)").join(", ");
  const params = roleIds.flatMap((roleId) => [userId, roleId, assignedBy]);

  await connection.execute(
    `
      INSERT INTO user_roles (user_id, role_id, assigned_by)
      VALUES ${values}
    `,
    params
  );
}

export async function countAllRoleAssignments() {
  const [rows] = await db.execute(`
    SELECT COUNT(*) AS total
    FROM user_roles
  `);

  return Number(rows[0]?.total || 0);
}
