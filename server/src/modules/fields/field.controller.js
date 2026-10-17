import { ok, created, okList } from "../../lib/responses.js";
import { parsePagination, parseSearch } from "../../lib/pagination.js";
import {
  listFieldsQuerySchema,
  createFieldSchema,
  updateFieldSchema,
  fieldIdParamSchema,
} from "./field.validation.js";
import {
  listFields,
  getField,
  createField,
  updateFieldDefinition,
  archiveField,
  getFieldUsage,
} from "./field.service.js";

function actorFrom(req) {
  return {
    userId: req.currentUserId ?? req.session?.user?.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export async function listFieldsHandler(req, res, next) {
  try {
    const query = listFieldsQuerySchema.parse(req.query);
    const pagination = parsePagination(query);

    const { fields, total } = await listFields({
      limit: pagination.limit,
      offset: pagination.offset,
      search: parseSearch(query) || undefined,
      status: query.status,
      dataType: query.dataType,
    });

    return okList(res, fields, pagination, total);
  } catch (error) {
    return next(error);
  }
}

export async function getFieldHandler(req, res, next) {
  try {
    const { fieldId } = fieldIdParamSchema.parse(req.params);

    return ok(res, await getField(fieldId));
  } catch (error) {
    return next(error);
  }
}

export async function createFieldHandler(req, res, next) {
  try {
    const payload = createFieldSchema.parse(req.body);

    return created(res, await createField(payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateFieldHandler(req, res, next) {
  try {
    const { fieldId } = fieldIdParamSchema.parse(req.params);
    const payload = updateFieldSchema.parse(req.body);

    return ok(res, await updateFieldDefinition(fieldId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function archiveFieldHandler(req, res, next) {
  try {
    const { fieldId } = fieldIdParamSchema.parse(req.params);

    return ok(res, await archiveField(fieldId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function fieldUsageHandler(req, res, next) {
  try {
    const { fieldId } = fieldIdParamSchema.parse(req.params);

    return ok(res, await getFieldUsage(fieldId));
  } catch (error) {
    return next(error);
  }
}
