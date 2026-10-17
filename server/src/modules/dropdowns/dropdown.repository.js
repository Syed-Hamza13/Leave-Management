import { db } from "../../config/database.js";
import { limitClause } from "../../lib/pagination.js";
import { recordJsonPath } from "../../lib/identifiers.js";

const SELECT_DROPDOWNS = `
  SELECT
    d.id,
    d.dropdown_key,
    d.label,
    d.description,
    d.status,
    d.created_by,
    d.updated_by,
    d.created_at,
    d.updated_at,
    d.archived_at,
    (SELECT COUNT(*) FROM dropdown_options o WHERE o.dropdown_id = d.id) AS option_count,
    (SELECT COUNT(*) FROM field_definitions f
       WHERE f.config IS NOT NULL
         AND JSON_EXTRACT(f.config, '$.dropdownId') = d.id) AS field_count
  FROM dropdown_definitions d
`;

function mapDropdown(row) {
  return {
    id: row.id,
    key: row.dropdown_key,
    label: row.label,
    description: row.description,
    status: row.status,
    optionCount: Number(row.option_count || 0),
    fieldCount: Number(row.field_count || 0),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function mapOption(row) {
  return {
    id: row.id,
    dropdownId: row.dropdown_id,
    value: row.option_value,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildListFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.status) {
    conditions.push("d.status = ?");
    params.push(query.status);
  }

  if (query.search) {
    conditions.push("(d.label LIKE ? OR d.dropdown_key LIKE ? OR d.description LIKE ?)");

    const pattern = `%${query.search}%`;

    params.push(pattern, pattern, pattern);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function findDropdowns(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      ${SELECT_DROPDOWNS}
      ${where}
      ORDER BY d.label ASC, d.id ASC
      ${limitClause(query.limit, query.offset)}
    `,
    params
  );

  return rows.map(mapDropdown);
}

export async function countDropdowns(query) {
  const { where, params } = buildListFilters(query);

  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM dropdown_definitions d
      ${where}
    `,
    params
  );

  return Number(rows[0]?.total || 0);
}

export async function findDropdownById(id) {
  const [rows] = await db.execute(
    `
      ${SELECT_DROPDOWNS}
      WHERE d.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] ? mapDropdown(rows[0]) : null;
}

export async function findDropdownByKey(key) {
  const [rows] = await db.execute(
    `
      ${SELECT_DROPDOWNS}
      WHERE d.dropdown_key = ?
      LIMIT 1
    `,
    [key]
  );

  return rows[0] ? mapDropdown(rows[0]) : null;
}

export async function findAllActiveDropdowns() {
  const [rows] = await db.execute(
    `
      ${SELECT_DROPDOWNS}
      WHERE d.status = 'active'
      ORDER BY d.label ASC
    `
  );

  return rows.map(mapDropdown);
}

export async function insertDropdown(connection, dropdown) {
  const [result] = await connection.execute(
    `
      INSERT INTO dropdown_definitions
        (dropdown_key, label, description, status, created_by, updated_by)
      VALUES (?, ?, ?, 'active', ?, ?)
    `,
    [
      dropdown.key,
      dropdown.label,
      dropdown.description ?? null,
      dropdown.actorUserId ?? null,
      dropdown.actorUserId ?? null,
    ]
  );

  return result.insertId;
}

export async function updateDropdown(connection, id, patch, actorUserId) {
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

  if (patch.status !== undefined) {
    assignments.push("status = ?");
    params.push(patch.status);

    assignments.push("archived_at = ?");
    params.push(patch.status === "archived" ? new Date() : null);
  }

  if (assignments.length === 0) return false;

  assignments.push("updated_by = ?");
  params.push(actorUserId ?? null, id);

  await connection.execute(
    `
      UPDATE dropdown_definitions
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return true;
}

export async function findOptionsByDropdownId(dropdownId, options = {}) {
  const conditions = ["dropdown_id = ?"];
  const params = [dropdownId];

  if (options.activeOnly) {
    conditions.push("is_active = 1");
  }

  const [rows] = await db.execute(
    `
      SELECT id, dropdown_id, option_value, label, sort_order, is_active, created_at, updated_at
      FROM dropdown_options
      WHERE ${conditions.join(" AND ")}
      ORDER BY sort_order ASC, id ASC
    `,
    params
  );

  return rows.map(mapOption);
}

export async function findOptionById(optionId) {
  const [rows] = await db.execute(
    `
      SELECT id, dropdown_id, option_value, label, sort_order, is_active, created_at, updated_at
      FROM dropdown_options
      WHERE id = ?
      LIMIT 1
    `,
    [optionId]
  );

  return rows[0] ? mapOption(rows[0]) : null;
}

export async function findOptionByValue(dropdownId, optionValue) {
  const [rows] = await db.execute(
    `
      SELECT id, dropdown_id, option_value, label, sort_order, is_active, created_at, updated_at
      FROM dropdown_options
      WHERE dropdown_id = ? AND option_value = ?
      LIMIT 1
    `,
    [dropdownId, optionValue]
  );

  return rows[0] ? mapOption(rows[0]) : null;
}

export async function nextOptionSortOrder(connection, dropdownId) {
  const [rows] = await connection.execute(
    `
      SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
      FROM dropdown_options
      WHERE dropdown_id = ?
    `,
    [dropdownId]
  );

  return Number(rows[0]?.next_order || 10);
}

export async function insertOption(connection, option) {
  const [result] = await connection.execute(
    `
      INSERT INTO dropdown_options
        (dropdown_id, option_value, label, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      option.dropdownId,
      option.value,
      option.label,
      option.sortOrder ?? 0,
      option.isActive === false ? 0 : 1,
    ]
  );

  return result.insertId;
}

export async function updateOption(connection, optionId, patch) {
  const assignments = [];
  const params = [];

  if (patch.label !== undefined) {
    assignments.push("label = ?");
    params.push(patch.label);
  }

  if (patch.sortOrder !== undefined) {
    assignments.push("sort_order = ?");
    params.push(patch.sortOrder);
  }

  if (patch.isActive !== undefined) {
    assignments.push("is_active = ?");
    params.push(patch.isActive ? 1 : 0);
  }

  if (assignments.length === 0) return false;

  params.push(optionId);

  await connection.execute(
    `
      UPDATE dropdown_options
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return true;
}

export async function deleteOption(connection, optionId) {
  await connection.execute(
    `
      DELETE FROM dropdown_options
      WHERE id = ?
    `,
    [optionId]
  );
}

export async function applyOptionOrder(connection, dropdownId, orderedIds) {
  for (let index = 0; index < orderedIds.length; index += 1) {
    await connection.execute(
      `
        UPDATE dropdown_options
        SET sort_order = ?
        WHERE id = ? AND dropdown_id = ?
      `,
      [(index + 1) * 10, orderedIds[index], dropdownId]
    );
  }
}

/*
 * Columns whose configuration points at this option set. Used to bound the
 * record scan when deciding whether an option value is still referenced.
 */
export async function findColumnsUsingDropdown(dropdownId) {
  const [rows] = await db.execute(
    `
      SELECT id, table_id, column_key, is_system, physical_column
      FROM column_definitions
      WHERE data_type = 'dropdown'
        AND config IS NOT NULL
        AND JSON_EXTRACT(config, '$.dropdownId') = ?
    `,
    [dropdownId]
  );

  return rows;
}

export async function countRecordsUsingOptionValue(tableId, columnKey, optionValue) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM table_records
      WHERE table_id = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(data, ?)) = ?
    `,
    [tableId, recordJsonPath(columnKey), optionValue]
  );

  return Number(rows[0]?.total || 0);
}

export async function countProfileValuesUsingOptionValue(columnDefinitionId, optionValue) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM user_profile_values
      WHERE column_definition_id = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(value, '$')) = ?
    `,
    [columnDefinitionId, optionValue]
  );

  return Number(rows[0]?.total || 0);
}

export async function countFieldsUsingDropdown(dropdownId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM field_definitions
      WHERE data_type = 'dropdown'
        AND config IS NOT NULL
        AND JSON_EXTRACT(config, '$.dropdownId') = ?
    `,
    [dropdownId]
  );

  return Number(rows[0]?.total || 0);
}
