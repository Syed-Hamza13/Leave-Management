import { z } from "zod";
import { APPROVAL_MODE, APPROVER_TYPE } from "../leave.constants.js";

export const workflowSchema = z.object({
  policyId: z.coerce.number().positive(),
  workflowKey: z.string().trim().min(2).max(64).regex(/^[a-z0-9_-]+$/i),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  conditionsJson: z.record(z.any()).optional().nullable(),
  status: z.enum(["active", "archived"]).default("active"),
});

export const workflowStepSchema = z.object({
  workflowId: z.coerce.number().positive(),
  stepOrder: z.coerce.number().int().positive().default(1),
  approvalMode: z.enum([
    APPROVAL_MODE.SEQUENTIAL,
    APPROVAL_MODE.PARALLEL_ALL,
    APPROVAL_MODE.PARALLEL_ANY,
  ]).default(APPROVAL_MODE.SEQUENTIAL),
  approverType: z.enum([
    APPROVER_TYPE.SPECIFIC_USER,
    APPROVER_TYPE.USER_MANAGER,
    APPROVER_TYPE.ENTITY_LEAD,
    APPROVER_TYPE.ENTITY_ROLE,
    APPROVER_TYPE.ROLE,
    APPROVER_TYPE.COMMITTEE,
  ]),
  approverConfigJson: z.record(z.any()).default({}),
  timeoutHours: z.coerce.number().int().positive().optional().nullable(),
});
