import { badRequest, conflict, notFound } from "../../lib/appError.js";
import { withTransaction } from "../../lib/transactions.js";
import { coerceValue, STORAGE_FAMILIES } from "../../lib/dataTypes.js";
import { buildOrderByClause, buildWhereClause } from "../../lib/recordQuery.js";
import { parsePagination, parseSearch, parseSort } from "../../lib/pagination.js";
import { recordAudit } from "../audit/audit.service.js";
import { getActiveTableWithColumns } from "../tables/table.service.js";
import { getActiveMappingWithEntries } from "../mappings/mapping.service.js";
import { findOptionByValue } from "../dropdowns/dropdown.repository.js";
import {
  SYSTEM_SORT_KEYS,
  archiveRecordById,
  buildRecordDescriptors,
  countActiveRecordsInTable,
  countRecords,
  findActiveOrganizationEntity,
  findFacetValues,
  findRecordById,
  findRecords,
  insertRecord,
  updateRecordValues,
} from "./record.repository.js";

const DEFAULT_SORT = [{ key: "createdAt", direction: "desc" }];

const FACET_STORAGES = new Set([
  STORAGE_FAMILIES.STRING,
  STORAGE_FAMILIES.NUMBER,
  STORAGE_FAMILIES.DATE,
]);

/*
 * Records are only served for administrator-defined tables. The seeded `users`
 * table is exposed to the table builder for visibility, but its rows belong to
 * the auth/user service: a generic record write there could alter login data.
 */
async function assertRecordTable(tableId) {
  const table = await getActiveTableWithColumns(tableId);

  if (table.storageKind !== "managed") {
    throw conflict("Records for this table are managed by a dedicated service.", {
      code: "SYSTEM_TABLE_READONLY",
    });
  }

  return table;
}

function editableColumnsByKey(table) {
  const columns = new Map();

  for (const column of table.columns) {
    if (column.isSystem) continue;

    columns.set(column.key, column);
  }

  return columns;
}

function fieldError(errors, key, message) {
  if (!errors[key]) errors[key] = [];

  errors[key].push(message);
}

/*
 * Shape and range rules are enforced by the data type registry; the flags it
 * returns mark the values that still need a database lookup (option membership
 * and relation targets) so those run in one pass after the cheap checks.
 *
 * `keyAliases` maps a stored column key back to the key the caller submitted,
 * which is how a mapped form submission reports errors against the field names
 * the user actually saw.
 */
function validateValues({ columnsByKey, values, mode, keyAliases }) {
  const errors = {};
  const data = {};
  const checks = [];

  const reportKey = (key) => keyAliases?.get(key) ?? key;

  for (const [key, value] of Object.entries(values)) {
    const column = columnsByKey.get(key);

    if (!column) {
      fieldError(errors, key, "This column does not exist on the table.");
      continue;
    }

    const required = column.isRequired && mode === "create";

    const result = coerceValue({
      typeKey: column.dataType,
      config: column.config,
      value,
      required,
      label: column.label,
    });

    if (!result.ok) {
      fieldError(errors, reportKey(key), result.message);
      continue;
    }

    if (mode === "update" && column.isRequired && result.value === null) {
      fieldError(errors, reportKey(key), `${column.label} is required and cannot be cleared.`);
      continue;
    }

    data[key] = result.value;

    if (result.requiresMembershipCheck) {
      checks.push({
        kind: "dropdown",
        key: reportKey(key),
        label: column.label,
        dropdownId: column.config?.dropdownId ?? null,
        value: result.value,
      });
    }

    if (result.requiresReferenceCheck) {
      checks.push({
        kind: "reference",
        key: reportKey(key),
        label: column.label,
        targetTableId: column.relationTableId ?? column.config?.targetTableId ?? null,
        value: result.value,
      });
    }
  }

  if (mode === "create") {
    for (const column of columnsByKey.values()) {
      if (!column.isRequired) continue;

      if (!Object.prototype.hasOwnProperty.call(values, column.key)) {
        fieldError(errors, reportKey(column.key), `${column.label} is required.`);
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest("Some record values are invalid.", {
      code: "INVALID_RECORD_VALUES",
      errors,
    });
  }

  return { data, checks };
}

/*
 * A mapped submission is keyed by form field because that is what the renderer
 * shows. The mapping resolves each field onto the column that stores it, and the
 * value is then validated against the column definition, so storage stays
 * authoritative even where the form overrode the label or the required flag.
 *
 * A submitted field with no mapping entry is rejected rather than dropped: the
 * value has nowhere to go, and silently discarding it would look like a saved
 * form that quietly lost data.
 */
async function resolveMappedValues(formId, tableId, values, table) {
  const mapping = await getActiveMappingWithEntries(formId, tableId);

  const entriesByFieldKey = new Map(
    mapping.entries.map((entry) => [entry.field.key, entry])
  );

  const columnsByKey = new Map();
  const keyAliases = new Map();
  const translated = {};
  const errors = {};

  for (const [fieldKey, value] of Object.entries(values)) {
    const entry = entriesByFieldKey.get(fieldKey);

    if (!entry) {
      fieldError(errors, fieldKey, "This field is not mapped to a column on the target table.");
      continue;
    }

    const columnKey = entry.column.key;

    translated[columnKey] = value;
    keyAliases.set(columnKey, fieldKey);

    columnsByKey.set(columnKey, {
      ...entry.column,
      label: entry.field.label || entry.column.label,
      isRequired: Boolean(entry.column.isRequired || entry.field.isRequired),
    });
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest("Some submitted fields are not mapped.", {
      code: "FIELD_NOT_MAPPED",
      errors,
    });
  }

  const warnings = table.columns
    .filter(
      (column) =>
        column.isRequired && !column.isSystem && !columnsByKey.has(column.key)
    )
    .map(
      (column) =>
        `"${column.label}" is required on the table but is not mapped from this form.`
    );

  return { columnsByKey, keyAliases, values: translated, warnings, mapping };
}

async function runIntegrityChecks(checks) {
  const errors = {};

  for (const check of checks) {
    if (check.kind === "dropdown") {
      if (!check.dropdownId) {
        fieldError(errors, check.key, `${check.label} is not configured with an option set.`);
        continue;
      }

      const option = await findOptionByValue(check.dropdownId, check.value);

      if (!option || !option.isActive) {
        fieldError(errors, check.key, `${check.label} has an unavailable option selected.`);
      }

      continue;
    }

    if (!check.targetTableId) {
      fieldError(errors, check.key, `${check.label} is not configured with a target table.`);
      continue;
    }

    const ids = Array.isArray(check.value) ? check.value : [check.value];
    const found = await countActiveRecordsInTable(check.targetTableId, ids);

    if (found !== ids.length) {
      fieldError(errors, check.key, `${check.label} points at a record that does not exist.`);
    }
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest("Some record values reference unavailable data.", {
      code: "INVALID_RECORD_REFERENCE",
      errors,
    });
  }
}

async function resolveOrganizationEntity(organizationEntityId) {
  if (organizationEntityId === undefined) return undefined;

  if (organizationEntityId === null) return null;

  const entity = await findActiveOrganizationEntity(organizationEntityId);

  if (!entity) {
    throw badRequest("The selected organization entity does not exist or is archived.", {
      code: "ORGANIZATION_ENTITY_INVALID",
    });
  }

  return entity.id;
}

export async function listRecords(tableId, query) {
  const table = await assertRecordTable(tableId);

  const descriptors = buildRecordDescriptors(table.columns);
  const resolveColumn = (key) => descriptors.get(key) ?? null;

  const searchable = table.columns
    .filter((column) => !column.isSystem && column.isSearchable)
    .map((column) => descriptors.get(column.key))
    .filter((descriptor) => descriptor && descriptor.storage === STORAGE_FAMILIES.STRING);

  const allowedSortKeys = [
    ...table.columns.filter((column) => !column.isSystem).map((column) => column.key),
    ...SYSTEM_SORT_KEYS,
  ];

  /*
   * Pagination and sorting are resolved here rather than in the controller
   * because the sort allow-list comes from the live column definitions.
   */
  const pagination = parsePagination(query);
  const search = parseSearch(query);
  const sortTerms = parseSort(query, allowedSortKeys, DEFAULT_SORT);

  const conditions = ["r.table_id = ?", "r.status = ?"];
  const baseParams = [tableId, query.status || "active"];

  if (query.organizationEntityId) {
    conditions.push("r.organization_entity_id = ?");
    baseParams.push(query.organizationEntityId);
  }

  const where = buildWhereClause({
    filters: query.filters ?? [],
    search,
    descriptors: searchable,
    resolveColumn,
    base: { sql: conditions.join(" AND "), params: baseParams },
  });

  const orderBy = buildOrderByClause({
    sortTerms,
    resolveColumn,
    fallbackSql: "r.id DESC",
  });

  const [records, total] = await Promise.all([
    findRecords({
      where,
      orderBy,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    countRecords({ where }),
  ]);

  return { table, records, total, pagination };
}

export async function getRecord(tableId, recordId) {
  const record = await findRecordById(tableId, recordId);

  if (!record) {
    throw notFound("Record not found.", { code: "RECORD_NOT_FOUND" });
  }

  return record;
}

/*
 * Validation and the write are kept apart so a caller that already owns a
 * transaction (the organization module creating an entity plus its profile
 * record) can run the write inside it. All reads stay on the pool, matching the
 * rest of the service; only the committed-state reads a caller performs itself.
 */
async function prepareCreate(tableId, payload, options = {}) {
  const table = await assertRecordTable(tableId);

  let columnsByKey = editableColumnsByKey(table);
  let keyAliases = null;
  let values = payload.values;
  let warnings = [];

  if (payload.formId) {
    const mapped = await resolveMappedValues(payload.formId, tableId, payload.values, table);

    columnsByKey = mapped.columnsByKey;
    keyAliases = mapped.keyAliases;
    values = mapped.values;
    warnings = mapped.warnings;
  }

  const { data, checks } = validateValues({
    columnsByKey,
    values,
    mode: "create",
    keyAliases,
  });

  await runIntegrityChecks(checks);

  /*
   * An entity created in the same transaction is not yet visible to a pooled
   * read, so the caller passes the identifier it already resolved.
   */
  const organizationEntityId = options.entityResolved
    ? options.organizationEntityId ?? null
    : await resolveOrganizationEntity(payload.organizationEntityId);

  return { table, data, organizationEntityId, warnings, formId: payload.formId ?? null };
}

async function writeCreate(connection, tableId, prepared, actor) {
  const recordId = await insertRecord(connection, {
    tableId,
    schemaVersion: prepared.table.schemaVersion,
    data: prepared.data,
    organizationEntityId: prepared.organizationEntityId,
    actorUserId: actor?.userId ?? null,
  });

  await recordAudit({
    connection,
    actorUserId: actor?.userId ?? null,
    action: "record.create",
    entityType: "record",
    entityId: recordId,
    summary: {
      tableId,
      schemaVersion: prepared.table.schemaVersion,
      valueKeys: Object.keys(prepared.data),
      formId: prepared.formId,
    },
    ipAddress: actor?.ipAddress ?? null,
    userAgent: actor?.userAgent ?? null,
  });

  return recordId;
}

export async function createRecord(tableId, payload, actor) {
  const prepared = await prepareCreate(tableId, payload);

  const recordId = await withTransaction((connection) =>
    writeCreate(connection, tableId, prepared, actor)
  );

  const record = await getRecord(tableId, recordId);

  return { ...record, warnings: prepared.warnings };
}

export async function createRecordInTransaction(connection, tableId, payload, actor, options) {
  const prepared = await prepareCreate(tableId, payload, options);

  const recordId = await writeCreate(connection, tableId, prepared, actor);

  return { recordId, warnings: prepared.warnings };
}

async function prepareUpdate(tableId, recordId, payload) {
  const table = await assertRecordTable(tableId);
  const existing = await getRecord(tableId, recordId);

  if (existing.status !== "active") {
    throw conflict("This record is archived and cannot be changed.", {
      code: "RECORD_ARCHIVED",
    });
  }

  let columnsByKey = editableColumnsByKey(table);
  let keyAliases = null;
  let values = payload.values;
  let warnings = [];

  if (payload.formId) {
    const mapped = await resolveMappedValues(payload.formId, tableId, payload.values, table);

    columnsByKey = mapped.columnsByKey;
    keyAliases = mapped.keyAliases;
    values = mapped.values;
    warnings = mapped.warnings;
  }

  const { data: patch, checks } = validateValues({
    columnsByKey,
    values,
    mode: "update",
    keyAliases,
  });

  await runIntegrityChecks(checks);

  const organizationEntityId = await resolveOrganizationEntity(payload.organizationEntityId);

  /*
   * Values written under an older definition are preserved as stored. Only the
   * submitted keys are re-validated, so archiving a column later cannot make an
   * unrelated edit fail, and the row is stamped with the version it now matches.
   */
  return {
    table,
    merged: { ...existing.values, ...patch },
    changedKeys: Object.keys(patch),
    organizationEntityId,
    warnings,
    formId: payload.formId ?? null,
  };
}

async function writeUpdate(connection, tableId, recordId, prepared, actor) {
  await updateRecordValues(connection, recordId, {
    data: prepared.merged,
    schemaVersion: prepared.table.schemaVersion,
    organizationEntityId: prepared.organizationEntityId,
    actorUserId: actor?.userId ?? null,
  });

  await recordAudit({
    connection,
    actorUserId: actor?.userId ?? null,
    action: "record.update",
    entityType: "record",
    entityId: recordId,
    summary: { tableId, changedKeys: prepared.changedKeys, formId: prepared.formId },
    ipAddress: actor?.ipAddress ?? null,
    userAgent: actor?.userAgent ?? null,
  });
}

export async function updateRecord(tableId, recordId, payload, actor) {
  const prepared = await prepareUpdate(tableId, recordId, payload);

  await withTransaction((connection) =>
    writeUpdate(connection, tableId, recordId, prepared, actor)
  );

  const record = await getRecord(tableId, recordId);

  return { ...record, warnings: prepared.warnings };
}

export async function updateRecordInTransaction(
  connection,
  tableId,
  recordId,
  payload,
  actor
) {
  const prepared = await prepareUpdate(tableId, recordId, payload);

  await writeUpdate(connection, tableId, recordId, prepared, actor);

  return { warnings: prepared.warnings };
}

/*
 * Deletion is an archive. Records are referenced by organization entities and
 * by relation columns in other tables, so rows are never removed outright.
 */
export async function archiveRecord(tableId, recordId, actor) {
  const existing = await getRecord(tableId, recordId);

  /*
   * A second archive is refused rather than silently accepted: the row is
   * already out of the active list, so answering 200 would tell the caller
   * something changed when nothing did.
   */
  if (existing.status === "archived") {
    throw conflict("This record is already archived.", { code: "RECORD_ARCHIVED" });
  }

  await withTransaction(async (connection) => {
    const archived = await archiveRecordById(connection, recordId, actor?.userId ?? null);

    if (!archived) {
      throw conflict("This record has already been archived.", { code: "RECORD_ARCHIVED" });
    }

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "record.archive",
      entityType: "record",
      entityId: recordId,
      summary: { tableId },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return getRecord(tableId, recordId);
}

export async function listFacetValues(tableId, query) {
  const table = await assertRecordTable(tableId);

  const column = table.columns.find(
    (entry) => entry.key === query.column && !entry.isSystem
  );

  if (!column) {
    throw badRequest(`"${query.column}" cannot be used for filtering or sorting.`, {
      code: "INVALID_COLUMN",
    });
  }

  if (!column.isFilterable) {
    throw badRequest(`"${query.column}" is not filterable.`, { code: "COLUMN_NOT_FILTERABLE" });
  }

  const descriptors = buildRecordDescriptors([column]);
  const descriptor = descriptors.get(column.key);

  if (!descriptor || !FACET_STORAGES.has(descriptor.storage)) {
    throw badRequest(`"${query.column}" does not support distinct value lookups.`, {
      code: "FACET_UNSUPPORTED",
    });
  }

  const pagination = parsePagination(query);
  const search = parseSearch(query);

  const { values, total } = await findFacetValues({
    descriptor,
    tableId,
    search,
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return { values, total, pagination };
}
