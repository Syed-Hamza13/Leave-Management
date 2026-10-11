import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";

import { env } from "../src/config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.resolve(
  __dirname,
  "../sql/migrations"
);

async function createMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      migration VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_migration (migration)
    )
    ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;
  `);
}

function calculateChecksum(sql) {
  return crypto
    .createHash("sha256")
    .update(sql, "utf8")
    .digest("hex");
}

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
    charset: "utf8mb4",
  });

  try {
    await createMigrationsTable(connection);

    const files = await fs.readdir(migrationsDir);

    const migrationFiles = files
      .filter((file) => /^\d+_.+\.sql$/i.test(file))
      .sort();

    const [appliedRows] = await connection.execute(`
      SELECT migration, checksum
      FROM schema_migrations
      ORDER BY id ASC
    `);

    const appliedMigrations = new Map(
      appliedRows.map((row) => [
        row.migration,
        row.checksum,
      ])
    );

    let appliedCount = 0;

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, "utf8");

      const checksum = calculateChecksum(sql);

      if (appliedMigrations.has(file)) {
        const storedChecksum = appliedMigrations.get(file);

        if (storedChecksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch: ${file}`
          );
        }

        continue;
      }

      console.log(`⏳ Applying migration: ${file}`);

      await connection.query(sql);

      await connection.execute(
        `
          INSERT INTO schema_migrations
            (migration, checksum)
          VALUES (?, ?)
        `,
        [file, checksum]
      );

      console.log(`✅ Applied migration: ${file}`);

      appliedCount += 1;
    }

    if (appliedCount === 0) {
      console.log("✅ Database is already up to date.");
    } else {
      console.log(
        `✅ Applied ${appliedCount} migration(s).`
      );
    }
  } finally {
    await connection.end();
  }
}

runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("");
    console.error("❌ Database migration failed.");
    console.error(error);
    process.exit(1);
  });