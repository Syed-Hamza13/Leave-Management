import { db } from "../../config/database.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";
import { limitClause } from "../../lib/pagination.js";
import { recordJsonPath } from "../../lib/identifiers.js";
import { getDataType, STORAGE_FAMILIES } from "../../lib/dataTypes.js";
import { escapeLikePattern } from "../../lib/recordQuery.js";

const SELECT_RECORDS = `
  SELECT
    r.id,
    r.table_id,
    r.schema_version,
    r.data,
    r.organization_entity_id,
    r.status,
    r.created_by,
    r.updated_by,
    r.created_at,
    r.updated_at,
    r.archived_at
  FROM table_records r
`;

function mapRecord(row) {
  return {
    id: row.id,
    tableId: row.table_id,
    schemaVersion: row.schema_version,
    values: parseJsonColumn(row.data, {}),
    organizationEntityId: row.organization_entity_id,
    status: row.status,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

/*
 * Record values live in one JSON column, so every comparable expression is a
 * JSON_EXTRACT against a path built from a server-owned column key and bound as
 * a parameter. The literals used for comparison are bound too, which keeps
 * client text out of the SQL entirely.
 */
const JSON_TEXT_EXPRESSION = "JSON_UNQUOTE(JSON_EXTRACT(r.data, ?))";
const JSON_NUMBER_EXPRESSION = "CAST(JSON_EXTRACT(r.data, ?) AS DECIMAL(30,6))";
const JSON_RAW_EXPRESSION = "JSON_EXTRACT(r.data, ?)";

function textLiteral(value) {
  return { sql: "?", params: [value] };
}

function jsonLiteral(value) {
  return { sql: "CAST(? AS JSON)", params: [JSON.stringify(value)] };
}

function buildValueDescriptor(column) {
  const type = getDataType(column.dataType);

  if (!type) return null;

  const path = recordJsonPath(column.key);

  if (type.storage === STORAGE_FAMILIES.NUMBER) {
    return {
      key: column.key,
      storage: type.storage,
      dataTypeKey: type.key,
      config: column.config,
      accessor: () => ({ sql: JSON_NUMBER_EXPRESSION, params: [path] }),
      literal: textLiteral,
    };
  }

  if (type.storage === STORAGE_FAMILIES.BOOLEAN) {
    return {
      key: column.key,
      storage: type.storage,
      dataTypeKey: type.key,
      config: column.config,
      accessor: () => ({ sql: JSON_RAW_EXPRESSION, params: [path] }),
      literal: (value) => jsonLiteral(Boolean(value)),
    };
  }

  if (type.storage === STORAGE_FAMILIES.REFERENCE) {
    /*
     * A multi-select reference stores a JSON array, and array membership is not
     * expressible through the shared comparison operators. Those columns are
     * left out of the descriptor map so filtering on them is rejected with
     * INVALID_COLUMN instead of silently returning wrong rows.
     */
    if (column.config?.allowMultiple) return null;

    return {
      key: column.key,
      storage: type.storage,
      dataTypeKey: type.key,
      config: column.config,
      accessor: () => ({ sql: JSON_RAW_EXPRESSION, params: [path] }),
      literal: (value) => jsonLiteral(Number(value)),
    };
  }

  return {
    key: column.key,
    storage: type.storage,
    dataTypeKey: type.key,
    config: column.config,
    accessor: () => ({ sql: JSON_TEXT_EXPRESSION, params: [path] }),
    literal: textLiteral,
  };
}

/*
 * Record-level columns are sortable and filterable under fixed keys. They are
 * real MySQL columns rather than JSON paths, and their keys cannot collide with
 * a user column because identifiers.js reserves them and forbids uppercase.
 */
const SYSTEM_DESCRIPTORS = [
  {
    key: "id",
    storage: STORAGE_FAMILIES.NUMBER,
    dataTypeKey: "number",
    config: {},
    accessor: () => ({ sql: "r.id", params: [] }),
    literal: textLiteral,
  },
  {
    key: "status",
    storage: STORAGE_FAMILIES.STRING,
    dataTypeKey: "text",
    config: {},
    accessor: () => ({ sql: "r.status", params: [] }),
    literal: textLiteral,
  },
  {
    key: "createdBy",
    storage: STORAGE_FAMILIES.NUMBER,
    dataTypeKey: "number",
    config: {},
    accessor: () => ({ sql: "r.created_by", params: [] }),
    literal: textLiteral,
  },
  {
    key: "createdAt",
    storage: STORAGE_FAMILIES.DATE,
    dataTypeKey: "date",
    config: {},
    accessor: () => ({ sql: "DATE(r.created_at)", params: [] }),
    literal: textLiteral,
  },
  {
    key: "updatedAt",
    storage: STORAGE_FAMILIES.DATE,
    dataTypeKey: "date",
    config: {},
    accessor: () => ({ sql: "DATE(r.updated_at)", params: [] }),
    literal: textLiteral,
  },
];

export const SYSTEM_SORT_KEYS = SYSTEM_DESCRIPTORS.map((descriptor) => descriptor.key);

export function buildRecordDescriptors(columns = []) {
  const descriptors = new Map();

  for (const column of columns) {
    if (column.isSystem) continue;

    const descriptor = buildValueDescriptor(column);

    if (descriptor) descriptors.set(column.key, descriptor);
  }

  for (const descriptor of SYSTEM_DESCRIPTORS) {
    if (!descriptors.has(descriptor.key)) descriptors.set(descriptor.key, descriptor);
  }

  return descriptors;
}

export async function findRecords({ where, orderBy, limit, offset }) {
  const [rows] = await db.execute(
    `
      ${SELECT_RECORDS}
      ${where.sql}
      ${orderBy.sql}
      ${limitClause(limit, offset)}
    `,
    [...where.params, ...orderBy.params]
  );

  return rows.map(mapRecord);
}

export async function countRecords({ where }) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM table_records r
      ${where.sql}
    `,
    where.params
  );

  return Number(rows[0]?.total || 0);
}

export async function findRecordById(tableId, recordId) {
  const [rows] = await db.execute(
    `
      ${SELECT_RECORDS}
      WHERE r.table_id = ? AND r.id = ?
      LIMIT 1
    `,
    [tableId, recordId]
  );

  return rows[0] ? mapRecord(rows[0]) : null;
}

export async function insertRecord(connection, record) {
  const [result] = await connection.execute(
    `
      INSERT INTO table_records
        (table_id, schema_version, data, organization_entity_id, status, created_by, updated_by)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `,
    [
      record.tableId,
      record.schemaVersion,
      stringifyJsonColumn(record.data),
      record.organizationEntityId ?? null,
      record.actorUserId ?? null,
      record.actorUserId ?? null,
    ]
  );

  return result.insertId;
}

export async function updateRecordValues(connection, recordId, patch) {
  const assignments = [];
  const params = [];

  if (patch.data !== undefined) {
    assignments.push("data = ?");
    params.push(stringifyJsonColumn(patch.data));
  }

  if (patch.schemaVersion !== undefined) {
    assignments.push("schema_version = ?");
    params.push(patch.schemaVersion);
  }

  if (patch.organizationEntityId !== undefined) {
    assignments.push("organization_entity_id = ?");
    params.push(patch.organizationEntityId);
  }

  if (assignments.length === 0) return false;

  assignments.push("updated_by = ?");
  params.push(patch.actorUserId ?? null, recordId);

  await connection.execute(
    `
      UPDATE table_records
      SET ${assignments.join(", ")}
      WHERE id = ? AND status = 'active'
    `,
    params
  );

  return true;
}

export async function archiveRecordById(connection, recordId, actorUserId) {
  const [result] = await connection.execute(
    `
      UPDATE table_records
      SET status = 'archived',
          archived_at = CURRENT_TIMESTAMP(3),
          updated_by = ?
      WHERE id = ? AND status = 'active'
    `,
    [actorUserId ?? null, recordId]
  );

  return result.affectedRows > 0;
}

export async function countActiveRecordsInTable(tableId, recordIds) {
  if (!recordIds || recordIds.length === 0) return 0;

  const placeholders = recordIds.map(() => "?").join(", ");

  const [rows] = await db.execute(
    `
      SELECT COUNT(DISTINCT id) AS total
      FROM table_records
      WHERE table_id = ? AND status = 'active' AND id IN (${placeholders})
    `,
    [tableId, ...recordIds]
  );

  return Number(rows[0]?.total || 0);
}

export async function findActiveOrganizationEntity(entityId) {
  const [rows] = await db.execute(
    `
      SELECT id, entity_type_id, name, status
      FROM organization_entities
      WHERE id = ? AND status = 'active'
      LIMIT 1
    `,
    [entityId]
  );

  return rows[0] || null;
}

/*
 * Distinct values for one column, bounded and paginated so a filter dropdown
 * never asks the browser to hold an unbounded value list.
 */
export async function findFacetValues({ descriptor, tableId, search, limit, offset }) {
  const { sql: expression, params: expressionParams } = descriptor.accessor();

  const searchable =
    descriptor.storage === STORAGE_FAMILIES.STRING
      ? { sql: expression, params: expressionParams }
      : { sql: `CAST(${expression} AS CHAR)`, params: expressionParams };

  const conditions = ["r.table_id = ?", "r.status = 'active'", `${expression} IS NOT NULL`];
  const conditionParams = [tableId, ...expressionParams];

  if (search) {
    conditions.push(`${searchable.sql} LIKE ? ESCAPE '!'`);
    conditionParams.push(...searchable.params, `%${escapeLikePattern(search)}%`);
  }

  const whereSql = `WHERE ${conditions.join(" AND ")}`;

  const [rows] = await db.execute(
    `
      SELECT ${expression} AS facet_value
      FROM table_records r
      ${whereSql}
      GROUP BY facet_value
      ORDER BY facet_value ASC
      ${limitClause(limit, offset)}
    `,
    [...expressionParams, ...conditionParams]
  );

  const [countRows] = await db.execute(
    `
      SELECT COUNT(DISTINCT ${expression}) AS total
      FROM table_records r
      ${whereSql}
    `,
    [...expressionParams, ...conditionParams]
  );

  return {
    values: rows.map((row) => row.facet_value),
    total: Number(countRows[0]?.total || 0),
  };
}
