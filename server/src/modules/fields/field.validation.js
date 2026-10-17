import { z } from "zod";

import { DATA_TYPE_KEYS } from "../../lib/dataTypes.js";

export const fieldIdParamSchema = z.object({
  fieldId: z.coerce.number().int().positive(),
});

export const listFieldsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["active", "archived"]).optional(),
  dataType: z.enum(DATA_TYPE_KEYS).optional(),
});

/*
 * `key` is accepted on create only. Once a definition is stored its key is the
 * stable identifier used inside record payloads, so it is never editable.
 */
export const createFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,62}$/, "Key must be lowercase letters, numbers or underscores.")
    .optional(),
  label: z.string().trim().min(1, "Label is required").max(160),
  description: z.string().trim().max(500).nullish(),
  dataType: z.enum(DATA_TYPE_KEYS, { message: "Unsupported field type" }),
  config: z.record(z.string(), z.unknown()).optional(),
  isRequired: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  helpText: z.string().trim().max(500).nullish(),
});

export const updateFieldSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(500).nullish(),
    dataType: z.enum(DATA_TYPE_KEYS).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    isRequired: z.boolean().optional(),
    defaultValue: z.unknown().optional(),
    helpText: z.string().trim().max(500).nullish(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });
