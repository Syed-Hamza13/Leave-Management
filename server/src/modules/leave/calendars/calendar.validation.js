import { z } from "zod";

export const calendarSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  timezone: z.string().trim().default("Asia/Kolkata"),
  workingDaysJson: z.object({
    monday: z.boolean().default(true),
    tuesday: z.boolean().default(true),
    wednesday: z.boolean().default(true),
    thursday: z.boolean().default(true),
    friday: z.boolean().default(true),
    saturday: z.boolean().default(true),
    sunday: z.boolean().default(false),
  }),
  isDefault: z.boolean().default(false),
  status: z.enum(["active", "archived"]).default("active"),
});

export const updateCalendarSchema = calendarSchema.partial();

export const holidaySchema = z.object({
  calendarId: z.coerce.number().positive(),
  holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  name: z.string().trim().min(2).max(160),
  holidayType: z.enum(["mandatory", "optional"]).default("mandatory"),
  status: z.enum(["active", "archived"]).default("active"),
});
