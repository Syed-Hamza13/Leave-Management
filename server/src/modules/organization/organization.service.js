import { badRequest, conflict, notFound } from "../../lib/appError.js";
import { withTransaction } from "../../lib/transactions.js";
import {
  assertValidKey,
  assertKeyNotReserved,
  slugifyKey,
} from "../../lib/identifiers.js";
import { recordAudit } from "../audit/audit.service.js";
import { getActiveMappingWithEntries } from "../mappings/mapping.service.js";
import { findMappingById } from "../mappings/mapping.repository.js";
import { createRecordInTransaction, updateRecordInTransaction } from "../records/record.service.js";
import { archiveRecordById } from "../records/record.repository.js";
import {
  findEntityTypes,
  countEntityTypes,
  findEntityTypeById,
  findEntityTypeByKey,
  insertEntityType,
  updateEntityType,
  countActiveEntitiesForType,
  countActiveChildEntityTypes,
  findConfigurationsByTypeId,
  findConfigurationById,
  findConfigurationByLabel,
  nextConfigurationSortOrder,
  insertConfiguration,
  updateConfiguration as updateConfigurationRow,
  deleteConfigurationById,
  findEntities,
  countEntities,
  findEntityById,
  findEntityByTypeIdAndName,
  nextEntitySortOrder,
  insertEntity,
  setEntityProfileRecord,
  updateEntity as updateEntityRow,
  countActiveChildEntities,
  countEntitiesWithProfile,
  findEntityMembers,
  findEntityMember,
  insertEntityMember,
  updateEntityMember as updateEntityMemberRow,
  deleteEntityMember as deleteEntityMemberRow,
  findUserMemberships,
} from "./organization.repository.js";
import { findUserRowById } from "../users/user.repository.js";

/*
 * Bound on parent-chain walks. A cycle cannot be created through this service,
 * but a hand-edited row must not be able to spin an endless loop.
 */
const MAX_HIERARCHY_DEPTH = 25;

const LOOKUP_TYPE_LIMIT = 100;

/* ---------------------------------------------------------------- entity types */

export async function listEntityTypes(query) {
  const [entityTypes, total] = await Promise.all([
    findEntityTypes(query),
    countEntityTypes(query),
  ]);

  return { entityTypes, total };
}

/*
 * Every usable entity type gets its own entry in the sidebar, so the shell needs
 * the short list on all screens. The number is capped: the navigation would
 * otherwise grow without bound on a large installation.
 */
export async function listActiveEntityTypeSummaries() {
  const entityTypes = await findEntityTypes({ status: "active", limit: LOOKUP_TYPE_LIMIT });

  return entityTypes.map((entityType) => ({
    id: entityType.id,
    key: entityType.key,
    label: entityType.label,
    entityCount: entityType.entityCount,
    configurationCount: entityType.configurationCount,
  }));
}

export async function getEntityType(entityTypeId, { includeConfigurations = true } = {}) {
  const entityType = await findEntityTypeById(entityTypeId);

  if (!entityType) {
    throw notFound("Entity type not found.", { code: "ENTITY_TYPE_NOT_FOUND" });
  }

  if (!includeConfigurations) return entityType;

  const configurations = await findConfigurationsByTypeId(entityTypeId);

  return { ...entityType, configurations };
}

