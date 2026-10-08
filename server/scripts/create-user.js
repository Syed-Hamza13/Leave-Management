import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import argon2 from "argon2";

import { db } from "../src/config/database.js";

const rl = readline.createInterface({
  input,
  output,
});

async function ask(question) {
  return (await rl.question(question)).trim();
}

async function main() {
  try {
    console.log("");
    console.log("======================================");
    console.log("       CREATE APPLICATION USER");
    console.log("======================================");
    console.log("");

    const email = (await ask("Email: ")).toLowerCase();

    const firstName = await ask("First name: ");
    const lastName = await ask("Last name (optional): ");

    const password = await ask("Password: ");
    const confirmPassword = await ask("Confirm password: ");

    if (!email) {
      throw new Error("Email is required.");
    }

    if (!firstName) {
      throw new Error("First name is required.");
    }

    if (!password) {
      throw new Error("Password is required.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    if (password !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }

    const [existingUsers] = await db.execute(
      `
        SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [email]
    );

    if (existingUsers.length > 0) {
      throw new Error("A user with this email already exists.");
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const [result] = await db.execute(
      `
        INSERT INTO users (
          email,
          password_hash,
          first_name,
          last_name,
          status,
          password_changed_at
        )
        VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
      `,
      [
        email,
        passwordHash,
        firstName,
        lastName || null,
      ]
    );

    console.log("");
    console.log("✅ User created successfully.");
    console.log(`   ID    : ${result.insertId}`);
    console.log(`   Email : ${email}`);
    console.log(`   Name  : ${firstName} ${lastName}`.trim());
    console.log("");

  } catch (error) {
    console.error("");
    console.error("❌ Failed to create user:");
    console.error(error.message);
    console.error("");
    process.exitCode = 1;
  } finally {
    await rl.close();
    await db.end();
  }
}

main();