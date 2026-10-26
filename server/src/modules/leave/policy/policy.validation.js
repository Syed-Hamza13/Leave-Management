import { z } from "zod";

export const policySchema = z.object({
  policyKey: z.string().trim().min(2).max(64).regex(/^[a-z0-9_-]+$/i, "Must be alphanumeric, hyphens or underscores"),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  calendarId: z.coerce.number().positive(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  version: z.coerce.number().int().positive().default(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional().nullable(),
  isDefault: z.boolean().default(false),
});

export const updatePolicySchema = policySchema.partial().omit({ policyKey: true });

export const policyAssignmentSchema = z.object({
  policyId: z.coerce.number().positive(),
  userId: z.coerce.number().positive().optional().nullable(),
  organizationEntityId: z.coerce.number().positive().optional().nullable(),
  conditionsJson: z.record(z.any()).optional().nullable(),
  priority: z.coerce.number().int().default(0),
  status: z.enum(["active", "archived"]).default("active"),
});
