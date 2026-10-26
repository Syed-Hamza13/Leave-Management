import { z } from "zod";

export const leaveTypeSchema = z.object({
  policyId: z.coerce.number().positive(),
  typeKey: z.string().trim().min(2).max(64).regex(/^[a-z0-9_-]+$/i, "Must be alphanumeric, hyphens or underscores"),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  unit: z.enum(["day", "hour"]).default("day"),
  paidStatus: z.enum(["paid", "unpaid", "partial"]).default("paid"),
  requiresBalance: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  allowsHalfDay: z.boolean().default(true),
  allowsPartialDay: z.boolean().default(false),
  carryForwardEnabled: z.boolean().default(false),
  encashmentEnabled: z.boolean().default(false),
  maxBalance: z.coerce.number().positive().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  status: z.enum(["active", "archived"]).default("active"),
});

export const updateLeaveTypeSchema = leaveTypeSchema.partial().omit({ policyId: true, typeKey: true });
