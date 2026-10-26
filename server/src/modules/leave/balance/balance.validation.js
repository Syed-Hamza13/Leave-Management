import { z } from "zod";
import { TRANSACTION_TYPE } from "../leave.constants.js";

export const manualAdjustmentSchema = z.object({
  balanceId: z.coerce.number().positive(),
  quantity: z.coerce.number(), // positive or negative
  transactionType: z.enum([
    TRANSACTION_TYPE.ADJUSTMENT,
    TRANSACTION_TYPE.ACCRUAL,
    TRANSACTION_TYPE.CARRY_FORWARD,
    TRANSACTION_TYPE.EXPIRY,
    TRANSACTION_TYPE.ENCASHMENT,
  ]).default(TRANSACTION_TYPE.ADJUSTMENT),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters").max(255),
});

export const createBalanceSchema = z.object({
  userId: z.coerce.number().positive(),
  leaveTypeId: z.coerce.number().positive(),
  policyId: z.coerce.number().positive(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingBalance: z.coerce.number().default(0),
  unit: z.enum(["day", "hour"]).default("day"),
});