async function assertParentType(parentTypeId, selfId = null) {
  if (parentTypeId === null || parentTypeId === undefined) return null;

  if (selfId !== null && Number(parentTypeId) === Number(selfId)) {
    throw badRequest("An entity type cannot be its own parent.", {
      code: "PARENT_TYPE_SELF_REFERENCE",
    });
  }

  const parent = await findEntityTypeById(parentTypeId);

  if (!parent) {
    throw badRequest("The parent entity type does not exist.", {
      code: "PARENT_TYPE_NOT_FOUND",
    });
  }

  if (parent.status !== "active") {
    throw badRequest("The parent entity type is archived.", {
      code: "PARENT_TYPE_ARCHIVED",
    });
  }

  /*
   * Walking upwards from the requested parent catches a cycle before it is
   * written, which a foreign key cannot do on its own.
   */
  let cursor = parent;
  let depth = 0;

  while (cursor.parentTypeId !== null && cursor.parentTypeId !== undefined) {
    if (selfId !== null && Number(cursor.parentTypeId) === Number(selfId)) {
      throw conflict("This would make the entity type a parent of itself.", {
        code: "PARENT_TYPE_CYCLE",
      });
    }

    depth += 1;

    if (depth > MAX_HIERARCHY_DEPTH) {
      throw conflict("The entity type hierarchy is too deep.", {
        code: "HIERARCHY_TOO_DEEP",
      });
    }

    const next = await findEntityTypeById(cursor.parentTypeId);

    if (!next) break;

    cursor = next;
  }

  return parent.id;
}

export async function createEntityType(payload, actor) {
  const key = assertValidKey(payload.key || slugifyKey(payload.label), "entity type key");

  assertKeyNotReserved(key, "Entity type key");

  if (await findEntityTypeByKey(key)) {
    throw conflict(`An entity type with key "${key}" already exists.`, {
      code: "ENTITY_TYPE_KEY_TAKEN",
    });
  }

  const parentTypeId = await assertParentType(payload.parentTypeId ?? null);

  const entityTypeId = await withTransaction(async (connection) => {
    const insertId = await insertEntityType(connection, {
      key,
      label: payload.label,
      description: payload.description ?? null,
      parentTypeId,
      actorUserId: actor?.userId ?? null,
    });

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "organization.entity_type.create",
      entityType: "organization_entity_type",
      entityId: insertId,
      summary: { key, label: payload.label, parentTypeId },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return insertId;
  });

  return getEntityType(entityTypeId);
}

