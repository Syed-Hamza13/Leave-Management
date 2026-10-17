import { z } from "zod";

import { MAX_PAGE_SIZE } from "../../lib/pagination.js";

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;

/*
 * Profile values travel through the same mapped-submission path as any other
 * record write, so the bound mirrors the record module rather than introducing
 * a second limit that could drift from it.
 */
const MAX_PROFILE_VALUES = 200;

const MAX_SORT_ORDER = 1_000_000;

const paginationQuery = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["active", "archived"]).optional(),
};

export const entityTypeIdParamSchema = z.object({
  entityTypeId: z.coerce.number().int().positive(),
});

export const entityIdParamSchema = z.object({
  entityId: z.coerce.number().int().positive(),
});

export const configurationIdParamSchema = z.object({
  configurationId: z.coerce.number().int().positive(),
});

export const listEntityTypesQuerySchema = z.object({
  ...paginationQuery,
  parentTypeId: z.coerce.number().int().positive().optional(),
});

export const createEntityTypeSchema = z.object({
  key: z.string().trim().regex(KEY_PATTERN).optional(),
  label: z.string().trim().min(1, "Entity type name is required").max(160),
  description: z.string().trim().max(500).nullish(),
  parentTypeId: z.coerce.number().int().positive().nullish(),
});

export const updateEntityTypeSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(500).nullish(),
    parentTypeId: z.coerce.number().int().positive().nullish(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const listEntitiesQuerySchema = z.object({
  ...paginationQuery,
  entityTypeId: z.coerce.number().int().positive().optional(),
  parentEntityId: z.coerce.number().int().positive().optional(),
});

export const createConfigurationSchema = z.object({
  scope: z.enum(["profile", "section"]).default("section"),
  label: z.string().trim().min(1, "A configuration label is required").max(160),
  formId: z.coerce.number().int().positive(),
  tableId: z.coerce.number().int().positive(),
  mappingId: z.coerce.number().int().positive(),
  sortOrder: z.coerce.number().int().min(0).max(MAX_SORT_ORDER).optional(),
  isActive: z.boolean().optional(),
});

export const updateConfigurationSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    formId: z.coerce.number().int().positive().optional(),
    tableId: z.coerce.number().int().positive().optional(),
    mappingId: z.coerce.number().int().positive().optional(),
    sortOrder: z.coerce.number().int().min(0).max(MAX_SORT_ORDER).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

const profileValuesSchema = z.record(z.string().trim().regex(KEY_PATTERN), z.unknown());

export const createEntitySchema = z
  .object({
    entityTypeId: z.coerce.number().int().positive(),
    name: z.string().trim().min(1, "Entity name is required").max(190),
    parentEntityId: z.coerce.number().int().positive().nullish(),
    sortOrder: z.coerce.number().int().min(0).max(MAX_SORT_ORDER).optional(),
    values: profileValuesSchema.optional(),
  })
  .refine((payload) => !payload.values || Object.keys(payload.values).length <= MAX_PROFILE_VALUES, {
    message: `A profile accepts a maximum of ${MAX_PROFILE_VALUES} values.`,
    path: ["values"],
  });

export const updateEntitySchema = z
  .object({
    name: z.string().trim().min(1).max(190).optional(),
    parentEntityId: z.coerce.number().int().positive().nullish(),
    sortOrder: z.coerce.number().int().min(0).max(MAX_SORT_ORDER).optional(),
    values: profileValuesSchema.optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine((payload) => !payload.values || Object.keys(payload.values).length <= MAX_PROFILE_VALUES, {
    message: `A profile accepts a maximum of ${MAX_PROFILE_VALUES} values.`,
    path: ["values"],
  });
