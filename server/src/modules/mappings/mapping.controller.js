import { ok, okList } from "../../lib/responses.js";
import { parsePagination, parseSearch } from "../../lib/pagination.js";
import {
  listMappingsQuerySchema,
  compatibilityQuerySchema,
  saveMappingSchema,
  updateMappingSchema,
  mappingIdParamSchema,
} from "./mapping.validation.js";
import { z } from "zod";
import {
  listMappings,
  getMapping,
  saveMapping,
  updateMapping,
  deleteMapping,
  getMappingCompatibility,
  getActiveMappingWithEntries,
} from "./mapping.service.js";

const formTableParamSchema = z.object({
  formId: z.coerce.number().int().positive(),
  tableId: z.coerce.number().int().positive(),
});

function actorFrom(req) {
  return {
    userId: req.currentUserId ?? req.session?.user?.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export async function listMappingsHandler(req, res, next) {
  try {
    const query = listMappingsQuerySchema.parse(req.query);
    const pagination = parsePagination(query);

    const { mappings, total } = await listMappings({
      limit: pagination.limit,
      offset: pagination.offset,
      search: parseSearch(query) || undefined,
      status: query.status,
      formId: query.formId,
      tableId: query.tableId,
    });

    return okList(res, mappings, pagination, total);
  } catch (error) {
    return next(error);
  }
}

export async function compatibilityHandler(req, res, next) {
  try {
    const { formId, tableId } = compatibilityQuerySchema.parse(req.query);

    return ok(res, await getMappingCompatibility(formId, tableId));
  } catch (error) {
    return next(error);
  }
}

export async function saveMappingHandler(req, res, next) {
  try {
    const payload = saveMappingSchema.parse(req.body);

    return ok(res, await saveMapping(payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function getMappingHandler(req, res, next) {
  try {
    const { mappingId } = mappingIdParamSchema.parse(req.params);

    return ok(res, await getMapping(mappingId));
  } catch (error) {
    return next(error);
  }
}

export async function getMappingForPairHandler(req, res, next) {
  try {
    const { formId, tableId } = formTableParamSchema.parse(req.params);

    return ok(res, await getActiveMappingWithEntries(formId, tableId));
  } catch (error) {
    return next(error);
  }
}

export async function updateMappingHandler(req, res, next) {
  try {
    const { mappingId } = mappingIdParamSchema.parse(req.params);
    const payload = updateMappingSchema.parse(req.body);

    return ok(res, await updateMapping(mappingId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function deleteMappingHandler(req, res, next) {
  try {
    const { mappingId } = mappingIdParamSchema.parse(req.params);

    return ok(res, await deleteMapping(mappingId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}
