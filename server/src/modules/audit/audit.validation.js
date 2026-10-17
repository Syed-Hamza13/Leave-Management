import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const listAuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  entityType: z.string().trim().min(1).max(60).optional(),
  entityId: z.string().trim().min(1).max(64).optional(),
  actorUserId: z.coerce.number().int().positive().optional(),
  from: z.string().trim().regex(DATE_PATTERN).optional(),
  to: z.string().trim().regex(DATE_PATTERN).optional(),
});
