import { db } from "../../config/database.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";
import { limitClause } from "../../lib/pagination.js";

const SELECT_FORMS = `
  SELECT
    fm.id,
    fm.form_key,
    fm.label,
    fm.description,
    fm.submit_label,
    fm.cancel_label,
    fm.status,
    fm.created_by,
    fm.updated_by,
    fm.created_at,
    fm.updated_at,
    fm.archived_at,
    (SELECT COUNT(*) FROM form_fields ff WHERE ff.form_id = fm.id) AS field_count,
    (SELECT COUNT(*) FROM form_table_mappings m WHERE m.form_id = fm.id) AS mapping_count
  FROM form_definitions fm
`;

function mapForm(row) {
  return {
    id: row.id,
    key: row.form_key,
    label: row.label,
    description: row.description,
    submitLabel: row.submit_label,
    cancelLabel: row.cancel_label,
    status: row.status,
    fieldCount: Number(row.field_count || 0),
    mappingCount: Number(row.mapping_count || 0),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

const SELECT_FORM_FIELDS = `
  SELECT
    ff.id AS form_field_id,
    ff.form_id,
    ff.field_id,
    ff.sort_order,
    ff.is_required_override,
    ff.label_override,
    ff.help_text_override,
    ff.config_override,
    f.field_key,
    f.label,
    f.description,
    f.data_type,
    f.config,
    f.is_required,
    f.default_value,
    f.help_text,
    f.status AS field_status
  FROM form_fields ff
  INNER JOIN field_definitions f ON f.id = ff.field_id
  WHERE ff.form_id = ?
  ORDER BY ff.sort_order ASC, ff.id ASC
`;

/*
 * The resolved shape is what the dynamic renderer consumes: one entry per form
 * slot with per-form overrides already applied on top of the shared field
 * definition. Overrides are stored separately so editing a field definition
 * still propagates to every form that has not overridden it.
 */
export function mapFormField(row) {
  const baseConfig = parseJsonColumn(row.config, {});
  const overrideConfig = parseJsonColumn(row.config_override, null);

  return {
    formFieldId: row.form_field_id,
    formId: row.form_id,
    fieldId: row.field_id,
    key: row.field_key,
    label: row.label_override || row.label,
    helpText: row.help_text_override ?? row.help_text ?? null,
    dataType: row.data_type,
    config: overrideConfig ? { ...baseConfig, ...overrideConfig } : baseConfig,
    isRequired:
      row.is_required_override === null || row.is_required_override === undefined
        ? Boolean(row.is_required)
        : Boolean(row.is_required_override),
    defaultValue: parseJsonColumn(row.default_value, null),
    sortOrder: row.sort_order,
    fieldStatus: row.field_status,
    overrides: {
      label: row.label_override,
      helpText: row.help_text_override,
      isRequired:
        row.is_required_override === null || row.is_required_override === undefined
          ? null
          : Boolean(row.is_required_override),
      config: overrideConfig,
    },
  };
}

function buildListFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.status) {
    conditions.push("fm.status = ?");
    params.push(query.status);
  }

  if (query.search) {
    conditions.push("(fm.label LIKE ? OR fm.form_key LIKE ? OR fm.description LIKE ?)");

    const pattern = `%${query.search}%`;

    params.push(pattern, pattern, pattern);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function findForms(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      ${SELECT_FORMS}
      ${where}
      ORDER BY fm.label ASC, fm.id ASC
      ${limitClause(query.limit, query.offset)}
    `,
    params
  );

  return rows.map(mapForm);
}

export async function countForms(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM form_definitions fm
      ${where}
    `,
    params
  );

  return Number(rows[0]?.total || 0);
}

export async function findFormById(id) {
  const [rows] = await db.execute(
    `
      ${SELECT_FORMS}
      WHERE fm.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] ? mapForm(rows[0]) : null;
}

export async function findFormByKey(key) {
  const [rows] = await db.execute(
    `
      ${SELECT_FORMS}
      WHERE fm.form_key = ?
      LIMIT 1
    `,
    [key]
  );

  return rows[0] ? mapForm(rows[0]) : null;
}

export async function findAllActiveForms() {
  const [rows] = await db.execute(
    `
      ${SELECT_FORMS}
      WHERE fm.status = 'active'
      ORDER BY fm.label ASC
    `
  );

  return rows.map(mapForm);
}

export async function insertForm(connection, form) {
  const [result] = await connection.execute(
    `
      INSERT INTO form_definitions
        (form_key, label, description, submit_label, cancel_label, status, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `,
    [
      form.key,
      form.label,
      form.description ?? null,
      form.submitLabel || "Submit",
      form.cancelLabel || "Cancel",
      form.actorUserId ?? null,
      form.actorUserId ?? null,
    ]
  );

  return result.insertId;
}

export async function updateForm(connection, id, patch, actorUserId) {
  const assignments = [];
  const params = [];

  const textColumns = {
    label: "label",
    description: "description",
    submitLabel: "submit_label",
    cancelLabel: "cancel_label",
    status: "status",
  };

  for (const [patchKey, sqlColumn] of Object.entries(textColumns)) {
    if (patch[patchKey] === undefined) continue;

    assignments.push(`${sqlColumn} = ?`);
    params.push(patch[patchKey]);
  }

  if (patch.status !== undefined) {
    assignments.push("archived_at = ?");
    params.push(patch.status === "archived" ? new Date() : null);
  }

  if (assignments.length === 0) return false;

  assignments.push("updated_by = ?");
  params.push(actorUserId ?? null, id);

  await connection.execute(
    `
      UPDATE form_definitions
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return true;
}

export async function findFormFieldsByFormId(formId) {
  const [rows] = await db.execute(SELECT_FORM_FIELDS, [formId]);

  return rows.map(mapFormField);
}

export async function replaceFormFields(connection, formId, entries) {
  await connection.execute(
    `
      DELETE FROM form_fields
      WHERE form_id = ?
    `,
    [formId]
  );

  if (entries.length === 0) return;

  const values = entries
    .map(() => "(?, ?, ?, ?, ?, ?, ?)")
    .join(", ");

  const params = entries.flatMap((entry, index) => [
    formId,
    entry.fieldId,
    (index + 1) * 10,
    entry.isRequired === undefined || entry.isRequired === null ? null : entry.isRequired ? 1 : 0,
    entry.label ?? null,
    entry.helpText ?? null,
    entry.config ? stringifyJsonColumn(entry.config) : null,
  ]);

  await connection.execute(
    `
      INSERT INTO form_fields
        (form_id, field_id, sort_order, is_required_override, label_override,
         help_text_override, config_override)
      VALUES ${values}
    `,
    params
  );
}

export async function countMappingsForForm(formId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM form_table_mappings
      WHERE form_id = ?
    `,
    [formId]
  );

  return Number(rows[0]?.total || 0);
}

export async function countEntityConfigurationsForForm(formId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM entity_type_configurations
      WHERE form_id = ?
    `,
    [formId]
  );

  return Number(rows[0]?.total || 0);
}

export async function findFormFieldsByIds(formFieldIds) {
  if (!formFieldIds || formFieldIds.length === 0) return [];

  const placeholders = formFieldIds.map(() => "?").join(", ");

  const [rows] = await db.execute(
    `
      SELECT
        ff.id AS form_field_id,
        ff.form_id,
        ff.field_id,
        ff.sort_order,
        ff.is_required_override,
        ff.label_override,
        ff.help_text_override,
        ff.config_override,
        f.field_key,
        f.label,
        f.description,
        f.data_type,
        f.config,
        f.is_required,
        f.default_value,
        f.help_text,
        f.status AS field_status
      FROM form_fields ff
      INNER JOIN field_definitions f ON f.id = ff.field_id
      WHERE ff.id IN (${placeholders})
      ORDER BY ff.form_id ASC, ff.sort_order ASC
    `,
    formFieldIds
  );

  return rows.map(mapFormField);
}
