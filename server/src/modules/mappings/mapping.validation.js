import { z } from "zod";

export const mappingIdParamSchema = z.object({
  mappingId: z.coerce.number().int().positive(),
});

export const listMappingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["active", "archived"]).optional(),
  formId: z.coerce.number().int().positive().optional(),
  tableId: z.coerce.number().int().positive().optional(),
});

export const compatibilityQuerySchema = z.object({
  formId: z.coerce.number().int().positive(),
  tableId: z.coerce.number().int().positive(),
});

export const saveMappingSchema = z.object({
  formId: z.coerce.number().int().positive(),
  tableId: z.coerce.number().int().positive(),
  label: z.string().trim().max(160).nullish(),
  entries: z
    .array(
      z.object({
        formFieldId: z.coerce.number().int().positive(),
        columnId: z.coerce.number().int().positive(),
      })
    )
    .max(100),
});

export const updateMappingSchema = z
  .object({
    label: z.string().trim().max(160).nullish(),
    status: z.enum(["active", "archived"]).optional(),
    entries: z
      .array(
        z.object({
          formFieldId: z.coerce.number().int().positive(),
          columnId: z.coerce.number().int().positive(),
        })
      )
      .max(100)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });
