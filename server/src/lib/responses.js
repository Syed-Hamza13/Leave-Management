import { buildPageMeta } from "./pagination.js";

/*
 * Standard success envelope.
 *
 * New endpoints always answer with { success, data } and, for lists,
 * { success, data, meta }. The existing auth endpoints keep their historical
 * shape so the signed-in client does not break.
 */
export function ok(res, data) {
  return res.json({ success: true, data });
}

export function created(res, data) {
  return res.status(201).json({ success: true, data });
}

export function okList(res, data, pagination, total) {
  return res.json({
    success: true,
    data,
    meta: buildPageMeta({
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    }),
  });
}

export function okMessage(res, message, data = null) {
  return res.json({ success: true, message, data });
}
