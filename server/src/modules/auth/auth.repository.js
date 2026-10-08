import { db } from "../../config/database.js";

export async function findUserByEmail(email) {
  const [rows] = await db.execute(
    `
      SELECT
        id,
        email,
        password_hash,
        first_name,
        last_name,
        status,
        last_login_at,
        password_changed_at,
        created_at,
        updated_at
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );

  return rows[0] || null;
}

export async function findUserById(id) {
  const [rows] = await db.execute(
    `
      SELECT
        id,
        email,
        first_name,
        last_name,
        status,
        last_login_at,
        password_changed_at,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

export async function updateLastLogin(userId) {
  await db.execute(
    `
      UPDATE users
      SET last_login_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [userId]
  );
}