import { badRequest, conflict, notFound } from "../../lib/appError.js";
import { withTransaction } from "../../lib/transactions.js";
import {
  assertValidKey,
  assertKeyNotReserved,
  slugifyKey,
} from "../../lib/identifiers.js";
import { assertDataType, normalizeTypeConfig } from "../../lib/dataTypes.js";
import { recordAudit } from "../audit/audit.service.js";
import { findDropdownById } from "../dropdowns/dropdown.repository.js";
import {
  findTables,
  countTables,
  findTableById,
  findTableByKey,
  findAllActiveTables,
  insertTable,
  updateTable,
  bumpSchemaVersion,
  findColumnsByTableId,
  findColumnById,
  findColumnByKey,
  nextColumnSortOrder,
  insertColumn,
  updateColumn,
  applyColumnOrder,
  countMappingsForTable,
  countRecordsForTable,
  countColumnsUsingRelation,
  countEntityConfigurationsForTable,
  countProfileValuesForColumn,
  countUsersForTable,
} from "./table.repository.js";

export async function listTables(query) {
  const [tables, total] = await Promise.all([
    findTables(query),
    countTables(query),
  ]);

  return { tables, total };
}

export async function listActiveTableSummaries() {
  const tables = await findAllActiveTables();

  return tables.map((table) => ({
    id: table.id,
    key: table.key,
    label: table.label,
    storageKind: table.storageKind,
    isSystem: table.isSystem,
    columnCount: table.columnCount,
  }));
}

export async function getTable(tableId, { includeColumns = true } = {}) {
  const isNumeric =
    typeof tableId === "number" ||
    (typeof tableId === "string" && /^\d+$/.test(tableId.trim()));

  const table = isNumeric
    ? await findTableById(Number(tableId))
    : await findTableByKey(String(tableId));

  if (!table) {
    throw notFound("Table not found.", { code: "TABLE_NOT_FOUND" });
  }

  if (!includeColumns) return table;

  const columns = await findColumnsByTableId(table.id);

  return { ...table, columns };
}

/*
 * The record layer needs the definition plus its live columns in one shape and
 * must never operate on an archived table.
 */
export async function getActiveTableWithColumns(tableId) {
  const table = await getTable(tableId, { includeColumns: false });

  if (table.status !== "active") {
    throw conflict("This table is archived and cannot accept changes.", {
      code: "TABLE_ARCHIVED",
    });
  }

  const columns = await findColumnsByTableId(tableId, { includeArchived: false });

  return { ...table, columns };
}

export async function createTable(payload, actor) {
  const key = assertValidKey(payload.key || slugifyKey(payload.label), "table key");

  assertKeyNotReserved(key, "Table key");

  if (await findTableByKey(key)) {
    throw conflict(`A table with key "${key}" already exists.`, {
      code: "TABLE_KEY_TAKEN",
    });
  }

  const tableId = await withTransaction(async (connection) => {
    const insertId = await insertTable(connection, {
      key,
      label: payload.label,
      description: payload.description ?? null,
      actorUserId: actor?.userId ?? null,
    });

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "table.create",
      entityType: "table",
      entityId: insertId,
      summary: { key, label: payload.label },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return insertId;
  });

  return getTable(tableId);
}

async function assertDisplayColumn(tableId, displayColumnKey) {
  if (displayColumnKey === null || displayColumnKey === undefined) return;

  const column = await findColumnByKey(tableId, displayColumnKey);

  if (!column || column.status !== "active") {
    throw badRequest("The display column does not exist on this table.", {
      code: "INVALID_DISPLAY_COLUMN",
    });
  }

  if (!column.isVisible) {
    throw badRequest("The display column must be visible.", {
      code: "INVALID_DISPLAY_COLUMN",
    });
  }
}

export async function updateTableDefinition(tableId, patch, actor) {
  const current = await getTable(tableId, { includeColumns: false });

  if (patch.status === "archived") {
    if (current.isSystem) {
      throw conflict("System tables cannot be archived.", { code: "SYSTEM_TABLE_LOCKED" });
    }

    const recordCount = await countRecordsForTable(tableId);

    if (recordCount > 0) {
      throw conflict(
        `This table holds ${recordCount} record(s). Archive them before archiving the table.`,
        { code: "TABLE_HAS_RECORDS" }
      );
    }

    const mappingCount = await countMappingsForTable(tableId);

    if (mappingCount > 0) {
      throw conflict(
        `This table is used by ${mappingCount} mapping(s). Remove those mappings first.`,
        { code: "TABLE_HAS_MAPPINGS" }
      );
    }

    const relationCount = await countColumnsUsingRelation(tableId);

    if (relationCount > 0) {
      throw conflict(
        `${relationCount} column(s) in other tables reference this table.`,
        { code: "TABLE_IS_REFERENCED" }
      );
    }

    const configCount = await countEntityConfigurationsForTable(tableId);

    if (configCount > 0) {
      throw conflict(
        `This table is configured on ${configCount} organization section(s).`,
        { code: "TABLE_IN_ORGANIZATION_USE" }
      );
    }
  }

  if (patch.displayColumnKey !== undefined) {
    await assertDisplayColumn(tableId, patch.displayColumnKey);
  }

  const changed = await withTransaction(async (connection) => {
    const didUpdate = await updateTable(
      connection,
      tableId,
      patch,
      actor?.userId ?? null
    );

    if (didUpdate) {
      await recordAudit({
        connection,
        actorUserId: actor?.userId ?? null,
        action: patch.status === "archived" ? "table.archive" : "table.update",
        entityType: "table",
        entityId: tableId,
        summary: { changedKeys: Object.keys(patch) },
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
      });
    }

    return didUpdate;
  });

  if (!changed) {
    throw badRequest("No changes were supplied.", { code: "NO_CHANGES" });
  }

  return getTable(tableId);
}

export async function archiveTable(tableId, actor) {
  const current = await getTable(tableId, { includeColumns: false });

  if (current.status === "archived") return current;

  return updateTableDefinition(tableId, { status: "archived" }, actor);
}

export async function listColumns(tableId) {
  await getTable(tableId, { includeColumns: false });

  return findColumnsByTableId(tableId);
}

/*
 * Relation columns are ordinary columns whose data type is record_reference.
 * The relation target is resolved here and stored both inside `config` and on
 * `relation_table_id` so integrity checks can use a real foreign key.
 */
async function resolveRelation({ tableId, dataType, config, relationTableId }) {
  const wantsRelation = dataType === "record_reference" || relationTableId != null;

  if (!wantsRelation) {
    return { config, relationTableId: null, relationPolicy: null };
  }

  const targetId = Number(relationTableId ?? config?.targetTableId);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw badRequest("A relation column must name the table it points at.", {
      code: "RELATION_TARGET_REQUIRED",
    });
  }

  if (targetId === Number(tableId)) {
    throw badRequest("A table cannot relate to itself.", { code: "SELF_RELATION_BLOCKED" });
  }

  const target = await findTableById(targetId);

  if (!target) {
    throw badRequest("The related table does not exist.", { code: "RELATION_TARGET_NOT_FOUND" });
  }

  if (target.status !== "active") {
    throw badRequest("The related table is archived.", { code: "RELATION_TARGET_ARCHIVED" });
  }

  const allowMultiple = Boolean(config?.allowMultiple);

  return {
    config: { ...(config || {}), targetTableId: targetId, allowMultiple },
    relationTableId: targetId,
    relationPolicy: allowMultiple ? "multiple" : "single",
  };
}

export async function addColumn(tableId, payload, actor) {
  const table = await getTable(tableId, { includeColumns: false });
  const resolvedTableId = table.id;

  /*
   * System tables carry the columns another service depends on — the accounts
   * table above all — so their shape is fixed here rather than left to whatever
   * the browser sends. For system_users, custom non-system columns are permitted.
   */
  if (table.isSystem && table.storageKind !== "system_users") {
    throw conflict("Columns of a system table cannot be added.", {
      code: "SYSTEM_TABLE_LOCKED",
    });
  }

  if (table.status !== "active") {
    throw conflict("This table is archived and cannot accept new columns.", {
      code: "TABLE_ARCHIVED",
    });
  }

  const dataType = assertDataType(payload.dataType);

  const key = assertValidKey(
    payload.key || slugifyKey(payload.label),
    "column key"
  );

  assertKeyNotReserved(key, "Column key");

  if (await findColumnByKey(resolvedTableId, key)) {
    throw conflict(`This table already has a column with key "${key}".`, {
      code: "COLUMN_KEY_TAKEN",
    });
  }

  let config = normalizeTypeConfig(dataType.key, payload.config);

  let relationTableId = null;
  let relationPolicy = null;

  if (dataType.key === "record_reference") {
    const relation = await resolveRelation({
      tableId: resolvedTableId,
      dataType: dataType.key,
      config: { ...config, targetTableId: payload.relationTableId ?? config.targetTableId },
      relationTableId: payload.relationTableId,
    });

    config = normalizeTypeConfig(dataType.key, relation.config);
    relationTableId = relation.relationTableId;
    relationPolicy = relation.relationPolicy;
  } else if (payload.relationTableId) {
    throw badRequest("Only a record reference column can point at another table.", {
      code: "RELATION_TYPE_MISMATCH",
    });
  }

  if (dataType.key === "dropdown") {
    /*
     * normalizeTypeConfig already requires dropdownId; the option set itself is
     * verified so a column cannot be created against a missing definition.
     */
    const dropdown = await findDropdownById(config.dropdownId);

    if (!dropdown || dropdown.status !== "active") {
      throw badRequest("The selected option set is missing or archived.", {
        code: "DROPDOWN_UNAVAILABLE",
      });
    }
  }

  const columnId = await withTransaction(async (connection) => {
    const sortOrder = await nextColumnSortOrder(connection, resolvedTableId);

    const insertId = await insertColumn(connection, {
      tableId: resolvedTableId,
      key,
      label: payload.label,
      description: payload.description ?? null,
      dataType: dataType.key,
      config,
      isRequired: Boolean(payload.isRequired),
      isSearchable: payload.isSearchable !== false,
      isFilterable: payload.isFilterable !== false,
      isVisible: payload.isVisible !== false,
      sortOrder,
      relationTableId,
      relationPolicy,
    });

    await bumpSchemaVersion(connection, resolvedTableId);

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "table.column.create",
      entityType: "column",
      entityId: insertId,
      summary: { tableId: resolvedTableId, key, dataType: dataType.key, relationTableId },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return insertId;
  });

  return findColumnById(columnId);
}

async function assertColumnEditable(tableId, columnId) {
  const table = await getTable(tableId, { includeColumns: false });
  const column = await findColumnById(columnId);

  if (!column || Number(column.tableId) !== Number(table.id)) {
    throw notFound("Column not found.", { code: "COLUMN_NOT_FOUND" });
  }

  /*
   * System columns mirror authentication or audit data owned by the platform.
   * Letting the generic builder alter them would be how a configuration screen
   * breaks login, so they are rejected outright rather than partially guarded.
   */
  if (column.isSystem) {
    throw conflict("This column is managed by the system and cannot be changed.", {
      code: "SYSTEM_COLUMN_LOCKED",
    });
  }

  return column;
}

