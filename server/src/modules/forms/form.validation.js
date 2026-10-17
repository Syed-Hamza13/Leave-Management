import { z } from "zod";

export const formIdParamSchema = z.object({
  formId: z.coerce.number().int().positive(),
});

export const listFormsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["active", "archived"]).optional(),
  includeFields: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

/*
 * Array order is the persisted display order, so a drag-and-drop save is just a
 * re-ordered array. Keyboard reorder controls produce the same payload.
 */
const formFieldEntrySchema = z.object({
  fieldId: z.coerce.number().int().positive(),
  isRequired: z.boolean().nullish(),
  label: z.string().trim().min(1).max(160).nullish(),
  helpText: z.string().trim().max(500).nullish(),
  config: z.record(z.string(), z.unknown()).nullish(),
});

export const createFormSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,62}$/)
    .optional(),
  label: z.string().trim().min(1, "Form name is required").max(160),
  description: z.string().trim().max(500).nullish(),
  submitLabel: z.string().trim().min(1).max(60).optional(),
  cancelLabel: z.string().trim().min(1).max(60).optional(),
  fields: z.array(formFieldEntrySchema).max(100).optional(),
});

export const updateFormSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(500).nullish(),
    submitLabel: z.string().trim().min(1).max(60).optional(),
    cancelLabel: z.string().trim().min(1).max(60).optional(),
    status: z.enum(["active", "archived"]).optional(),
    fields: z.array(formFieldEntrySchema).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });
