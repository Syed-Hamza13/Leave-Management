import { z } from "zod";

export const sectionKeyParamSchema = z.object({
  sectionKey: z
    .string()
    .trim()
    .min(1, "Section key is required.")
    .max(63, "Section key must not exceed 63 characters.")
    .regex(/^[a-z0-9_-]+$/i, "Invalid section key format."),
});

export const saveSectionConfigSchema = z.object({
  label: z.string().trim().min(1, "Label is required.").max(160),
  formId: z.coerce.number().int().positive("Choose a valid form."),
  tableId: z.coerce.number().int().positive("Choose a valid table."),
  mappingId: z.coerce.number().int().positive("A valid mapping between form and table is required."),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
});
