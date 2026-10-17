import { badRequest, conflict, notFound } from "../../lib/appError.js";
import { withTransaction } from "../../lib/transactions.js";
import { isMappingCompatible } from "../../lib/dataTypes.js";
import { recordAudit } from "../audit/audit.service.js";
import { getForm } from "../forms/form.service.js";
import { findFormFieldsByFormId } from "../forms/form.repository.js";
import { getTable } from "../tables/table.service.js";
import { findColumnsByTableId } from "../tables/table.repository.js";
import {
  findMappings,
  countMappings,
  findMappingById,
  findMappingByFormAndTable,
  findEntriesByMappingId,
  insertMapping,
  updateMappingMeta,
  deleteMappingById,
  replaceMappingEntries,
  countEntityConfigurationsForMapping,
} from "./mapping.repository.js";

/*
 * The users table is authentication-owned. Only these three columns may receive
 * values from a configured form; identity, status, timestamps and credentials
 * stay under explicit server control in the users module.
 */
const USER_SAFE_SYSTEM_COLUMNS = new Set(["email", "first_name", "last_name"]);

export function isColumnMappable(column, table) {
  if (column.status !== "active") return false;

  if (!column.isSystem) return true;

  return (
    table.storageKind === "system_users" && USER_SAFE_SYSTEM_COLUMNS.has(column.key)
  );
}

export async function listMappings(query) {
  const [mappings, total] = await Promise.all([
    findMappings(query),
    countMappings(query),
  ]);

  return { mappings, total };
}

export async function getMapping(mappingId, { includeEntries = true } = {}) {
  const mapping = await findMappingById(mappingId);

  if (!mapping) {
    throw notFound("Mapping not found.", { code: "MAPPING_NOT_FOUND" });
  }

  if (!includeEntries) return mapping;

  const entries = await findEntriesByMappingId(mappingId);

  return { ...mapping, entries };
}

/*
 * Used at submission time. A mapping whose form, table or entries have since
 * been archived is refused here rather than producing partially stored values.
 */
export async function getActiveMappingWithEntries(formId, tableId) {
  const mapping = await findMappingByFormAndTable(formId, tableId);

  if (!mapping) {
    throw notFound("No mapping exists between this form and table.", {
      code: "MAPPING_NOT_FOUND",
    });
  }

  if (mapping.status !== "active") {
    throw conflict("This mapping is archived.", { code: "MAPPING_ARCHIVED" });
  }

  if (mapping.form.status !== "active" || mapping.table.status !== "active") {
    throw conflict("The mapped form or table is no longer active.", {
      code: "MAPPING_DEFINITION_INACTIVE",
    });
  }

  const entries = await findEntriesByMappingId(mapping.id);

  const stale = entries.filter(
    (entry) =>
      entry.field.status !== "active" ||
      entry.column.status !== "active" ||
      !isColumnMappable(entry.column, mapping.table)
  );

  if (stale.length > 0) {
    throw conflict(
      "This mapping references definitions that are no longer usable. Ask an administrator to review it.",
      { code: "MAPPING_STALE" }
    );
  }

  return { ...mapping, entries };
}

async function loadMappingContext(formId, tableId) {
  const form = await getForm(formId, { includeFields: false });
  const table = await getTable(tableId, { includeColumns: false });

  if (form.status !== "active") {
    throw conflict("An archived form cannot be mapped.", { code: "FORM_ARCHIVED" });
  }

  if (table.status !== "active") {
    throw conflict("An archived table cannot be mapped.", { code: "TABLE_ARCHIVED" });
  }

  const [formFields, columns] = await Promise.all([
    findFormFieldsByFormId(formId),
    findColumnsByTableId(tableId, { includeArchived: false }),
  ]);

  return { form, table, formFields, columns };
}

/*
 * Feeds the connector overlay: both sides plus an explicit compatibility
 * verdict for every pair, so the UI can enable or refuse a connection and
 * explain why without re-implementing the rules.
 */
export async function getMappingCompatibility(formId, tableId) {
  const { form, table, formFields, columns } = await loadMappingContext(formId, tableId);

  const mappableColumns = columns.filter((column) => isColumnMappable(column, table));
  const existing = await findMappingByFormAndTable(formId, tableId);
  const existingEntries = existing ? await findEntriesByMappingId(existing.id) : [];

  const compatibility = formFields.map((formField) => ({
    formFieldId: formField.formFieldId,
    fieldId: formField.fieldId,
    key: formField.key,
    label: formField.label,
    dataType: formField.dataType,
    isRequired: formField.isRequired,
    columns: mappableColumns.map((column) => {
      const verdict = isMappingCompatible(
        { type: formField.dataType, config: formField.config },
        { type: column.dataType, config: column.config }
      );

      return {
        columnId: column.id,
        compatible: verdict.compatible,
        reason: verdict.reason,
      };
    }),
  }));

  const unmappableColumns = columns
    .filter((column) => !isColumnMappable(column, table))
    .map((column) => ({
      columnId: column.id,
      key: column.key,
      label: column.label,
      reason: column.isSystem
        ? "System columns are managed by the application and cannot receive form values."
        : "This column is archived.",
    }));

  return {
    form: { id: form.id, key: form.key, label: form.label },
    table: {
      id: table.id,
      key: table.key,
      label: table.label,
      storageKind: table.storageKind,
      isSystem: table.isSystem,
    },
    formFields,
    columns: columns.map((column) => ({
      ...column,
      mappable: isColumnMappable(column, table),
    })),
    compatibility,
    unmappableColumns,
    mappingId: existing?.id ?? null,
    entries: existingEntries.map((entry) => ({
      formFieldId: entry.formFieldId,
      columnId: entry.columnId,
    })),
  };
}

