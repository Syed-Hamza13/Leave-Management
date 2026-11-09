import { z } from "zod";

export const leavePreviewSchema = z.object({
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().optional(),
  session: z.string().optional().default("full_day"),
  leaveType: z.string().optional().default("Privilege Leave"),
  isEmergency: z.boolean().optional().default(false),
});

export const leaveSubmitSchema = z.object({
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().optional(),
  session: z.string().optional().default("full_day"),
  leaveType: z.string().min(1, "Leave type is required."),
  isEmergency: z.boolean().optional().default(false),
  reason: z.string().max(2000, "Reason must not exceed 2000 characters.").optional().default(""),
});

export const leaveActionSchema = z.object({
  remarks: z.string().max(1000).optional().default(""),
});

export const leaveRulesSchema = z.object({
  rules: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1, "Rule name is required."),
      priority: z.coerce.number().int().default(100),
      status: z.enum(["active", "inactive"]).default("active"),
      conditions: z.array(z.any()).default([]),
      combinator: z.enum(["AND", "OR"]).default("AND"),
      actions: z.object({
        requiresApproval: z.boolean().default(true),
        approverType: z.string().optional(),
        approverTarget: z.string().optional(),
        inchargeField: z.string().optional(),
        entityName: z.string().optional(),
        userId: z.union([z.number(), z.string()]).optional(),
        fallbackUserId: z.union([z.number(), z.string()]).optional(),
        notifyTargets: z.array(z.any()).optional().default([]),
        noticeDays: z.coerce.number().int().optional().default(2),
        slaHours: z.coerce.number().int().optional().default(48),
      }),
    })
  ),
});

export const workflowConfigSchema = z.object({
  workingDaysPerWeek: z.coerce.number().min(1).max(7).optional().default(6),
  weeklyOffDays: z.array(z.coerce.number()).optional().default([0]),
  sandwichThresholdDays: z.coerce.number().min(0).optional().default(7),
  leastCountDays: z.coerce.number().optional().default(0.5),
  shortLeaveHours: z.coerce.number().optional().default(2),
  shortLeaveSlotsPerYear: z.coerce.number().optional().default(24),
  maxAccumulationDays: z.coerce.number().optional().default(180),
  defaultNoticeDaysNormal: z.coerce.number().optional().default(2),
  defaultNoticeDaysLong: z.coerce.number().optional().default(7),
  approverSlaHours: z.coerce.number().optional().default(48),
});

