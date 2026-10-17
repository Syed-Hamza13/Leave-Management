import { okList } from "../../lib/responses.js";
import { parsePagination } from "../../lib/pagination.js";
import { listAuditEvents } from "./audit.service.js";
import { listAuditQuerySchema } from "./audit.validation.js";

export async function listAudit(req, res, next) {
  try {
    const query = listAuditQuerySchema.parse(req.query);
    const pagination = parsePagination(query);

    const { events, total } = await listAuditEvents({
      limit: pagination.limit,
      offset: pagination.offset,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      actorUserId: query.actorUserId,
      from: query.from ? `${query.from} 00:00:00.000` : undefined,
      /*
       * created_at carries a time component, so an inclusive upper bound needs
       * the end of the requested day rather than its midnight.
       */
      to: query.to ? `${query.to} 23:59:59.999` : undefined,
    });

    return okList(res, events, pagination, total);
  } catch (error) {
    return next(error);
  }
}
