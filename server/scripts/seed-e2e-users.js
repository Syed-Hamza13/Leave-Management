import { db } from "../src/config/database.js";
import { hashPassword } from "../src/modules/auth/password.policy.js";

async function seed() {
  const users = [
    {
      email: "e2e.admin@leave.test",
      firstName: "E2E",
      lastName: "Admin",
      password: "E2eAdmin!2026",
      roleKey: "super_admin",
    },
    {
      email: "e2e.employee@leave.test",
      firstName: "E2E",
      lastName: "Employee",
      password: "E2eWorker!2026",
      roleKey: "employee",
    },
  ];

  for (const u of users) {
    const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [u.email]);
    let userId;
    if (existing.length === 0) {
      const hash = await hashPassword(u.password);
      const [res] = await db.query(
        "INSERT INTO users (email, password_hash, first_name, last_name, status) VALUES (?, ?, ?, ?, 'active')",
        [u.email, hash, u.firstName, u.lastName]
      );
      userId = res.insertId;
      console.log(`Created user ${u.email} (id: ${userId})`);
    } else {
      userId = existing[0].id;
      const hash = await hashPassword(u.password);
      await db.query("UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?", [hash, userId]);
      console.log(`Updated user ${u.email} (id: ${userId})`);
    }

    const [roleRow] = await db.query("SELECT id FROM roles WHERE role_key = ?", [u.roleKey]);
    if (roleRow.length > 0) {
      const roleId = roleRow[0].id;
      const [hasRole] = await db.query(
        "SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?",
        [userId, roleId]
      );
      if (hasRole.length === 0) {
        await db.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roleId]);
        console.log(`Assigned role ${u.roleKey} to ${u.email}`);
      }
    }
  }

  await db.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
