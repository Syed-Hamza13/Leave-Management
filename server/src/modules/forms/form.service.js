import { badRequest, conflict, notFound } from "../../lib/appError.js";
import { withTransaction } from "../../lib/transactions.js";
import {
  assertValidKey,
  assertKeyNotReserved,
  slugifyKey,
} from "../../lib/identifiers.js";
import { normalizeTypeConfig } from "../../lib/dataTypes.js";
import { recordAudit } from "../audit/audit.service.js";
import { findFieldsByIds } from "../fields/field.repository.js";
import {
  findForms,
  countForms,
  findFormById,
  findFormByKey,
  findAllActiveForms,
  insertForm,
  updateForm,
  findFormFieldsByFormId,
  replaceFormFields,
  countMappingsForForm,
  countEntityConfigurationsForForm,
} from "./form.repository.js";

export async function listForms(query) {
  const [forms, total] = await Promise.all([findForms(query), countForms(query)]);

  return { forms, total };
}

export async function listActiveFormSummaries() {
  const forms = await findAllActiveForms();

  return forms.map((form) => ({
    id: form.id,
    key: form.key,
    label: form.label,
    fieldCount: form.fieldCount,
    mappingCount: form.mappingCount,
  }));
}

export async function getForm(formId, { includeFields = true } = {}) {
  const form = await findFormById(formId);

  if (!form) {
    throw notFound("Form not found.", { code: "FORM_NOT_FOUND" });
  }

  if (!includeFields) return form;

  const fields = await findFormFieldsByFormId(formId);

  return { ...form, fields };
}

/*
 * Same shape as getForm but refuses archived forms and drops archived field
 * definitions. This is the entry point used when a user is about to submit, so
 * a stale or withdrawn definition can never reach the renderer.
 */
export async function getRenderableForm(formId) {
  const form = await getForm(formId, { includeFields: false });

  if (form.status !== "active") {
    throw conflict("This form is archived.", { code: "FORM_ARCHIVED" });
  }

  const fields = await findFormFieldsByFormId(formId);
  const usableFields = fields.filter((field) => field.fieldStatus === "active");

  return { ...form, fields: usableFields };
}

async function resolveFieldEntries(entries) {
  if (!entries || entries.length === 0) return [];

  const seen = new Set();

  for (const entry of entries) {
    if (seen.has(Number(entry.fieldId))) {
      throw conflict("The same field cannot be added to a form twice.", {
        code: "DUPLICATE_FORM_FIELD",
      });
    }

    seen.add(Number(entry.fieldId));
  }

  const definitions = await findFieldsByIds([...seen]);
  const byId = new Map(definitions.map((definition) => [Number(definition.id), definition]));

  const missing = entries
    .map((entry) => Number(entry.fieldId))
    .filter((id) => !byId.has(id));

  if (missing.length > 0) {
    throw badRequest(`Unknown field id(s): ${missing.join(", ")}.`, {
      code: "FIELD_NOT_FOUND",
    });
  }

  return entries.map((entry) => {
    const definition = byId.get(Number(entry.fieldId));

    if (definition.status !== "active") {
      throw conflict(`"${definition.label}" is archived and cannot be added to a form.`, {
        code: "FIELD_ARCHIVED",
      });
    }

    /*
     * An override is merged onto the shared definition and revalidated as a
     * whole, so a per-form tweak can never produce a configuration the type
     * does not support. Only the keys the admin actually changed are persisted,
     * which keeps later edits to the shared definition propagating to this form.
     */
    let config = null;

    if (entry.config && Object.keys(entry.config).length > 0) {
      const merged = normalizeTypeConfig(definition.dataType, {
        ...definition.config,
        ...entry.config,
      });

      config = Object.fromEntries(
        Object.keys(entry.config)
          .filter((key) => key in merged)
          .map((key) => [key, merged[key]])
      );

      if (Object.keys(config).length === 0) config = null;
    }

    return {
      fieldId: Number(entry.fieldId),
      isRequired: entry.isRequired ?? null,
      label: entry.label ?? null,
      helpText: entry.helpText ?? null,
      config,
    };
  });
}

