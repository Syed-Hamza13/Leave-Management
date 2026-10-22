import { db } from "../../config/database.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";
import { limitClause } from "../../lib/pagination.js";

const SELECT_TABLES = `
  SELECT
    t.id,
    t.table_key,
    t.label,
    t.description,
    t.storage_kind,
    t.physical_table,
    t.display_column_key,
    t.is_system,
    t.schema_version,
    t.status,
    t.created_by,
    t.updated_by,
    t.created_at,
    t.updated_at,
    t.archived_at,
    (SELECT COUNT(*) FROM column_definitions c WHERE c.table_id = t.id AND c.status = 'active') AS column_count
  FROM table_definitions t
`;

function mapTable(row) {
  return {
    id: row.id,
    key: row.table_key,
    label: row.label,
    description: row.description,
    storageKind: row.storage_kind,
    physicalTable: row.physical_table,
    displayColumnKey: row.display_column_key,
    isSystem: Boolean(row.is_system),
    schemaVersion: row.schema_version,
    status: row.status,
    columnCount: Number(row.column_count || 0),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function mapColumn(row) {
  return {
    id: row.id,
    tableId: row.table_id,
    key: row.column_key,
    label: row.label,
    description: row.description,
    dataType: row.data_type,
    config: parseJsonColumn(row.config, {}),
    isSystem: Boolean(row.is_system),
    isRequired: Boolean(row.is_required),
    isSearchable: Boolean(row.is_searchable),
    isFilterable: Boolean(row.is_filterable),
    isVisible: Boolean(row.is_visible),
    sortOrder: row.sort_order,
    physicalColumn: row.physical_column,
    relationTableId: row.relation_table_id,
    relationPolicy: row.relation_policy,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function buildListFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.status) {
    conditions.push("t.status = ?");
    params.push(query.status);
  }

  if (query.storageKind) {
    conditions.push("t.storage_kind = ?");
    params.push(query.storageKind);
  }

  if (query.search) {
    conditions.push("(t.label LIKE ? OR t.table_key LIKE ? OR t.description LIKE ?)");

    const pattern = `%${query.search}%`;

    params.push(pattern, pattern, pattern);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function findTables(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      ${SELECT_TABLES}
      ${where}
      ORDER BY t.is_system DESC, t.label ASC, t.id ASC
      ${limitClause(query.limit, query.offset)}
    `,
    params
  );

  return rows.map(mapTable);
}

export async function countTables(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM table_definitions t
      ${where}
    `,
    params
  );

  return Number(rows[0]?.total || 0);
}

export async function findTableById(id) {
  const [rows] = await db.execute(
    `
      ${SELECT_TABLES}
      WHERE t.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] ? mapTable(rows[0]) : null;
}

export async function findTableByKey(key) {
  const [rows] = await db.execute(
    `
      ${SELECT_TABLES}
      WHERE t.table_key = ?
      LIMIT 1
    `,
    [key]
  );

  return rows[0] ? mapTable(rows[0]) : null;
}

export async function findAllActiveTables() {
  const [rows] = await db.execute(
    `
      ${SELECT_TABLES}
      WHERE t.status = 'active'
      ORDER BY t.label ASC
    `
  );

  return rows.map(mapTable);
}

export async function insertTable(connection, table) {
  const [result] = await connection.execute(
    `
      INSERT INTO table_definitions
        (table_key, label, description, storage_kind, physical_table,
         display_column_key, is_system, schema_version, status, created_by, updated_by)
      VALUES (?, ?, ?, 'managed', NULL, NULL, 0, 1, 'active', ?, ?)
    `,
    [
      table.key,
      table.label,
      table.description ?? null,
      table.actorUserId ?? null,
      table.actorUserId ?? null,
    ]
  );

  return result.insertId;
}

export async function updateTable(connection, id, patch, actorUserId) {
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

  if (patch.displayColumnKey !== undefined) {
    assignments.push("display_column_key = ?");
    params.push(patch.displayColumnKey);
  }

  if (patch.status !== undefined) {
    assignments.push("status = ?");
    params.push(patch.status);

    assignments.push("archived_at = ?");
    params.push(patch.status === "archived" ? new Date() : null);
  }

  if (assignments.length === 0) return false;

  assignments.push("updated_by = ?", "updated_at = CURRENT_TIMESTAMP");
  params.push(actorUserId ?? null, id);

  await connection.execute(
    `
      UPDATE table_definitions
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return true;
}

/*
 * Every structural change bumps the version. Records store the version they
 * were validated against, so an older row is never reinterpreted under a newer
 * column layout.
 */
export async function bumpSchemaVersion(connection, tableId) {
  const isNumeric =
    typeof tableId === "number" ||
    (typeof tableId === "string" && /^\d+$/.test(tableId));

  if (isNumeric) {
    await connection.execute(
      `
        UPDATE table_definitions
        SET schema_version = schema_version + 1
        WHERE id = ?
      `,
      [Number(tableId)]
    );
  } else {
    await connection.execute(
      `
        UPDATE table_definitions
        SET schema_version = schema_version + 1
        WHERE table_key = ?
      `,
      [tableId]
    );
  }
}

const SELECT_COLUMNS = `
  SELECT
    c.id, c.table_id, c.column_key, c.label, c.description, c.data_type, c.config,
    c.is_system, c.is_required, c.is_searchable, c.is_filterable, c.is_visible,
    c.sort_order, c.physical_column, c.relation_table_id, c.relation_policy,
    c.status, c.created_at, c.updated_at, c.archived_at
  FROM column_definitions c
`;

export async function findColumnsByTableId(tableId, { includeArchived = true } = {}) {
  const conditions = ["c.table_id = ?"];
  const params = [tableId];

  if (!includeArchived) {
    conditions.push("c.status = 'active'");
  }

  const [rows] = await db.execute(
    `
      ${SELECT_COLUMNS}
      WHERE ${conditions.join(" AND ")}
      ORDER BY c.is_system DESC, c.sort_order ASC, c.id ASC
    `,
    params
  );

  return rows.map(mapColumn);
}

export async function findColumnById(columnId) {
  const [rows] = await db.execute(
    `
      ${SELECT_COLUMNS}
      WHERE c.id = ?
      LIMIT 1
    `,
    [columnId]
  );

  return rows[0] ? mapColumn(rows[0]) : null;
}

export async function findColumnByKey(tableId, columnKey) {
  const [rows] = await db.execute(
    `
      ${SELECT_COLUMNS}
      WHERE c.table_id = ? AND c.column_key = ?
      LIMIT 1
    `,
    [tableId, columnKey]
  );

  return rows[0] ? mapColumn(rows[0]) : null;
}

export async function nextColumnSortOrder(connection, tableId) {
  const [rows] = await connection.execute(
    `
      SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
      FROM column_definitions
      WHERE table_id = ?
    `,
    [tableId]
  );

  return Number(rows[0]?.next_order || 10);
}

export async function insertColumn(connection, column) {
  const [result] = await connection.execute(
    `
      INSERT INTO column_definitions
        (table_id, column_key, label, description, data_type, config,
         is_system, is_required, is_searchable, is_filterable, is_visible,
         sort_order, physical_column, relation_table_id, relation_policy, status)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, ?, ?, 'active')
    `,
    [
      column.tableId,
      column.key,
      column.label,
      column.description ?? null,
      column.dataType,
      stringifyJsonColumn(column.config ?? {}),
      column.isRequired ? 1 : 0,
      column.isSearchable === false ? 0 : 1,
      column.isFilterable === false ? 0 : 1,
      column.isVisible === false ? 0 : 1,
      column.sortOrder ?? 0,
      column.relationTableId ?? null,
      column.relationPolicy ?? null,
    ]
  );

  return result.insertId;
}

export async function updateColumn(connection, columnId, patch) {
  const assignments = [];
  const params = [];

  const directColumns = {
    label: "label",
    description: "description",
    dataType: "data_type",
    isRequired: "is_required",
    isSearchable: "is_searchable",
    isFilterable: "is_filterable",
    isVisible: "is_visible",
    sortOrder: "sort_order",
    relationPolicy: "relation_policy",
    status: "status",
  };

  for (const [patchKey, sqlColumn] of Object.entries(directColumns)) {
    if (patch[patchKey] === undefined) continue;

    assignments.push(`${sqlColumn} = ?`);

    if (typeof patch[patchKey] === "boolean") {
      params.push(patch[patchKey] ? 1 : 0);
    } else {
      params.push(patch[patchKey]);
    }
  }

  if (patch.config !== undefined) {
    assignments.push("config = ?");
    params.push(stringifyJsonColumn(patch.config));
  }

  if (patch.relationTableId !== undefined) {
    assignments.push("relation_table_id = ?");
    params.push(patch.relationTableId);
  }

  if (patch.status !== undefined) {
    assignments.push("archived_at = ?");
    params.push(patch.status === "archived" ? new Date() : null);
  }

  if (assignments.length === 0) return false;

  params.push(columnId);

  await connection.execute(
    `
      UPDATE column_definitions
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return true;
}

export async function deleteColumnPermanently(connection, columnId) {
  const [result] = await connection.execute(
    `
      DELETE FROM column_definitions
      WHERE id = ? AND is_system = 0
    `,
    [columnId]
  );

  return result.affectedRows > 0;
}

export async function applyColumnOrder(connection, tableId, orderedIds) {
  for (let index = 0; index < orderedIds.length; index += 1) {
    await connection.execute(
      `
        UPDATE column_definitions
        SET sort_order = ?
        WHERE id = ? AND table_id = ? AND is_system = 0
      `,
      [(index + 1) * 10, orderedIds[index], tableId]
    );
  }
}

export async function countMappingsForTable(tableId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM form_table_mappings
      WHERE table_id = ?
    `,
    [tableId]
  );

  return Number(rows[0]?.total || 0);
}

export async function countRecordsForTable(tableId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM table_records
      WHERE table_id = ?
    `,
    [tableId]
  );

  return Number(rows[0]?.total || 0);
}

export async function countColumnsUsingRelation(tableId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM column_definitions
      WHERE relation_table_id = ? AND status = 'active'
    `,
    [tableId]
  );

  return Number(rows[0]?.total || 0);
}

export async function countEntityConfigurationsForTable(tableId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM entity_type_configurations
      WHERE table_id = ?
    `,
    [tableId]
  );

  return Number(rows[0]?.total || 0);
}

export async function countProfileValuesForColumn(columnId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM user_profile_values
      WHERE column_definition_id = ?
    `,
    [columnId]
  );

  return Number(rows[0]?.total || 0);
}

export async function countUsersForTable() {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM users
    `
  );

  return Number(rows[0]?.total || 0);
}