async function validateEntries({ formFields, columns, table, entries }) {
  const fieldsById = new Map(formFields.map((field) => [Number(field.formFieldId), field]));
  const columnsById = new Map(columns.map((column) => [Number(column.id), column]));

  const seenFields = new Set();
  const seenColumns = new Set();
  const errors = [];
  const resolved = [];

  for (const entry of entries) {
    const formField = fieldsById.get(Number(entry.formFieldId));
    const column = columnsById.get(Number(entry.columnId));

    if (!formField) {
      errors.push(`Form field ${entry.formFieldId} is not part of this form.`);
      continue;
    }

    if (!column) {
      errors.push(`Column ${entry.columnId} is not part of this table.`);
      continue;
    }

    if (seenFields.has(Number(entry.formFieldId))) {
      errors.push(`"${formField.label}" is mapped more than once.`);
      continue;
    }

    if (seenColumns.has(Number(entry.columnId))) {
      errors.push(`"${column.label}" receives from more than one field.`);
      continue;
    }

    if (!isColumnMappable(column, table)) {
      errors.push(`"${column.label}" cannot receive form values.`);
      continue;
    }

    const verdict = isMappingCompatible(
      { type: formField.dataType, config: formField.config },
      { type: column.dataType, config: column.config }
    );

    if (!verdict.compatible) {
      errors.push(`"${formField.label}" → "${column.label}": ${verdict.reason}`);
      continue;
    }

    seenFields.add(Number(entry.formFieldId));
    seenColumns.add(Number(entry.columnId));

    resolved.push({
      formFieldId: Number(entry.formFieldId),
      columnId: Number(entry.columnId),
      column,
      formField,
    });
  }

  if (errors.length > 0) {
    throw badRequest(errors[0], {
      code: "INVALID_MAPPING",
      details: { errors },
    });
  }

  /*
   * A required column with no source can never be satisfied by this form. It is
   * reported rather than blocked because the value may be supplied by the
   * caller (for example the organization entity a record belongs to).
   */
  const warnings = columns
    .filter(
      (column) =>
        column.isRequired &&
        !column.isSystem &&
        !seenColumns.has(Number(column.id))
    )
    .map((column) => `"${column.label}" is required but not mapped.`);

  return { resolved, warnings };
}

export async function saveMapping(payload, actor) {
  const { form, table, formFields, columns } = await loadMappingContext(
    payload.formId,
    payload.tableId
  );

  const { resolved, warnings } = await validateEntries({
    formFields,
    columns,
    table,
    entries: payload.entries,
  });

  const existing = await findMappingByFormAndTable(payload.formId, payload.tableId);

  const mappingId = await withTransaction(async (connection) => {
    let targetId = existing?.id;

    if (targetId) {
      await updateMappingMeta(
        connection,
        targetId,
        { label: payload.label ?? undefined, status: "active" },
        actor?.userId ?? null
      );
    } else {
      targetId = await insertMapping(connection, {
        formId: payload.formId,
        tableId: payload.tableId,
        label: payload.label ?? `${form.label} → ${table.label}`,
        actorUserId: actor?.userId ?? null,
      });
    }

    await replaceMappingEntries(
      connection,
      targetId,
      resolved.map((entry) => ({
        formFieldId: entry.formFieldId,
        columnId: entry.columnId,
      }))
    );

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: existing ? "mapping.update" : "mapping.create",
      entityType: "mapping",
      entityId: targetId,
      summary: {
        formId: payload.formId,
        tableId: payload.tableId,
        entryCount: resolved.length,
      },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return targetId;
  });

  const mapping = await getMapping(mappingId);

  return { ...mapping, warnings };
}

export async function updateMapping(mappingId, patch, actor) {
  const current = await getMapping(mappingId, { includeEntries: false });

  let warnings = [];

  if (patch.entries) {
    const { formFields, columns, table } = await loadMappingContext(
      current.formId,
      current.tableId
    );

    const validated = await validateEntries({
      formFields,
      columns,
      table,
      entries: patch.entries,
    });

    warnings = validated.warnings;

    await withTransaction(async (connection) => {
      await updateMappingMeta(
        connection,
        mappingId,
        { label: patch.label ?? undefined, status: patch.status },
        actor?.userId ?? null
      );

      await replaceMappingEntries(
        connection,
        mappingId,
        validated.resolved.map((entry) => ({
          formFieldId: entry.formFieldId,
          columnId: entry.columnId,
        }))
      );

      await recordAudit({
        connection,
        actorUserId: actor?.userId ?? null,
        action: "mapping.update",
        entityType: "mapping",
        entityId: mappingId,
        summary: { entryCount: validated.resolved.length },
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
      });
    });

    const mapping = await getMapping(mappingId);

    return { ...mapping, warnings };
  }

  await withTransaction(async (connection) => {
    await updateMappingMeta(
      connection,
      mappingId,
      { label: patch.label, status: patch.status },
      actor?.userId ?? null
    );

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "mapping.update",
      entityType: "mapping",
      entityId: mappingId,
      summary: { changedKeys: Object.keys(patch) },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return getMapping(mappingId);
}

export async function deleteMapping(mappingId, actor) {
  const current = await getMapping(mappingId, { includeEntries: false });

  const configCount = await countEntityConfigurationsForMapping(mappingId);

  if (configCount > 0) {
    throw conflict(
      `This mapping is used by ${configCount} organization section(s). Reconfigure those first.`,
      { code: "MAPPING_IN_USE" }
    );
  }

  await withTransaction(async (connection) => {
    await deleteMappingById(connection, mappingId);

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "mapping.delete",
      entityType: "mapping",
      entityId: mappingId,
      summary: { formId: current.formId, tableId: current.tableId },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return { deleted: true, mappingId };
}
