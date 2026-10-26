import { z } from "zod";
import { RULE_TYPE } from "../leave.constants.js";

export const ruleSchema = z.object({
  policyId: z.coerce.number().positive(),
  leaveTypeId: z.coerce.number().positive().optional().nullable(),
  ruleKey: z.string().trim().min(2).max(64).regex(/^[a-z0-9_-]+$/i, "Must be alphanumeric, hyphens or underscores"),
  ruleType: z.enum([
    RULE_TYPE.ENTITLEMENT,
    RULE_TYPE.ELIGIBILITY,
    RULE_TYPE.NOTICE_PERIOD,
    RULE_TYPE.MIN_DURATION,
    RULE_TYPE.MAX_DURATION,
    RULE_TYPE.SANDWICH,
    RULE_TYPE.DOCUMENT_REQUIRED,
    RULE_TYPE.CARRY_FORWARD,
    RULE_TYPE.MAX_ACCUMULATION,
    RULE_TYPE.LWP_CONVERSION,
  ]),
  priority: z.coerce.number().int().default(0),
  configJson: z.record(z.any()),
  status: z.enum(["active", "archived"]).default("active"),
});

export const updateRuleSchema = ruleSchema.partial().omit({ policyId: true, ruleKey: true });