export async function createForm(payload, actor) {
  const key = assertValidKey(payload.key || slugifyKey(payload.label), "form key");

  assertKeyNotReserved(key, "Form key");

  if (await findFormByKey(key)) {
    throw conflict(`A form with key "${key}" already exists.`, { code: "FORM_KEY_TAKEN" });
  }

  const entries = await resolveFieldEntries(payload.fields);

  const formId = await withTransaction(async (connection) => {
    const insertId = await insertForm(connection, {
      key,
      label: payload.label,
      description: payload.description ?? null,
      submitLabel: payload.submitLabel,
      cancelLabel: payload.cancelLabel,
      actorUserId: actor?.userId ?? null,
    });

    await replaceFormFields(connection, insertId, entries);

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "form.create",
      entityType: "form",
      entityId: insertId,
      summary: { key, label: payload.label, fieldCount: entries.length },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return insertId;
  });

  return getForm(formId);
}

export async function updateFormDefinition(formId, patch, actor) {
  const current = await getForm(formId, { includeFields: false });

  if (current.status === "archived" && patch.status !== "active") {
    throw conflict("This form is archived. Reactivate it before editing.", {
      code: "FORM_ARCHIVED",
    });
  }

  if (patch.status === "archived") {
    const mappingCount = await countMappingsForForm(formId);

    if (mappingCount > 0) {
      throw conflict(
        `This form is used by ${mappingCount} mapping(s). Remove those mappings first.`,
        { code: "FORM_HAS_MAPPINGS" }
      );
    }

    const configCount = await countEntityConfigurationsForForm(formId);

    if (configCount > 0) {
      throw conflict(
        `This form is configured on ${configCount} organization section(s).`,
        { code: "FORM_IN_ORGANIZATION_USE" }
      );
    }
  }

  const entries =
    patch.fields !== undefined ? await resolveFieldEntries(patch.fields) : null;

  await withTransaction(async (connection) => {
    const didUpdate = await updateForm(
      connection,
      formId,
      {
        label: patch.label,
        description: patch.description,
        submitLabel: patch.submitLabel,
        cancelLabel: patch.cancelLabel,
        status: patch.status,
      },
      actor?.userId ?? null
    );

    if (entries) {
      await replaceFormFields(connection, formId, entries);
    }

    if (didUpdate || entries) {
      await recordAudit({
        connection,
        actorUserId: actor?.userId ?? null,
        action: patch.status === "archived" ? "form.archive" : "form.update",
        entityType: "form",
        entityId: formId,
        summary: {
          changedKeys: Object.keys(patch),
          fieldCount: entries ? entries.length : undefined,
        },
        ipAddress: actor?.ipAddress ?? null,
        userAgent: actor?.userAgent ?? null,
      });
    }
  });

  return getForm(formId);
}

export async function archiveForm(formId, actor) {
  const current = await getForm(formId, { includeFields: false });

  if (current.status === "archived") return current;

  return updateFormDefinition(formId, { status: "archived" }, actor);
}

/*
 * Drag-and-drop and keyboard reorder both land here. The full ordered field
 * list is replaced in one transaction so a half-applied order is impossible.
 */
export async function reorderFormFields(formId, orderedFieldIds, actor) {
  const currentFields = await findFormFieldsByFormId(formId);
  const byFieldId = new Map(
    currentFields.map((field) => [Number(field.fieldId), field])
  );

  const unknown = orderedFieldIds.filter((id) => !byFieldId.has(Number(id)));

  if (unknown.length > 0) {
    throw badRequest("Some fields do not belong to this form.", { code: "FIELD_MISMATCH" });
  }

  if (orderedFieldIds.length !== currentFields.length) {
    throw badRequest("The new order must include every form field exactly once.", {
      code: "INCOMPLETE_FIELD_ORDER",
    });
  }

  const entries = orderedFieldIds.map((id) => {
    const existing = byFieldId.get(Number(id));

    return {
      fieldId: Number(id),
      isRequired: existing.overrides.isRequired,
      label: existing.overrides.label,
      helpText: existing.overrides.helpText,
      config: existing.overrides.config,
    };
  });

  await withTransaction(async (connection) => {
    await replaceFormFields(connection, formId, entries);

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "form.reorder",
      entityType: "form",
      entityId: formId,
      summary: { fieldCount: entries.length },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return getForm(formId);
}

export async function getFormUsage(formId) {
  await getForm(formId, { includeFields: false });

  const [mappingCount, entityConfigCount] = await Promise.all([
    countMappingsForForm(formId),
    countEntityConfigurationsForForm(formId),
  ]);

  return { mappingCount, entityConfigCount };
}
