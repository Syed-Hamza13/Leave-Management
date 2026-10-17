import { ok, created, okList } from "../../lib/responses.js";
import {
  createRecordSchema,
  facetQuerySchema,
  listRecordsQuerySchema,
  recordIdParamSchema,
  tableIdParamSchema,
  updateRecordSchema,
} from "./record.validation.js";
import {
  archiveRecord,
  createRecord,
  getRecord,
  listFacetValues,
  listRecords,
  updateRecord,
} from "./record.service.js";

function actorFrom(req) {
  return {
    userId: req.currentUserId ?? req.session?.user?.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export async function listRecordsHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);
    const query = listRecordsQuerySchema.parse(req.query);

    const { records, total, pagination } = await listRecords(tableId, query);

    return okList(res, records, pagination, total);
  } catch (error) {
    return next(error);
  }
}

export async function getRecordHandler(req, res, next) {
  try {
    const { tableId, recordId } = recordIdParamSchema.parse(req.params);

    return ok(res, await getRecord(tableId, recordId));
  } catch (error) {
    return next(error);
  }
}

export async function createRecordHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);
    const payload = createRecordSchema.parse(req.body);

    return created(res, await createRecord(tableId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function updateRecordHandler(req, res, next) {
  try {
    const { tableId, recordId } = recordIdParamSchema.parse(req.params);
    const payload = updateRecordSchema.parse(req.body);

    return ok(res, await updateRecord(tableId, recordId, payload, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function archiveRecordHandler(req, res, next) {
  try {
    const { tableId, recordId } = recordIdParamSchema.parse(req.params);

    return ok(res, await archiveRecord(tableId, recordId, actorFrom(req)));
  } catch (error) {
    return next(error);
  }
}

export async function facetValuesHandler(req, res, next) {
  try {
    const { tableId } = tableIdParamSchema.parse(req.params);
    const query = facetQuerySchema.parse(req.query);

    const { values, total, pagination } = await listFacetValues(tableId, query);

    return okList(res, values, pagination, total);
  } catch (error) {
    return next(error);
  }
}
