import { db } from "../../config/database.js";
import { parseJsonColumn } from "../../lib/jsonColumn.js";
import { limitClause } from "../../lib/pagination.js";

const SELECT_MAPPINGS = `
  SELECT
    m.id,
    m.form_id,
    m.table_id,
    m.label,
    m.status,
    m.version,
    m.created_by,
    m.updated_by,
    m.created_at,
    m.updated_at,
    f.form_key,
    f.label AS form_label,
    f.status AS form_status,
    t.table_key,
    t.label AS table_label,
    t.status AS table_status,
    t.storage_kind,
    (SELECT COUNT(*) FROM field_column_mappings fc WHERE fc.mapping_id = m.id) AS entry_count
  FROM form_table_mappings m
  INNER JOIN form_definitions f ON f.id = m.form_id
  INNER JOIN table_definitions t ON t.id = m.table_id
`;

function mapMapping(row) {
  return {
    id: row.id,
    formId: row.form_id,
    tableId: row.table_id,
    label: row.label,
    status: row.status,
    version: row.version,
    entryCount: Number(row.entry_count || 0),
    form: {
      id: row.form_id,
      key: row.form_key,
      label: row.form_label,
      status: row.form_status,
    },
    table: {
      id: row.table_id,
      key: row.table_key,
      label: row.table_label,
      status: row.table_status,
      storageKind: row.storage_kind,
    },
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_ENTRIES = `
  SELECT
    fc.id AS mapping_entry_id,
    fc.mapping_id,
    fc.form_field_id,
    fc.column_id,
    ff.field_id,
    ff.sort_order AS form_field_order,
    ff.label_override,
    ff.is_required_override,
    f.field_key,
    f.label AS field_label,
    f.data_type AS field_data_type,
    f.config AS field_config,
    f.is_required AS field_is_required,
    f.status AS field_status,
    c.table_id AS column_table_id,
    c.column_key,
    c.label AS column_label,
    c.data_type AS column_data_type,
    c.config AS column_config,
    c.is_system AS column_is_system,
    c.is_required AS column_is_required,
    c.status AS column_status
  FROM field_column_mappings fc
  INNER JOIN form_fields ff ON ff.id = fc.form_field_id
  INNER JOIN field_definitions f ON f.id = ff.field_id
  INNER JOIN column_definitions c ON c.id = fc.column_id
`;

export function mapMappingEntry(row) {
  const labelOverride = row.label_override || row.field_label;

  return {
    id: row.mapping_entry_id,
    mappingId: row.mapping_id,
    formFieldId: row.form_field_id,
    columnId: row.column_id,
    field: {
      id: row.field_id,
      key: row.field_key,
      label: labelOverride,
      dataType: row.field_data_type,
      config: parseJsonColumn(row.field_config, {}),
      isRequired:
        row.is_required_override === null || row.is_required_override === undefined
          ? Boolean(row.field_is_required)
          : Boolean(row.is_required_override),
      status: row.field_status,
      sortOrder: row.form_field_order,
    },
    column: {
      id: row.column_id,
      tableId: row.column_table_id,
      key: row.column_key,
      label: row.column_label,
      dataType: row.column_data_type,
      config: parseJsonColumn(row.column_config, {}),
      isSystem: Boolean(row.column_is_system),
      isRequired: Boolean(row.column_is_required),
      status: row.column_status,
    },
  };
}

function buildListFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.tableId) {
    conditions.push("m.table_id = ?");
    params.push(query.tableId);
  }

  if (query.formId) {
    conditions.push("m.form_id = ?");
    params.push(query.formId);
  }

  if (query.status) {
    conditions.push("m.status = ?");
    params.push(query.status);
  }

  if (query.search) {
    conditions.push("(f.label LIKE ? OR t.label LIKE ? OR m.label LIKE ?)");

    const pattern = `%${query.search}%`;

    params.push(pattern, pattern, pattern);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function findMappings(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      ${SELECT_MAPPINGS}
      ${where}
      ORDER BY m.id DESC
      ${limitClause(query.limit, query.offset)}
    `,
    params
  );

  return rows.map(mapMapping);
}

export async function countMappings(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM form_table_mappings m
      INNER JOIN form_definitions f ON f.id = m.form_id
      INNER JOIN table_definitions t ON t.id = m.table_id
      ${where}
    `,
    params
  );

  return Number(rows[0]?.total || 0);
}

export async function findMappingById(mappingId) {
  const [rows] = await db.execute(
    `
      ${SELECT_MAPPINGS}
      WHERE m.id = ?
      LIMIT 1
    `,
    [mappingId]
  );

  return rows[0] ? mapMapping(rows[0]) : null;
}

export async function findMappingByFormAndTable(formId, tableId) {
  const [rows] = await db.execute(
    `
      ${SELECT_MAPPINGS}
      WHERE m.form_id = ? AND m.table_id = ?
      LIMIT 1
    `,
    [formId, tableId]
  );

  return rows[0] ? mapMapping(rows[0]) : null;
}

export async function findEntriesByMappingId(mappingId) {
  const [rows] = await db.execute(
    `
      ${SELECT_ENTRIES}
      WHERE fc.mapping_id = ?
      ORDER BY ff.sort_order ASC, fc.id ASC
    `,
    [mappingId]
  );

  return rows.map(mapMappingEntry);
}

export async function insertMapping(connection, mapping) {
  const [result] = await connection.execute(
    `
      INSERT INTO form_table_mappings
        (form_id, table_id, label, status, version, created_by, updated_by)
      VALUES (?, ?, ?, 'active', 1, ?, ?)
    `,
    [
      mapping.formId,
      mapping.tableId,
      mapping.label ?? null,
      mapping.actorUserId ?? null,
      mapping.actorUserId ?? null,
    ]
  );

  return result.insertId;
}

export async function updateMappingMeta(connection, mappingId, patch, actorUserId) {
  const assignments = ["version = version + 1", "updated_by = ?"];
  const params = [actorUserId ?? null];

  if (patch.label !== undefined) {
    assignments.push("label = ?");
    params.push(patch.label);
  }

  if (patch.status !== undefined) {
    assignments.push("status = ?");
    params.push(patch.status);
  }

  params.push(mappingId);

  await connection.execute(
    `
      UPDATE form_table_mappings
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );
}

export async function deleteMappingById(connection, mappingId) {
  await connection.execute(
    `
      DELETE FROM form_table_mappings
      WHERE id = ?
    `,
    [mappingId]
  );
}

export async function replaceMappingEntries(connection, mappingId, entries) {
  await connection.execute(
    `
      DELETE FROM field_column_mappings
      WHERE mapping_id = ?
    `,
    [mappingId]
  );

  if (entries.length === 0) return;

  const values = entries.map(() => "(?, ?, ?)").join(", ");
  const params = entries.flatMap((entry) => [
    mappingId,
    entry.formFieldId,
    entry.columnId,
  ]);

  await connection.execute(
    `
      INSERT INTO field_column_mappings
        (mapping_id, form_field_id, column_id)
      VALUES ${values}
    `,
    params
  );
}

export async function countEntityConfigurationsForMapping(mappingId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM entity_type_configurations
      WHERE mapping_id = ?
    `,
    [mappingId]
  );

  return Number(rows[0]?.total || 0);
}
