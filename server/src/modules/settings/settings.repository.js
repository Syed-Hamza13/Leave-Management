import { db } from "../../config/database.js";
import { stringifyJsonColumn } from "../../lib/jsonColumn.js";

export async function findSettingRow(settingKey) {
  const [rows] = await db.execute(
    `
      SELECT
        id,
        setting_key,
        setting_value,
        is_secret,
        updated_by,
        created_at,
        updated_at
      FROM app_settings
      WHERE setting_key = ?
      LIMIT 1
    `,
    [settingKey]
  );

  return rows[0] || null;
}

export async function upsertSetting(executor, { settingKey, value, isSecret, updatedBy }) {
  await executor.execute(
    `
      INSERT INTO app_settings (
        setting_key,
        setting_value,
        is_secret,
        updated_by
      )
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value),
        is_secret = VALUES(is_secret),
        updated_by = VALUES(updated_by)
    `,
    [settingKey, stringifyJsonColumn(value), isSecret ? 1 : 0, updatedBy ?? null]
  );
}
