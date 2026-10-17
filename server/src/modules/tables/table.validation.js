import { z } from "zod";

import { DATA_TYPE_KEYS } from "../../lib/dataTypes.js";

export const tableIdParamSchema = z.object({
  tableId: z.coerce.number().int().positive(),
});

export const columnIdParamSchema = z.object({
  tableId: z.coerce.number().int().positive(),
  columnId: z.coerce.number().int().positive(),
});

export const listTablesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["active", "archived"]).optional(),
  storageKind: z.enum(["managed", "system_users"]).optional(),
  includeColumns: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const createTableSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,62}$/)
    .optional(),
  label: z.string().trim().min(1, "Table name is required").max(160),
  description: z.string().trim().max(500).nullish(),
});

export const updateTableSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(500).nullish(),
    displayColumnKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,62}$/)
      .nullable()
      .optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const createColumnSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,62}$/)
    .optional(),
  label: z.string().trim().min(1, "Column name is required").max(160),
  description: z.string().trim().max(500).nullish(),
  dataType: z.enum(DATA_TYPE_KEYS, { message: "Unsupported column type" }),
  config: z.record(z.string(), z.unknown()).optional(),
  isRequired: z.boolean().optional(),
  isSearchable: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  /*
   * Present when the column pulls values from another logical table, which is
   * how relations are expressed in the builder.
   */
  relationTableId: z.coerce.number().int().positive().optional(),
});

export const updateColumnSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(500).nullish(),
    dataType: z.enum(DATA_TYPE_KEYS).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    isRequired: z.boolean().optional(),
    isSearchable: z.boolean().optional(),
    isFilterable: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    relationTableId: z.coerce.number().int().positive().nullable().optional(),
    relationPolicy: z.enum(["single", "multiple"]).nullable().optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const reorderColumnsSchema = z.object({
  columnIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
});
