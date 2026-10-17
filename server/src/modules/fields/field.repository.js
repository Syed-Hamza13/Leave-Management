import { db } from "../../config/database.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";
import { limitClause } from "../../lib/pagination.js";

const SELECT_FIELDS = `
  SELECT
    f.id,
    f.field_key,
    f.label,
    f.description,
    f.data_type,
    f.config,
    f.is_required,
    f.default_value,
    f.help_text,
    f.status,
    f.created_by,
    f.updated_by,
    f.created_at,
    f.updated_at,
    f.archived_at,
    (SELECT COUNT(*) FROM form_fields ff WHERE ff.field_id = f.id) AS form_count
  FROM field_definitions f
`;

function mapField(row) {
  return {
    id: row.id,
    key: row.field_key,
    label: row.label,
    description: row.description,
    dataType: row.data_type,
    config: parseJsonColumn(row.config, {}),
    isRequired: Boolean(row.is_required),
    defaultValue: parseJsonColumn(row.default_value, null),
    helpText: row.help_text,
    status: row.status,
    formCount: Number(row.form_count || 0),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function buildListFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.status) {
    conditions.push("f.status = ?");
    params.push(query.status);
  }

  if (query.dataType) {
    conditions.push("f.data_type = ?");
    params.push(query.dataType);
  }

  if (query.search) {
    conditions.push("(f.label LIKE ? OR f.field_key LIKE ? OR f.description LIKE ?)");

    const pattern = `%${query.search}%`;

    params.push(pattern, pattern, pattern);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function findFields(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      ${SELECT_FIELDS}
      ${where}
      ORDER BY f.label ASC, f.id ASC
      ${limitClause(query.limit, query.offset)}
    `,
    params
  );

  return rows.map(mapField);
}

export async function countFields(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM field_definitions f
      ${where}
    `,
    params
  );

  return Number(rows[0]?.total || 0);
}

export async function findFieldById(id) {
  const [rows] = await db.execute(
    `
      ${SELECT_FIELDS}
      WHERE f.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] ? mapField(rows[0]) : null;
}

export async function findFieldByKey(key) {
  const [rows] = await db.execute(
    `
      ${SELECT_FIELDS}
      WHERE f.field_key = ?
      LIMIT 1
    `,
    [key]
  );

  return rows[0] ? mapField(rows[0]) : null;
}

export async function findFieldsByIds(ids) {
  if (!ids || ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");

  const [rows] = await db.execute(
    `
      ${SELECT_FIELDS}
      WHERE f.id IN (${placeholders})
    `,
    ids
  );

  return rows.map(mapField);
}

export async function insertField(connection, field) {
  const [result] = await connection.execute(
    `
      INSERT INTO field_definitions
        (field_key, label, description, data_type, config, is_required,
         default_value, help_text, status, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `,
    [
      field.key,
      field.label,
      field.description ?? null,
      field.dataType,
      stringifyJsonColumn(field.config ?? {}),
      field.isRequired ? 1 : 0,
      stringifyJsonColumn(field.defaultValue ?? null),
      field.helpText ?? null,
      field.actorUserId ?? null,
      field.actorUserId ?? null,
    ]
  );

  return result.insertId;
}

export async function updateField(connection, id, patch, actorUserId) {
  const assignments = [];
  const params = [];

  if (patch.label !== undefined) {
    assignments.push("label = ?");
    params.push(patch.label);
  }

  if (patch.description !== undefined) {
    assignments.push("description = ?");
    params.push(patch.description);
  }

  if (patch.config !== undefined) {
    assignments.push("config = ?");
    params.push(stringifyJsonColumn(patch.config));
  }

  if (patch.isRequired !== undefined) {
    assignments.push("is_required = ?");
    params.push(patch.isRequired ? 1 : 0);
  }

  if (patch.defaultValue !== undefined) {
    assignments.push("default_value = ?");
    params.push(stringifyJsonColumn(patch.defaultValue));
  }

  if (patch.helpText !== undefined) {
    assignments.push("help_text = ?");
    params.push(patch.helpText);
  }

  if (patch.status !== undefined) {
    assignments.push("status = ?");
    params.push(patch.status);

    assignments.push("archived_at = ?");
    params.push(patch.status === "archived" ? new Date() : null);
  }

  if (assignments.length === 0) return false;

  assignments.push("updated_by = ?");
  params.push(actorUserId ?? null);
  params.push(id);

  await connection.execute(
    `
      UPDATE field_definitions
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return true;
}

export async function countFieldUsageInForms(id) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM form_fields
      WHERE field_id = ?
    `,
    [id]
  );

  return Number(rows[0]?.total || 0);
}
