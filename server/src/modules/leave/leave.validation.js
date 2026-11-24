import { z } from "zod";

export const leavePreviewSchema = z
  .object({
    applicantId: z.coerce.number().optional(),
    startDate: z.string().min(1, "Start date is required."),
    endDate: z.string().optional(),
    session: z.string().optional().default("full_day"),
    leaveType: z.string().optional().default("Privilege Leave"),
    isEmergency: z.boolean().optional().default(false),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be earlier than start date.",
    path: ["endDate"],
  });

export const leaveSubmitSchema = z
  .object({
    startDate: z.string().min(1, "Start date is required."),
    endDate: z.string().optional(),
    session: z.string().optional().default("full_day"),
    leaveType: z.string().min(1, "Leave type is required."),
    isEmergency: z.boolean().optional().default(false),
    reason: z.string().max(2000, "Reason must not exceed 2000 characters.").optional().default(""),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be earlier than start date.",
    path: ["endDate"],
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
      actions: z
        .object({
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
        })
        .passthrough(),
    })
  ),
});

