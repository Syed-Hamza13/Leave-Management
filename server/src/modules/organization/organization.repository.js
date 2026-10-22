import { db } from "../../config/database.js";
import { parseJsonColumn } from "../../lib/jsonColumn.js";
import { limitClause } from "../../lib/pagination.js";

const SELECT_ENTITY_TYPES = `
  SELECT
    et.id,
    et.type_key,
    et.label,
    et.description,
    et.parent_type_id,
    et.status,
    et.created_by,
    et.updated_by,
    et.created_at,
    et.updated_at,
    et.archived_at,
    p.type_key AS parent_key,
    p.label AS parent_label,
    p.status AS parent_status,
    (SELECT COUNT(*) FROM organization_entities e
       WHERE e.entity_type_id = et.id AND e.status = 'active') AS entity_count,
    (SELECT COUNT(*) FROM entity_type_configurations c
       WHERE c.entity_type_id = et.id AND c.is_active = 1) AS configuration_count
  FROM organization_entity_types et
  LEFT JOIN organization_entity_types p ON p.id = et.parent_type_id
`;

function mapEntityType(row) {
  return {
    id: row.id,
    key: row.type_key,
    label: row.label,
    description: row.description,
    parentTypeId: row.parent_type_id,
    parentType: row.parent_type_id
      ? {
          id: row.parent_type_id,
          key: row.parent_key,
          label: row.parent_label,
          status: row.parent_status,
        }
      : null,
    status: row.status,
    entityCount: Number(row.entity_count || 0),
    configurationCount: Number(row.configuration_count || 0),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

const SELECT_CONFIGURATIONS = `
  SELECT
    c.id,
    c.entity_type_id,
    c.scope,
    c.label,
    c.form_id,
    c.table_id,
    c.mapping_id,
    c.sort_order,
    c.is_active,
    c.created_by,
    c.updated_by,
    c.created_at,
    c.updated_at,
    f.form_key,
    f.label AS form_label,
    f.status AS form_status,
    t.table_key,
    t.label AS table_label,
    t.status AS table_status,
    t.storage_kind,
    m.status AS mapping_status,
    m.version AS mapping_version
  FROM entity_type_configurations c
  INNER JOIN form_definitions f ON f.id = c.form_id
  INNER JOIN table_definitions t ON t.id = c.table_id
  INNER JOIN form_table_mappings m ON m.id = c.mapping_id
`;

function mapConfiguration(row) {
  return {
    id: row.id,
    entityTypeId: row.entity_type_id,
    scope: row.scope,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    form: { id: row.form_id, key: row.form_key, label: row.form_label, status: row.form_status },
    table: {
      id: row.table_id,
      key: row.table_key,
      label: row.table_label,
      status: row.table_status,
      storageKind: row.storage_kind,
    },
    mapping: { id: row.mapping_id, status: row.mapping_status, version: row.mapping_version },
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_ENTITIES = `
  SELECT
    e.id,
    e.entity_type_id,
    e.name,
    e.parent_entity_id,
    e.profile_record_id,
    e.sort_order,
    e.status,
    e.created_by,
    e.updated_by,
    e.created_at,
    e.updated_at,
    e.archived_at,
    et.type_key,
    et.label AS type_label,
    et.status AS type_status,
    p.name AS parent_name,
    p.status AS parent_status,
    pr.table_id AS profile_table_id,
    pr.schema_version AS profile_schema_version,
    pr.data AS profile_data,
    pr.status AS profile_status,
    (SELECT COUNT(*) FROM organization_entities ch
       WHERE ch.parent_entity_id = e.id AND ch.status = 'active') AS child_count
  FROM organization_entities e
  INNER JOIN organization_entity_types et ON et.id = e.entity_type_id
  LEFT JOIN organization_entities p ON p.id = e.parent_entity_id
  LEFT JOIN table_records pr ON pr.id = e.profile_record_id
`;

function mapEntity(row) {
  return {
    id: row.id,
    entityTypeId: row.entity_type_id,
    entityType: {
      id: row.entity_type_id,
      key: row.type_key,
      label: row.type_label,
      status: row.type_status,
    },
    name: row.name,
    parentEntityId: row.parent_entity_id,
    parentEntity: row.parent_entity_id
      ? { id: row.parent_entity_id, name: row.parent_name, status: row.parent_status }
      : null,
    sortOrder: row.sort_order,
    status: row.status,
    childCount: Number(row.child_count || 0),
    /*
     * The profile row is joined rather than looked up separately so a list of
     * entities carries its configured attributes without one query per row.
     */
    profile: row.profile_record_id
      ? {
          recordId: row.profile_record_id,
          tableId: row.profile_table_id,
          schemaVersion: row.profile_schema_version,
          values: parseJsonColumn(row.profile_data, {}),
          status: row.profile_status,
        }
      : null,
    values: row.profile_record_id ? parseJsonColumn(row.profile_data, {}) : {},
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function buildEntityTypeFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.status) {
    conditions.push("et.status = ?");
    params.push(query.status);
  }

  if (query.parentTypeId) {
    conditions.push("et.parent_type_id = ?");
    params.push(query.parentTypeId);
  }

  if (query.search) {
    conditions.push("(et.label LIKE ? OR et.type_key LIKE ? OR et.description LIKE ?)");

    const pattern = `%${query.search}%`;

    params.push(pattern, pattern, pattern);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function findEntityTypes(query) {
  const { where, params } = buildEntityTypeFilters(query);

  const [rows] = await db.execute(
    `
      ${SELECT_ENTITY_TYPES}
      ${where}
      ORDER BY et.label ASC, et.id ASC
      ${limitClause(query.limit, query.offset)}
    `,
    params
  );

  return rows.map(mapEntityType);
}

export async function countEntityTypes(query) {
  const { where, params } = buildEntityTypeFilters(query);

  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM organization_entity_types et
      ${where}
    `,
    params
  );

  return Number(rows[0]?.total || 0);
}

export async function findEntityTypeById(id) {
  const [rows] = await db.execute(
    `
      ${SELECT_ENTITY_TYPES}
      WHERE et.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] ? mapEntityType(rows[0]) : null;
}

export async function findEntityTypeByKey(key) {
  const [rows] = await db.execute(
    `
      ${SELECT_ENTITY_TYPES}
      WHERE et.type_key = ?
      LIMIT 1
    `,
    [key]
  );

  return rows[0] ? mapEntityType(rows[0]) : null;
}

export async function findAllActiveEntityTypes() {
  const [rows] = await db.execute(
    `
      ${SELECT_ENTITY_TYPES}
      WHERE et.status = 'active'
      ORDER BY et.label ASC
    `
  );

  return rows.map(mapEntityType);
}

export async function insertEntityType(connection, entityType) {
  const [result] = await connection.execute(
    `
      INSERT INTO organization_entity_types
        (type_key, label, description, parent_type_id, status, created_by, updated_by)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `,
    [
      entityType.key,
      entityType.label,
      entityType.description ?? null,
      entityType.parentTypeId ?? null,
      entityType.actorUserId ?? null,
      entityType.actorUserId ?? null,
    ]
  );

  return result.insertId;
}

export async function updateEntityType(connection, id, patch, actorUserId) {
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

  if (patch.parentTypeId !== undefined) {
    assignments.push("parent_type_id = ?");
    params.push(patch.parentTypeId);
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
      UPDATE organization_entity_types
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return true;
}

export async function countActiveEntitiesForType(entityTypeId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM organization_entities
      WHERE entity_type_id = ? AND status = 'active'
    `,
    [entityTypeId]
  );

  return Number(rows[0]?.total || 0);
}

export async function countActiveChildEntityTypes(parentTypeId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM organization_entity_types
      WHERE parent_type_id = ? AND status = 'active'
    `,
    [parentTypeId]
  );

  return Number(rows[0]?.total || 0);
}

export async function findConfigurationsByTypeId(entityTypeId, { scope = null } = {}) {
  const conditions = ["c.entity_type_id = ?"];
  const params = [entityTypeId];

  if (scope) {
    conditions.push("c.scope = ?");
    params.push(scope);
  }

  const [rows] = await db.execute(
    `
      ${SELECT_CONFIGURATIONS}
      WHERE ${conditions.join(" AND ")}
      ORDER BY c.scope ASC, c.sort_order ASC, c.id ASC
    `,
    params
  );

  return rows.map(mapConfiguration);
}

export async function findConfigurationById(id) {
  const [rows] = await db.execute(
    `
      ${SELECT_CONFIGURATIONS}
      WHERE c.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] ? mapConfiguration(rows[0]) : null;
}

export async function findConfigurationByLabel(entityTypeId, scope, label) {
  const [rows] = await db.execute(
    `
      ${SELECT_CONFIGURATIONS}
      WHERE c.entity_type_id = ? AND c.scope = ? AND c.label = ?
      LIMIT 1
    `,
    [entityTypeId, scope, label]
  );

  return rows[0] ? mapConfiguration(rows[0]) : null;
}

export async function nextConfigurationSortOrder(connection, entityTypeId) {
  const [rows] = await connection.execute(
    `
      SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
      FROM entity_type_configurations
      WHERE entity_type_id = ?
    `,
    [entityTypeId]
  );

  return Number(rows[0]?.next_order || 10);
}

export async function insertConfiguration(connection, configuration) {
  const [result] = await connection.execute(
    `
      INSERT INTO entity_type_configurations
        (entity_type_id, scope, label, form_id, table_id, mapping_id,
         sort_order, is_active, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      configuration.entityTypeId,
      configuration.scope,
      configuration.label,
      configuration.formId,
      configuration.tableId,
      configuration.mappingId,
      configuration.sortOrder ?? 0,
      configuration.isActive === false ? 0 : 1,
      configuration.actorUserId ?? null,
      configuration.actorUserId ?? null,
    ]
  );

  return result.insertId;
}

export async function updateConfiguration(connection, id, patch, actorUserId) {
  const assignments = [];
  const params = [];

  if (patch.label !== undefined) {
    assignments.push("label = ?");
    params.push(patch.label);
  }

  if (patch.formId !== undefined) {
    assignments.push("form_id = ?");
    params.push(patch.formId);
  }

  if (patch.tableId !== undefined) {
    assignments.push("table_id = ?");
    params.push(patch.tableId);
  }

  if (patch.mappingId !== undefined) {
    assignments.push("mapping_id = ?");
    params.push(patch.mappingId);
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

  assignments.push("updated_by = ?");
  params.push(actorUserId ?? null, id);

  await connection.execute(
    `
      UPDATE entity_type_configurations
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return true;
}

export async function deleteConfigurationById(connection, id) {
  await connection.execute(
    `
      DELETE FROM entity_type_configurations
      WHERE id = ?
    `,
    [id]
  );
}

function buildEntityFilters(query = {}) {
  const conditions = [];
  const params = [];

  if (query.entityTypeId) {
    conditions.push("e.entity_type_id = ?");
    params.push(query.entityTypeId);
  }

  if (query.parentEntityId) {
    conditions.push("e.parent_entity_id = ?");
    params.push(query.parentEntityId);
  }

  if (query.status) {
    conditions.push("e.status = ?");
    params.push(query.status);
  }

  if (query.search) {
    conditions.push("(e.name LIKE ? OR et.label LIKE ? OR pr.data LIKE ?)");

    const pattern = `%${query.search}%`;

    params.push(pattern, pattern, pattern);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function findEntities(query) {
  const { where, params } = buildEntityFilters(query);

  const [rows] = await db.execute(
    `
      ${SELECT_ENTITIES}
      ${where}
      ORDER BY e.sort_order ASC, e.name ASC, e.id ASC
      ${limitClause(query.limit, query.offset)}
    `,
    params
  );

  return rows.map(mapEntity);
}

export async function countEntities(query) {
  const { where, params } = buildEntityFilters(query);

  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM organization_entities e
      INNER JOIN organization_entity_types et ON et.id = e.entity_type_id
      LEFT JOIN table_records pr ON pr.id = e.profile_record_id
      ${where}
    `,
    params
  );

  return Number(rows[0]?.total || 0);
}

export async function findEntityById(id) {
  const [rows] = await db.execute(
    `
      ${SELECT_ENTITIES}
      WHERE e.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] ? mapEntity(rows[0]) : null;
}

export async function findEntityByTypeIdAndName(entityTypeId, name, parentEntityId = null) {
  const [rows] = await db.execute(
    `
      ${SELECT_ENTITIES}
      WHERE e.entity_type_id = ?
        AND e.name = ?
        AND e.status = 'active'
        AND e.parent_entity_id <=> ?
      LIMIT 1
    `,
    [entityTypeId, name, parentEntityId]
  );

  return rows[0] ? mapEntity(rows[0]) : null;
}

export async function nextEntitySortOrder(connection, entityTypeId) {
  const [rows] = await connection.execute(
    `
      SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order
      FROM organization_entities
      WHERE entity_type_id = ?
    `,
    [entityTypeId]
  );

  return Number(rows[0]?.next_order || 10);
}

export async function insertEntity(connection, entity) {
  const [result] = await connection.execute(
    `
      INSERT INTO organization_entities
        (entity_type_id, name, parent_entity_id, profile_record_id,
         sort_order, status, created_by, updated_by)
      VALUES (?, ?, ?, NULL, ?, 'active', ?, ?)
    `,
    [
      entity.entityTypeId,
      entity.name,
      entity.parentEntityId ?? null,
      entity.sortOrder ?? 0,
      entity.actorUserId ?? null,
      entity.actorUserId ?? null,
    ]
  );

  return result.insertId;
}

export async function setEntityProfileRecord(connection, entityId, recordId, actorUserId) {
  await connection.execute(
    `
      UPDATE organization_entities
      SET profile_record_id = ?,
          updated_by = ?
      WHERE id = ?
    `,
    [recordId, actorUserId ?? null, entityId]
  );
}

export async function updateEntity(connection, id, patch, actorUserId) {
  const assignments = [];
  const params = [];

  if (patch.name !== undefined) {
    assignments.push("name = ?");
    params.push(patch.name);
  }

  if (patch.parentEntityId !== undefined) {
    assignments.push("parent_entity_id = ?");
    params.push(patch.parentEntityId);
  }

  if (patch.sortOrder !== undefined) {
    assignments.push("sort_order = ?");
    params.push(patch.sortOrder);
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
      UPDATE organization_entities
      SET ${assignments.join(", ")}
      WHERE id = ?
    `,
    params
  );

  return true;
}

export async function countActiveChildEntities(parentEntityId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM organization_entities
      WHERE parent_entity_id = ? AND status = 'active'
    `,
    [parentEntityId]
  );

  return Number(rows[0]?.total || 0);
}

export async function countEntitiesWithProfile(entityTypeId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM organization_entities
      WHERE entity_type_id = ? AND profile_record_id IS NOT NULL
    `,
    [entityTypeId]
  );

  return Number(rows[0]?.total || 0);
}

const SELECT_MEMBERS = `
  SELECT
    m.id,
    m.organization_entity_id AS entity_id,
    m.user_id,
    m.role,
    m.status,
    m.created_by,
    m.updated_by,
    m.created_at,
    m.updated_at,
    u.email,
    u.first_name,
    u.last_name,
    u.status AS user_status
  FROM organization_entity_members m
  JOIN users u ON u.id = m.user_id
`;

function mapMember(row) {
  return {
    id: row.id,
    entityId: row.entity_id,
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email,
    role: row.role,
    status: row.status,
    userStatus: row.user_status,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findEntityMembers(entityId) {
  const [rows] = await db.execute(
    `
      ${SELECT_MEMBERS}
      WHERE m.organization_entity_id = ?
      ORDER BY FIELD(m.role, 'lead', 'manager', 'member'), u.first_name ASC, u.last_name ASC
    `,
    [entityId]
  );

  return rows.map(mapMember);
}

export async function findEntityMember(entityId, userId) {
  const [rows] = await db.execute(
    `
      ${SELECT_MEMBERS}
      WHERE m.organization_entity_id = ? AND m.user_id = ?
      LIMIT 1
    `,
    [entityId, userId]
  );

  return rows[0] ? mapMember(rows[0]) : null;
}

export async function insertEntityMember(connection, { entityId, userId, role = "member", status = "active", actorUserId }) {
  const [result] = await connection.execute(
    `
      INSERT INTO organization_entity_members
        (organization_entity_id, user_id, role, status, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [entityId, userId, role, status, actorUserId ?? null, actorUserId ?? null]
  );

  return result.insertId;
}

export async function updateEntityMember(connection, entityId, userId, patch, actorUserId) {
  const assignments = [];
  const params = [];

  if (patch.role !== undefined) {
    assignments.push("role = ?");
    params.push(patch.role);
  }

  if (patch.status !== undefined) {
    assignments.push("status = ?");
    params.push(patch.status);
  }

  if (assignments.length === 0) return false;

  assignments.push("updated_by = ?");
  params.push(actorUserId ?? null, entityId, userId);

  await connection.execute(
    `
      UPDATE organization_entity_members
      SET ${assignments.join(", ")}
      WHERE organization_entity_id = ? AND user_id = ?
    `,
    params
  );

  return true;
}

export async function deleteEntityMember(connection, entityId, userId) {
  const [result] = await connection.execute(
    `
      DELETE FROM organization_entity_members
      WHERE organization_entity_id = ? AND user_id = ?
    `,
    [entityId, userId]
  );

  return result.affectedRows > 0;
}

export async function findUserMemberships(userId) {
  const [rows] = await db.execute(
    `
      SELECT
        m.id,
        m.organization_entity_id AS entity_id,
        m.role,
        m.status,
        m.created_at,
        e.name AS entity_name,
        e.entity_type_id,
        t.label AS entity_type_label,
        t.type_key AS entity_type_key
      FROM organization_entity_members m
      JOIN organization_entities e ON e.id = m.organization_entity_id
      JOIN organization_entity_types t ON t.id = e.entity_type_id
      WHERE m.user_id = ? AND e.status = 'active'
      ORDER BY t.label ASC, e.name ASC
    `,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    entityId: row.entity_id,
    organizationEntityId: row.entity_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    entityName: row.entity_name,
    entityTypeId: row.entity_type_id,
    entityTypeLabel: row.entity_type_label,
    entityTypeKey: row.entity_type_key,
  }));
}
