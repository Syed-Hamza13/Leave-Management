import { ok, created, okList } from "../../lib/responses.js";
import { parsePagination, parseSearch } from "../../lib/pagination.js";
import {
  entityTypeIdParamSchema,
  entityIdParamSchema,
  configurationIdParamSchema,
  listEntityTypesQuerySchema,
  createEntityTypeSchema,
  updateEntityTypeSchema,
  createConfigurationSchema,
  updateConfigurationSchema,
  listEntitiesQuerySchema,
  createEntitySchema,
  updateEntitySchema,
} from "./organization.validation.js";
import {
  listEntityTypes,
  getEntityType,
  createEntityType,
  updateEntityTypeDefinition,
  archiveEntityType,
  listConfigurations,
  createConfiguration,
  updateConfiguration,
  deleteConfiguration,
  listEntities,
  getEntity,
  createEntity,
  updateEntity,
  archiveEntity,
} from "./organization.service.js";

function actorFrom(req) {
  return {
    userId: req.currentUserId ?? req.session?.user?.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export async function listEntityTypesHandler(req, res, next) {
  try {
    const query = listEntityTypesQuerySchema.parse(req.query);
    const pagination = parsePagination(query);

    const { entityTypes, total } = await listEntityTypes({
      limit: pagination.limit,
      offset: pagination.offset,
      search: parseSearch(query) || undefined,
      status: query.status,
      parentTypeId: query.parentTypeId,
    });

    return okList(res, entityTypes, pagination, total);
  } catch (error) {
    return next(error);
  }
}

export async function getEntityTypeHandler(req, res, next) {
  try {
    const { entityTypeId } = entityTypeIdParamSchema.parse(req.params);

    return ok(res, await getEntityType(entityTypeId));
  } catch (error) {
    return next(error);
  }
}

export async function createEntityTypeHandler(req, res, next) {
  try {
    const payload = createEntityTypeSchema.parse(req.body);

    return created(res, await createEntityType(payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateEntityTypeHandler(req, res, next) {
  try {
    const { entityTypeId } = entityTypeIdParamSchema.parse(req.params);
    const payload = updateEntityTypeSchema.parse(req.body);

    return ok(res, await updateEntityTypeDefinition(entityTypeId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function archiveEntityTypeHandler(req, res, next) {
  try {
    const { entityTypeId } = entityTypeIdParamSchema.parse(req.params);

    return ok(res, await archiveEntityType(entityTypeId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function listConfigurationsHandler(req, res, next) {
  try {
    const { entityTypeId } = entityTypeIdParamSchema.parse(req.params);

    const configurations = await listConfigurations(entityTypeId, {
      scope: req.query.scope === "profile" || req.query.scope === "section"
        ? req.query.scope
        : null,
    });

    return ok(res, configurations);
  } catch (error) {
    return next(error);
  }
}

export async function createConfigurationHandler(req, res, next) {
  try {
    const { entityTypeId } = entityTypeIdParamSchema.parse(req.params);
    const payload = createConfigurationSchema.parse(req.body);

    return created(
      res,
      await createConfiguration(entityTypeId, payload, actorFrom(req))
    );
  } catch (error) {
    return next(error);
  }
}

export async function updateConfigurationHandler(req, res, next) {
  try {
    const { configurationId } = configurationIdParamSchema.parse(req.params);
    const payload = updateConfigurationSchema.parse(req.body);

    return ok(res, await updateConfiguration(configurationId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function deleteConfigurationHandler(req, res, next) {
  try {
    const { configurationId } = configurationIdParamSchema.parse(req.params);

    return ok(res, await deleteConfiguration(configurationId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function listEntitiesHandler(req, res, next) {
  try {
    const query = listEntitiesQuerySchema.parse(req.query);
    const pagination = parsePagination(query);

    const { entities, total } = await listEntities({
      limit: pagination.limit,
      offset: pagination.offset,
      search: parseSearch(query) || undefined,
      status: query.status || "active",
      entityTypeId: query.entityTypeId,
      parentEntityId: query.parentEntityId,
    });

    return okList(res, entities, pagination, total);
  } catch (error) {
    return next(error);
  }
}

export async function getEntityHandler(req, res, next) {
  try {
    const { entityId } = entityIdParamSchema.parse(req.params);

    return ok(res, await getEntity(entityId, { includeConfigurations: true }));
  } catch (error) {
    return next(error);
  }
}

export async function createEntityHandler(req, res, next) {
  try {
    const payload = createEntitySchema.parse(req.body);

    return created(res, await createEntity(payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateEntityHandler(req, res, next) {
  try {
    const { entityId } = entityIdParamSchema.parse(req.params);
    const payload = updateEntitySchema.parse(req.body);

    return ok(res, await updateEntity(entityId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function archiveEntityHandler(req, res, next) {
  try {
    const { entityId } = entityIdParamSchema.parse(req.params);

    return ok(res, await archiveEntity(entityId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}
