import { z } from "zod";

export const dropdownIdParamSchema = z.object({
  dropdownId: z.coerce.number().int().positive(),
});

export const optionIdParamSchema = z.object({
  dropdownId: z.coerce.number().int().positive(),
  optionId: z.coerce.number().int().positive(),
});

export const listDropdownsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["active", "archived"]).optional(),
  includeOptions: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const createDropdownSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,62}$/)
    .optional(),
  label: z.string().trim().min(1, "Label is required").max(160),
  description: z.string().trim().max(500).nullish(),
  options: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(190),
        label: z.string().trim().min(1).max(190),
      })
    )
    .max(200)
    .optional(),
});

export const updateDropdownSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(500).nullish(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const createOptionSchema = z.object({
  value: z
    .string()
    .trim()
    .min(1, "Option value is required")
    .max(190)
    .regex(/^[a-z0-9][a-z0-9_-]{0,189}$/i, "Use letters, numbers, hyphens or underscores."),
  label: z.string().trim().min(1, "Option label is required").max(190),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

/*
 * `value` is intentionally absent: it is the identifier stored inside records,
 * so changing it would orphan existing data. Labels and ordering stay editable.
 */
export const updateOptionSchema = z
  .object({
    label: z.string().trim().min(1).max(190).optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const reorderOptionsSchema = z.object({
  optionIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
});
