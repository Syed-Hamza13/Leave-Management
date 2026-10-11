import "dotenv/config";

import argon2 from "argon2";
import { db } from "../src/config/database.js";
import { validatePassword } from "../src/modules/auth/password.policy.js";

async function resetPassword() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage: npm run reset-password -- <email> <new-password>");

    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const passwordErrors = validatePassword(password);

  if (passwordErrors.length > 0) {
    console.error("❌ Invalid password:");

    for (const error of passwordErrors) {
      console.error(`   - ${error}`);
    }

    process.exit(1);
  }

  try {
    const [users] = await db.execute(
      `
        SELECT id, email
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [normalizedEmail],
    );

    const user = users[0];

    if (!user) {
      console.error("❌ User not found.");
      process.exit(1);
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await db.execute(
      `
    UPDATE users
    SET
      password_hash = ?,
      password_changed_at = UTC_TIMESTAMP(3)
    WHERE id = ?
  `,
      [passwordHash, user.id],
    );

    console.log("");
    console.log("✅ Password reset successfully.");
    console.log(`   User: ${user.email}`);
    console.log("");
  } catch (error) {
    console.error("❌ Failed to reset password.");
    console.error(error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

resetPassword();