export async function updateColumnDefinition(tableId, columnId, patch, actor) {
  const column = await assertColumnEditable(tableId, columnId);

  const nextDataType = patch.dataType || column.dataType;

  if (patch.dataType && patch.dataType !== column.dataType) {
    assertDataType(patch.dataType);

    const table = await getTable(tableId, { includeColumns: false });
    const recordCount =
      table.storageKind === "system_users"
        ? await countProfileValuesForColumn(columnId)
        : await countRecordsForTable(tableId);

    if (recordCount > 0) {
      throw conflict(
        `This table already holds ${recordCount} record(s), so the column type cannot change.`,
        { code: "COLUMN_TYPE_LOCKED" }
      );
    }
  }

  let nextConfig =
    patch.config !== undefined || patch.dataType
      ? normalizeTypeConfig(nextDataType, patch.config ?? column.config)
      : column.config;

  let nextRelationTableId = column.relationTableId;
  let nextRelationPolicy = column.relationPolicy;

  if (nextDataType === "record_reference") {
    const relation = await resolveRelation({
      tableId,
      dataType: nextDataType,
      config: nextConfig,
      relationTableId:
        patch.relationTableId !== undefined ? patch.relationTableId : column.relationTableId,
    });

    nextConfig = normalizeTypeConfig(nextDataType, relation.config);
    nextRelationTableId = relation.relationTableId;
    nextRelationPolicy = relation.relationPolicy;
  } else if (patch.relationTableId != null) {
    throw badRequest("Only a record reference column can point at another table.", {
      code: "RELATION_TYPE_MISMATCH",
    });
  } else {
    nextRelationTableId = null;
    nextRelationPolicy = null;
  }

  await withTransaction(async (connection) => {
    const didUpdate = await updateColumn(connection, columnId, {
      ...patch,
      config: patch.config !== undefined || patch.dataType ? nextConfig : undefined,
      relationTableId: nextRelationTableId,
      relationPolicy: nextRelationPolicy,
    });

    if (didUpdate) {
      await bumpSchemaVersion(connection, tableId);

      await recordAudit({
        connection,
        actorUserId: actor?.userId ?? null,
        action: patch.status === "archived" ? "table.column.archive" : "table.column.update",
        entityType: "column",
        entityId: columnId,
        summary: { tableId, changedKeys: Object.keys(patch) },
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
      });
    }
  });

  return findColumnById(columnId);
}

export async function archiveColumn(tableId, columnId, actor) {
  const column = await assertColumnEditable(tableId, columnId);

  if (column.status === "archived") {
    return column;
  }

  return updateColumnDefinition(tableId, columnId, { status: "archived" }, actor);
}

export async function reorderTableColumns(tableId, columnIds, actor) {
  const table = await getTable(tableId, { includeColumns: false });
  const resolvedTableId = table.id;
  const columns = await findColumnsByTableId(resolvedTableId, { includeArchived: false });

  /*
   * System columns keep their migration-defined position; only user-managed
   * columns are reordered, and every one of them must appear exactly once.
   */
  const manageable = columns.filter((column) => !column.isSystem);
  const manageableIds = new Set(manageable.map((column) => Number(column.id)));

  const unknown = columnIds.filter((id) => !manageableIds.has(Number(id)));

  if (unknown.length > 0) {
    throw badRequest("Some columns do not belong to this table or are system managed.", {
      code: "COLUMN_MISMATCH",
    });
  }

  if (columnIds.length !== manageable.length) {
    throw badRequest("The new order must include every editable column exactly once.", {
      code: "INCOMPLETE_COLUMN_ORDER",
    });
  }

  await withTransaction(async (connection) => {
    await applyColumnOrder(connection, resolvedTableId, columnIds.map(Number));

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "table.column.reorder",
      entityType: "table",
      entityId: resolvedTableId,
      summary: { columnCount: columnIds.length },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return findColumnsByTableId(resolvedTableId);
}

export async function getTableUsage(tableId) {
  const table = await getTable(tableId, { includeColumns: false });

  const recordCountPromise =
    table.storageKind === "system_users"
      ? countUsersForTable()
      : countRecordsForTable(tableId);

  const [mappingCount, recordCount, relationCount, entityConfigCount] = await Promise.all([
    countMappingsForTable(tableId),
    recordCountPromise,
    countColumnsUsingRelation(tableId),
    countEntityConfigurationsForTable(tableId),
  ]);

  return { mappingCount, recordCount, relationCount, entityConfigCount };
}
