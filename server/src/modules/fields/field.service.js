import { conflict, notFound, badRequest } from "../../lib/appError.js";
import { withTransaction } from "../../lib/transactions.js";
import {
  assertValidKey,
  assertKeyNotReserved,
  slugifyKey,
} from "../../lib/identifiers.js";
import {
  assertDataType,
  normalizeTypeConfig,
  coerceValue,
} from "../../lib/dataTypes.js";
import { recordAudit } from "../audit/audit.service.js";
import { findDropdownById } from "../dropdowns/dropdown.repository.js";
import { findTableById } from "../tables/table.repository.js";
import {
  findFields,
  countFields,
  findFieldById,
  findFieldByKey,
  insertField,
  updateField,
  countFieldUsageInForms,
} from "./field.repository.js";

export async function listFields(query) {
  const [fields, total] = await Promise.all([
    findFields(query),
    countFields(query),
  ]);

  return { fields, total };
}

export async function getField(fieldId) {
  const field = await findFieldById(fieldId);

  if (!field) {
    throw notFound("Field not found.", { code: "FIELD_NOT_FOUND" });
  }

  return field;
}

/*
 * Type specific configuration can point at other definitions. Those targets are
 * verified here so a saved field can never reference a missing option set or
 * table, which would only fail later at submission time.
 */
async function assertConfigTargets(dataType, config) {
  if (dataType === "dropdown") {
    const dropdown = await findDropdownById(config.dropdownId);

    if (!dropdown) {
      throw badRequest("The selected option set does not exist.", {
        code: "DROPDOWN_NOT_FOUND",
      });
    }

    if (dropdown.status !== "active") {
      throw badRequest("The selected option set is archived.", {
        code: "DROPDOWN_ARCHIVED",
      });
    }
  }

  if (dataType === "record_reference") {
    const table = await findTableById(config.targetTableId);

    if (!table) {
      throw badRequest("The referenced table does not exist.", {
        code: "TARGET_TABLE_NOT_FOUND",
      });
    }

    if (table.status !== "active") {
      throw badRequest("The referenced table is archived.", {
        code: "TARGET_TABLE_ARCHIVED",
      });
    }
  }
}

function normalizeDefaultValue({ dataType, config, defaultValue, label }) {
  if (defaultValue === undefined || defaultValue === null || defaultValue === "") {
    return null;
  }

  const result = coerceValue({
    typeKey: dataType,
    config,
    value: defaultValue,
    required: false,
    label,
  });

  if (!result.ok) {
    throw badRequest(result.message, { code: "INVALID_DEFAULT_VALUE" });
  }

  return result.value;
}

export async function createField(payload, actor) {
  const dataType = assertDataType(payload.dataType);

  const key = assertValidKey(
    payload.key || slugifyKey(payload.label),
    "field key"
  );

  assertKeyNotReserved(key, "Field key");

  const existing = await findFieldByKey(key);

  if (existing) {
    throw conflict(`A field with key "${key}" already exists.`, {
      code: "FIELD_KEY_TAKEN",
    });
  }

  const config = normalizeTypeConfig(dataType.key, payload.config);

  await assertConfigTargets(dataType.key, config);

  const defaultValue = normalizeDefaultValue({
    dataType: dataType.key,
    config,
    defaultValue: payload.defaultValue,
    label: payload.label,
  });

  /*
   * A required field with no default is the normal case: the value has to come
   * from the person filling the form. Requiring a default here would prefill the
   * answer the requirement exists to ask for.
   */

  const fieldId = await withTransaction(async (connection) => {
    const insertId = await insertField(connection, {
      key,
      label: payload.label,
      description: payload.description ?? null,
      dataType: dataType.key,
      config,
      isRequired: Boolean(payload.isRequired),
      defaultValue,
      helpText: payload.helpText ?? null,
      actorUserId: actor?.userId ?? null,
    });

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "field.create",
      entityType: "field",
      entityId: insertId,
      summary: { key, label: payload.label, dataType: dataType.key },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return insertId;
  });

  return getField(fieldId);
}

export async function updateFieldDefinition(fieldId, patch, actor) {
  const current = await getField(fieldId);

  const nextDataType = patch.dataType || current.dataType;
  const usageCount = await countFieldUsageInForms(fieldId);

  /*
   * A type change would silently reinterpret values already stored for this
   * field, so it is only permitted while no form uses the definition.
   */
  if (patch.dataType && patch.dataType !== current.dataType) {
    assertDataType(patch.dataType);

    if (usageCount > 0) {
      throw conflict(
        `This field is used by ${usageCount} form(s). Remove it from those forms before changing its type.`,
        { code: "FIELD_TYPE_LOCKED" }
      );
    }
  }

  const nextConfig =
    patch.config !== undefined || patch.dataType
      ? normalizeTypeConfig(nextDataType, patch.config ?? current.config)
      : current.config;

  if (patch.config !== undefined || patch.dataType) {
    await assertConfigTargets(nextDataType, nextConfig);
  }

  const nextRequired =
    patch.isRequired !== undefined ? patch.isRequired : current.isRequired;

  const nextLabel = patch.label !== undefined ? patch.label : current.label;

  const nextDefault =
    patch.defaultValue !== undefined
      ? normalizeDefaultValue({
          dataType: nextDataType,
          config: nextConfig,
          defaultValue: patch.defaultValue,
          required: nextRequired,
          label: nextLabel,
        })
      : current.defaultValue;

  const changed = await withTransaction(async (connection) => {
    const didUpdate = await updateField(
      connection,
      fieldId,
      {
        label: patch.label,
        description: patch.description,
        dataType: patch.dataType,
        config: patch.config !== undefined || patch.dataType ? nextConfig : undefined,
        isRequired: patch.isRequired,
        defaultValue: patch.defaultValue !== undefined ? nextDefault : undefined,
        helpText: patch.helpText,
        status: patch.status,
      },
      actor?.userId ?? null
    );

    if (didUpdate) {
      await recordAudit({
        connection,
        actorUserId: actor?.userId ?? null,
        action: patch.status === "archived" ? "field.archive" : "field.update",
        entityType: "field",
        entityId: fieldId,
        summary: {
          changedKeys: Object.keys(patch),
          dataTypeChanged: Boolean(patch.dataType && patch.dataType !== current.dataType),
        },
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
      });
    }

    return didUpdate;
  });

  if (!changed) {
    throw badRequest("No changes were supplied.", { code: "NO_CHANGES" });
  }

  return getField(fieldId);
}

/*
 * Archiving is the only removal path. Fields referenced by forms keep rendering
 * historical data, and the definition can be reactivated, so no user-entered
 * value is ever destroyed by an administration action.
 */
export async function archiveField(fieldId, actor) {
  const current = await getField(fieldId);

  if (current.status === "archived") {
    return current;
  }

  return updateFieldDefinition(fieldId, { status: "archived" }, actor);
}

export async function getFieldUsage(fieldId) {
  await getField(fieldId);

  const formCount = await countFieldUsageInForms(fieldId);

  return { formCount };
}
