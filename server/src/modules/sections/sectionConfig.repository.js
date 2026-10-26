import { db } from "../../config/database.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";

function getSettingKey(sectionKey) {
  return `section_config:${sectionKey}`;
}

export async function findSectionConfigRow(sectionKey) {
  const [rows] = await db.execute(
    `
      SELECT
        id,
        setting_key,
        setting_value,
        updated_by,
        created_at,
        updated_at
      FROM app_settings
      WHERE setting_key = ?
      LIMIT 1
    `,
    [getSettingKey(sectionKey)]
  );

  return rows[0] || null;
}

export async function upsertSectionConfigRow(
  executor,
  { sectionKey, value, updatedBy }
) {
  await executor.execute(
    `
      INSERT INTO app_settings (
        setting_key,
        setting_value,
        is_secret,
        updated_by
      )
      VALUES (?, ?, 0, ?)
      ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value),
        updated_by = VALUES(updated_by)
    `,
    [getSettingKey(sectionKey), stringifyJsonColumn(value), updatedBy ?? null]
  );
}

export async function deleteSectionConfigRow(executor, sectionKey) {
  await executor.execute(
    `
      DELETE FROM app_settings
      WHERE setting_key = ?
    `,
    [getSettingKey(sectionKey)]
  );
}

export async function hydrateSectionConfig(rawConfig, metadata = {}) {
  if (!rawConfig || !rawConfig.formId || !rawConfig.tableId) {
    return null;
  }

  const [formRows] = await db.execute(
    `
      SELECT id, form_key, label, status
      FROM form_definitions
      WHERE id = ?
      LIMIT 1
    `,
    [rawConfig.formId]
  );

  const [tableRows] = await db.execute(
    `
      SELECT id, table_key, label, status, storage_kind
      FROM table_definitions
      WHERE id = ?
      LIMIT 1
    `,
    [rawConfig.tableId]
  );

  const [mappingRows] = await db.execute(
    `
      SELECT id, status, version
      FROM form_table_mappings
      WHERE id = ?
      LIMIT 1
    `,
    [rawConfig.mappingId]
  );

  const form = formRows[0];
  const table = tableRows[0];
  const mapping = mappingRows[0];

  if (!form || !table) {
    return null;
  }

  return {
    id: rawConfig.sectionKey,
    sectionKey: rawConfig.sectionKey,
    label: rawConfig.label || form.label,
    isActive: Boolean(rawConfig.isActive ?? true),
    sortOrder: Number(rawConfig.sortOrder ?? 0),
    form: {
      id: form.id,
      key: form.form_key,
      label: form.label,
      status: form.status,
    },
    table: {
      id: table.id,
      key: table.table_key,
      label: table.label,
      status: table.status,
      storageKind: table.storage_kind,
    },
    mapping: mapping
      ? {
          id: mapping.id,
          status: mapping.status,
          version: mapping.version,
        }
      : null,
    createdAt: metadata.createdAt ?? null,
    updatedAt: metadata.updatedAt ?? null,
  };
}
