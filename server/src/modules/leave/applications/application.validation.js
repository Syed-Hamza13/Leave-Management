import { z } from "zod";

export const applyLeaveSchema = z.object({
  leaveTypeId: z.coerce.number().positive().optional(),
  leave_type_id: z.coerce.number().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD").optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD").optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD").optional(),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters").max(1000),
  emergencyFlag: z.boolean().optional(),
  emergency_flag: z.boolean().optional(),
  isHalfDay: z.boolean().optional(),
  is_half_day: z.boolean().optional(),
  halfDayType: z.enum(["FIRST_HALF", "SECOND_HALF"]).optional().nullable(),
  half_day_type: z.enum(["FIRST_HALF", "SECOND_HALF"]).optional().nullable(),
  hours: z.coerce.number().positive().optional().nullable(),
  customData: z.record(z.any()).optional().nullable(),
  custom_data: z.record(z.any()).optional().nullable(),
}).transform((data) => ({
  leaveTypeId: data.leaveTypeId || data.leave_type_id,
  startDate: data.startDate || data.start_date,
  endDate: data.endDate || data.end_date,
  reason: data.reason,
  emergencyFlag: Boolean(data.emergencyFlag ?? data.emergency_flag ?? false),
  isHalfDay: Boolean(data.isHalfDay ?? data.is_half_day ?? false),
  halfDayType: data.halfDayType || data.half_day_type || null,
  hours: data.hours ?? null,
  customData: data.customData || data.custom_data || null,
})).refine((d) => d.leaveTypeId && d.startDate && d.endDate, {
  message: "leaveTypeId, startDate, and endDate are required",
});

export const calculateLeaveSchema = z.object({
  leaveTypeId: z.coerce.number().positive().optional(),
  leave_type_id: z.coerce.number().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD").optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD").optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD").optional(),
  emergencyFlag: z.boolean().optional(),
  emergency_flag: z.boolean().optional(),
  isHalfDay: z.boolean().optional(),
  is_half_day: z.boolean().optional(),
  halfDayType: z.enum(["FIRST_HALF", "SECOND_HALF"]).optional().nullable(),
  half_day_type: z.enum(["FIRST_HALF", "SECOND_HALF"]).optional().nullable(),
  hours: z.coerce.number().positive().optional().nullable(),
  customData: z.record(z.any()).optional().nullable(),
  custom_data: z.record(z.any()).optional().nullable(),
}).transform((data) => ({
  leaveTypeId: data.leaveTypeId || data.leave_type_id,
  startDate: data.startDate || data.start_date,
  endDate: data.endDate || data.end_date,
  emergencyFlag: Boolean(data.emergencyFlag ?? data.emergency_flag ?? false),
  isHalfDay: Boolean(data.isHalfDay ?? data.is_half_day ?? false),
  halfDayType: data.halfDayType || data.half_day_type || null,
  hours: data.hours ?? null,
  customData: data.customData || data.custom_data || null,
})).refine((d) => d.leaveTypeId && d.startDate && d.endDate, {
  message: "leaveTypeId, startDate, and endDate are required",
});

export const approvalActionSchema = z.object({
  comments: z.string().trim().max(1000).optional().nullable(),
});

export const rejectionActionSchema = z.object({
  comments: z.string().trim().min(3, "Rejection reason is required").max(1000),
});