export async function updateEntityTypeDefinition(entityTypeId, patch, actor) {
  const current = await getEntityType(entityTypeId, { includeConfigurations: false });

  if (current.status === "archived" && patch.status !== "active") {
    throw conflict("This entity type is archived. Reactivate it before editing.", {
      code: "ENTITY_TYPE_ARCHIVED",
    });
  }

  if (patch.status === "archived") {
    const entityCount = await countActiveEntitiesForType(entityTypeId);

    if (entityCount > 0) {
      throw conflict(
        `This entity type has ${entityCount} active entity record(s). Archive them first.`,
        { code: "ENTITY_TYPE_HAS_ENTITIES" }
      );
    }

    const childTypeCount = await countActiveChildEntityTypes(entityTypeId);

    if (childTypeCount > 0) {
      throw conflict(
        `${childTypeCount} entity type(s) sit below this one. Reassign them first.`,
        { code: "ENTITY_TYPE_HAS_CHILDREN" }
      );
    }
  }

  let parentTypeId;

  if (patch.parentTypeId !== undefined) {
    parentTypeId = await assertParentType(patch.parentTypeId, entityTypeId);
  }

  const changed = await withTransaction(async (connection) => {
    const didUpdate = await updateEntityType(
      connection,
      entityTypeId,
      {
        label: patch.label,
        description: patch.description,
        parentTypeId,
        status: patch.status,
      },
      actor?.userId ?? null
    );

    if (didUpdate) {
      await recordAudit({
        connection,
        actorUserId: actor?.userId ?? null,
        action:
          patch.status === "archived"
            ? "organization.entity_type.archive"
            : "organization.entity_type.update",
        entityType: "organization_entity_type",
        entityId: entityTypeId,
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

  return getEntityType(entityTypeId);
}

export async function archiveEntityType(entityTypeId, actor) {
  const current = await getEntityType(entityTypeId, { includeConfigurations: false });

  if (current.status === "archived") return current;

  return updateEntityTypeDefinition(entityTypeId, { status: "archived" }, actor);
}

/* ------------------------------------------------------------- configurations */

/*
 * A configuration is the explicit link between an entity type and the
 * form/table/mapping triple used to capture its data. The triple is validated as
 * a whole: the mapping must belong to exactly the form and table named, and all
 * three must still be usable, otherwise the entity page would render a form that
 * cannot store anything.
 */
async function assertConfigurationTriple({ formId, tableId, mappingId }) {
  const mapping = await findMappingById(mappingId);

  if (!mapping) {
    throw badRequest("The selected mapping does not exist.", { code: "MAPPING_NOT_FOUND" });
  }

  if (Number(mapping.formId) !== Number(formId) || Number(mapping.tableId) !== Number(tableId)) {
    throw badRequest("The mapping does not connect the selected form and table.", {
      code: "MAPPING_PAIR_MISMATCH",
    });
  }

  await getActiveMappingWithEntries(formId, tableId);

  if (mapping.table.storageKind !== "managed") {
    throw conflict("Organization data cannot be stored in a system-managed table.", {
      code: "SYSTEM_TABLE_READONLY",
    });
  }
}

async function assertConfigurationLabel(entityTypeId, scope, label, selfId = null) {
  const existing = await findConfigurationByLabel(entityTypeId, scope, label);

  if (existing && Number(existing.id) !== Number(selfId)) {
    throw conflict(`A ${scope} configuration labelled "${label}" already exists here.`, {
      code: "CONFIGURATION_LABEL_TAKEN",
    });
  }
}

export async function listConfigurations(entityTypeId, query = {}) {
  await getEntityType(entityTypeId, { includeConfigurations: false });

  return findConfigurationsByTypeId(entityTypeId, { scope: query.scope ?? null });
}

export async function createConfiguration(entityTypeId, payload, actor) {
  const entityType = await getEntityType(entityTypeId, { includeConfigurations: false });

  if (entityType.status !== "active") {
    throw conflict("An archived entity type cannot be configured.", {
      code: "ENTITY_TYPE_ARCHIVED",
    });
  }

  await assertConfigurationTriple(payload);

  if (payload.scope === "profile") {
    const profiles = await findConfigurationsByTypeId(entityTypeId, { scope: "profile" });

    if (profiles.length > 0) {
      throw conflict("This entity type already has a profile configuration.", {
        code: "PROFILE_ALREADY_CONFIGURED",
      });
    }
  }

  await assertConfigurationLabel(entityTypeId, payload.scope, payload.label);

  const configurationId = await withTransaction(async (connection) => {
    const sortOrder =
      payload.sortOrder ?? (await nextConfigurationSortOrder(connection, entityTypeId));

    const insertId = await insertConfiguration(connection, {
      entityTypeId,
      scope: payload.scope,
      label: payload.label,
      formId: payload.formId,
      tableId: payload.tableId,
      mappingId: payload.mappingId,
      sortOrder,
      isActive: payload.isActive,
      actorUserId: actor?.userId ?? null,
    });

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "organization.configuration.create",
      entityType: "entity_type_configuration",
      entityId: insertId,
      summary: {
        entityTypeId,
        scope: payload.scope,
        formId: payload.formId,
        tableId: payload.tableId,
        mappingId: payload.mappingId,
      },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return insertId;
  });

  return findConfigurationById(configurationId);
}

export async function updateConfiguration(configurationId, patch, actor) {
  const current = await findConfigurationById(configurationId);

  if (!current) {
    throw notFound("Configuration not found.", { code: "CONFIGURATION_NOT_FOUND" });
  }

  /*
   * Scope is fixed for the life of the configuration: turning a section into a
   * profile would bypass the one-profile-per-type rule.
   */
  const next = {
    label: patch.label ?? current.label,
    formId: patch.formId ?? current.form.id,
    tableId: patch.tableId ?? current.table.id,
    mappingId: patch.mappingId ?? current.mapping.id,
  };

  const tripleChanged =
    next.formId !== current.form.id ||
    next.tableId !== current.table.id ||
    next.mappingId !== current.mapping.id;

  if (tripleChanged) {
    await assertConfigurationTriple(next);
  }

  if (patch.label !== undefined && patch.label !== current.label) {
    await assertConfigurationLabel(
      current.entityTypeId,
      current.scope,
      patch.label,
      configurationId
    );
  }

  await withTransaction(async (connection) => {
    await updateConfigurationRow(
      connection,
      configurationId,
      {
        label: patch.label,
        formId: patch.formId,
        tableId: patch.tableId,
        mappingId: patch.mappingId,
        sortOrder: patch.sortOrder,
        isActive: patch.isActive,
      },
      actor?.userId ?? null
    );

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "organization.configuration.update",
      entityType: "entity_type_configuration",
      entityId: configurationId,
      summary: { changedKeys: Object.keys(patch), tripleChanged },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return findConfigurationById(configurationId);
}

export async function deleteConfiguration(configurationId, actor) {
  const current = await findConfigurationById(configurationId);

  if (!current) {
    throw notFound("Configuration not found.", { code: "CONFIGURATION_NOT_FOUND" });
  }

  /*
   * Entities keep a pointer to their profile row. Removing the configuration
   * that explains where those values live would leave the pointer untraceable
   * from the organization side, so it is blocked while profiles exist.
   */
  if (current.scope === "profile") {
    const profileCount = await countEntitiesWithProfile(current.entityTypeId);

    if (profileCount > 0) {
      throw conflict(
        `${profileCount} entity record(s) store their profile through this configuration. Deactivate it instead.`,
        { code: "PROFILE_CONFIGURATION_IN_USE" }
      );
    }
  }

  await withTransaction(async (connection) => {
    await deleteConfigurationById(connection, configurationId);

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "organization.configuration.delete",
      entityType: "entity_type_configuration",
      entityId: configurationId,
      summary: {
        entityTypeId: current.entityTypeId,
        scope: current.scope,
        mappingId: current.mapping.id,
      },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return { deleted: true, configurationId };
}

/* -------------------------------------------------------------------- entities */

export async function listEntities(query) {
  const [entities, total] = await Promise.all([findEntities(query), countEntities(query)]);

  return { entities, total };
}

export async function getEntity(entityId, { includeConfigurations = false } = {}) {
  const entity = await findEntityById(entityId);

  if (!entity) {
    throw notFound("Organization entity not found.", { code: "ENTITY_NOT_FOUND" });
  }

  if (!includeConfigurations) return entity;

  const configurations = await findConfigurationsByTypeId(entity.entityTypeId);

  return { ...entity, configurations };
}

async function assertActiveEntityType(entityTypeId) {
  const entityType = await getEntityType(entityTypeId, { includeConfigurations: false });

  if (entityType.status !== "active") {
    throw conflict("This entity type is archived and cannot accept new records.", {
      code: "ENTITY_TYPE_ARCHIVED",
    });
  }

  return entityType;
}

async function assertParentEntity(entityType, parentEntityId, selfId = null) {
  if (parentEntityId === null || parentEntityId === undefined) return null;

  if (selfId !== null && Number(parentEntityId) === Number(selfId)) {
    throw badRequest("An entity cannot be its own parent.", {
      code: "PARENT_ENTITY_SELF_REFERENCE",
    });
  }

  if (!entityType.parentTypeId) {
    throw conflict(
      `"${entityType.label}" has no parent type, so its records cannot be nested.`,
      { code: "PARENT_TYPE_NOT_CONFIGURED" }
    );
  }

  const parent = await findEntityById(parentEntityId);

  if (!parent) {
    throw badRequest("The parent entity does not exist.", { code: "PARENT_ENTITY_NOT_FOUND" });
  }

  if (parent.status !== "active") {
    throw badRequest("The parent entity is archived.", { code: "PARENT_ENTITY_ARCHIVED" });
  }

  if (Number(parent.entityTypeId) !== Number(entityType.parentTypeId)) {
    throw badRequest("The parent entity belongs to a different entity type.", {
      code: "PARENT_ENTITY_TYPE_MISMATCH",
    });
  }

  let cursor = parent;
  let depth = 0;

  while (cursor.parentEntityId !== null && cursor.parentEntityId !== undefined) {
    if (selfId !== null && Number(cursor.parentEntityId) === Number(selfId)) {
      throw conflict("This would make the entity a parent of itself.", {
        code: "PARENT_ENTITY_CYCLE",
      });
    }

    depth += 1;

    if (depth > MAX_HIERARCHY_DEPTH) {
      throw conflict("The organization hierarchy is too deep.", {
        code: "HIERARCHY_TOO_DEEP",
      });
    }

    const next = await findEntityById(cursor.parentEntityId);

    if (!next) break;

    cursor = next;
  }

  return parent.id;
}

async function findProfileConfiguration(entityTypeId) {
  const configs = await findConfigurationsByTypeId(entityTypeId);

  const activeProfile = configs.find(
    (configuration) => configuration.scope === "profile" && configuration.isActive
  );
  if (activeProfile) return activeProfile;

  const anyActive = configs.find((configuration) => configuration.isActive);
  if (anyActive) return anyActive;

  throw conflict("This entity type has no active configuration.", {
    code: "PROFILE_NOT_CONFIGURED",
  });
}

export async function createEntity(payload, actor) {
  const entityType = await assertActiveEntityType(payload.entityTypeId);

  const parentEntityId = await assertParentEntity(
    entityType,
    payload.parentEntityId ?? null
  );

  let entityName = payload.name?.trim();
  if (!entityName && payload.values) {
    const firstStr = Object.values(payload.values).find((v) => typeof v === "string" && v.trim().length > 0);
    entityName = firstStr ? String(firstStr).trim() : null;
  }
  if (!entityName) {
    entityName = `${entityType.label} #${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const duplicate = await findEntityByTypeIdAndName(
    payload.entityTypeId,
    entityName,
    parentEntityId
  );

  if (duplicate) {
    throw conflict(`"${entityName}" already exists.`, {
      code: "ENTITY_NAME_TAKEN",
    });
  }

  const wantsProfile = payload.values !== undefined;
  const profileConfiguration = wantsProfile
    ? await findProfileConfiguration(payload.entityTypeId)
    : null;

  const { entityId, warnings } = await withTransaction(async (connection) => {
    const sortOrder =
      payload.sortOrder ?? (await nextEntitySortOrder(connection, payload.entityTypeId));

    const insertId = await insertEntity(connection, {
      entityTypeId: payload.entityTypeId,
      name: entityName,
      parentEntityId,
      sortOrder,
      actorUserId: actor?.userId ?? null,
    });

    let profileWarnings = [];

    if (profileConfiguration) {
      /*
       * The entity row is inserted first so the profile record can point at it,
       * then the pointer is completed. Both writes share one transaction, so a
       * rejected value rolls the entity back instead of leaving a half-created
       * record behind.
       */
      const { recordId, warnings: mapped } = await createRecordInTransaction(
        connection,
        profileConfiguration.table.id,
        {
          formId: profileConfiguration.form.id,
          values: payload.values,
        },
        actor,
        { entityResolved: true, organizationEntityId: insertId }
      );

      await setEntityProfileRecord(connection, insertId, recordId, actor?.userId ?? null);

      profileWarnings = mapped;
    }

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "organization.entity.create",
      entityType: "organization_entity",
      entityId: insertId,
      summary: {
        entityTypeId: payload.entityTypeId,
        parentEntityId,
        profile: profileConfiguration
          ? { tableId: profileConfiguration.table.id, valueKeys: Object.keys(payload.values) }
          : null,
      },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return { entityId: insertId, warnings: profileWarnings };
  });

  const entity = await getEntity(entityId, { includeConfigurations: true });

  return { ...entity, warnings };
}

export async function updateEntity(entityId, patch, actor) {
  const current = await getEntity(entityId, { includeConfigurations: false });

  if (current.status !== "active") {
    throw conflict("This entity is archived and cannot be changed.", {
      code: "ENTITY_ARCHIVED",
    });
  }

  const entityType = await getEntityType(current.entityTypeId, {
    includeConfigurations: false,
  });

  let parentEntityId;

  if (patch.parentEntityId !== undefined) {
    parentEntityId = await assertParentEntity(
      entityType,
      patch.parentEntityId,
      entityId
    );
  }

  let nextName = patch.name !== undefined ? patch.name?.trim() : undefined;
  if (!nextName && patch.values) {
    const firstStr = Object.values(patch.values).find((v) => typeof v === "string" && v.trim().length > 0);
    if (firstStr) nextName = String(firstStr).trim();
  }
  if (nextName === undefined) {
    nextName = current.name;
  }

  if (nextName !== current.name) {
    const duplicate = await findEntityByTypeIdAndName(
      current.entityTypeId,
      nextName,
      parentEntityId !== undefined ? parentEntityId : current.parentEntityId
    );

    if (duplicate && Number(duplicate.id) !== Number(entityId)) {
      throw conflict(`"${nextName}" already exists.`, {
        code: "ENTITY_NAME_TAKEN",
      });
    }
  }

  const wantsProfile = patch.values !== undefined;
  const profileConfiguration = wantsProfile
    ? await findProfileConfiguration(current.entityTypeId)
    : null;

  const warnings = await withTransaction(async (connection) => {
    await updateEntityRow(
      connection,
      entityId,
      {
        name: nextName,
        parentEntityId,
        sortOrder: patch.sortOrder,
      },
      actor?.userId ?? null
    );

    let profileWarnings = [];

    if (profileConfiguration) {
      const tableId = profileConfiguration.table.id;
      const formId = profileConfiguration.form.id;

      /*
       * The stored profile only accepts an in-place edit while it still lives in
       * the configured table and is active. If an administrator repointed the
       * profile at another table, or the row was archived, a fresh record is
       * written and the entity pointer follows it.
       */
      const reusable =
        current.profile &&
        current.profile.status === "active" &&
        Number(current.profile.tableId) === Number(tableId);

      if (reusable) {
        const result = await updateRecordInTransaction(
          connection,
          tableId,
          current.profile.recordId,
          { formId, values: patch.values },
          actor
        );

        profileWarnings = result.warnings;
      } else {
        const { recordId, warnings: mapped } = await createRecordInTransaction(
          connection,
          tableId,
          { formId, values: patch.values },
          actor,
          { entityResolved: true, organizationEntityId: entityId }
        );

        await setEntityProfileRecord(connection, entityId, recordId, actor?.userId ?? null);

        profileWarnings = mapped;
      }
    }

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "organization.entity.update",
      entityType: "organization_entity",
      entityId,
      summary: {
        changedKeys: Object.keys(patch),
        profileValueKeys: wantsProfile ? Object.keys(patch.values) : undefined,
      },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });

    return profileWarnings;
  });

  const entity = await getEntity(entityId, { includeConfigurations: true });

  return { ...entity, warnings };
}

/*
 * Archiving an entity also archives its profile record, so a withdrawn entity
 * stops appearing in the record list of the table it was stored in. Section
 * records are left alone: they belong to their own tables and are reviewed
 * there.
 */
export async function archiveEntity(entityId, actor) {
  const current = await getEntity(entityId, { includeConfigurations: false });

  if (current.status === "archived") return current;

  const childCount = await countActiveChildEntities(entityId);

  if (childCount > 0) {
    throw conflict(
      `This entity has ${childCount} active child record(s). Archive them first.`,
      { code: "ENTITY_HAS_CHILDREN" }
    );
  }

  await withTransaction(async (connection) => {
    await updateEntityRow(
      connection,
      entityId,
      { status: "archived" },
      actor?.userId ?? null
    );

    let profileRecordId = null;

    if (current.profile && current.profile.status === "active") {
      profileRecordId = current.profile.recordId;

      await archiveRecordById(connection, profileRecordId, actor?.userId ?? null);
    }

    await recordAudit({
      connection,
      actorUserId: actor?.userId ?? null,
      action: "organization.entity.archive",
      entityType: "organization_entity",
      entityId,
      summary: { entityTypeId: current.entityTypeId, profileRecordId },
      ipAddress: actor?.ipAddress ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  });

  return getEntity(entityId, { includeConfigurations: true });
}

/* ---------------------------------------------------------------- members */

export async function listEntityMembers(entityId) {
  const entity = await findEntityById(entityId);

  if (!entity) {
    throw notFound("Entity not found.", { code: "ENTITY_NOT_FOUND" });
  }

  return findEntityMembers(entityId);
}

export async function addEntityMember(entityId, payload, actor) {
  const entity = await findEntityById(entityId);

  if (!entity) {
    throw notFound("Entity not found.", { code: "ENTITY_NOT_FOUND" });
  }

  if (entity.status !== "active") {
    throw badRequest("Cannot add members to an archived entity.", { code: "ENTITY_ARCHIVED" });
  }

  const user = await findUserRowById(payload.userId);

  if (!user) {
    throw notFound("User not found.", { code: "USER_NOT_FOUND" });
  }

  if (user.status !== "active") {
    throw badRequest("Cannot add an inactive user as a member.", { code: "USER_INACTIVE" });
  }

  const existing = await findEntityMember(entityId, payload.userId);

  if (existing) {
    throw conflict("This user is already a member of this entity.", {
      code: "MEMBER_ALREADY_EXISTS",
    });
  }

  const role = payload.role || "member";

  const memberId = await withTransaction(async (connection) => {
    const insertedId = await insertEntityMember(connection, {
      entityId,
      userId: payload.userId,
      role,
      status: "active",
      actorUserId: actor?.userId,
    });

    await recordAudit({
      connection,
      actorUserId: actor?.userId,
      action: "organization.member.add",
      entityType: "organization_entity_member",
      entityId: insertedId,
      summary: {
        entityId,
        entityName: entity.name,
        userId: payload.userId,
        userEmail: user.email,
        role,
      },
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
    });

    return insertedId;
  });

  return findEntityMember(entityId, payload.userId);
}

export async function updateEntityMember(entityId, userId, patch, actor) {
  const entity = await findEntityById(entityId);

  if (!entity) {
    throw notFound("Entity not found.", { code: "ENTITY_NOT_FOUND" });
  }

  const current = await findEntityMember(entityId, userId);

  if (!current) {
    throw notFound("Membership record not found.", { code: "MEMBER_NOT_FOUND" });
  }

  await withTransaction(async (connection) => {
    await updateEntityMemberRow(connection, entityId, userId, patch, actor?.userId);

    await recordAudit({
      connection,
      actorUserId: actor?.userId,
      action: "organization.member.update",
      entityType: "organization_entity_member",
      entityId: current.id,
      summary: {
        entityId,
        userId,
        patch,
      },
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
    });
  });

  return findEntityMember(entityId, userId);
}

export async function removeEntityMember(entityId, userId, actor) {
  const entity = await findEntityById(entityId);

  if (!entity) {
    throw notFound("Entity not found.", { code: "ENTITY_NOT_FOUND" });
  }

  const current = await findEntityMember(entityId, userId);

  if (!current) {
    throw notFound("Membership record not found.", { code: "MEMBER_NOT_FOUND" });
  }

  await withTransaction(async (connection) => {
    await deleteEntityMemberRow(connection, entityId, userId);

    await recordAudit({
      connection,
      actorUserId: actor?.userId,
      action: "organization.member.remove",
      entityType: "organization_entity_member",
      entityId: current.id,
      summary: {
        entityId,
        entityName: entity.name,
        userId,
        userEmail: current.email,
      },
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
    });
  });

  return true;
}

export async function listUserMemberships(userId) {
  const user = await findUserRowById(userId);

  if (!user) {
    throw notFound("User not found.", { code: "USER_NOT_FOUND" });
  }

  return findUserMemberships(userId);
}

