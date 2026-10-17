import { z } from "zod";

import { FILTER_OPERATORS } from "../../lib/dataTypes.js";
import {
  MAX_FILTERS,
  MAX_PAGE_SIZE,
  MAX_SORT_COLUMNS,
} from "../../lib/pagination.js";

/*
 * Operators are enumerated from the data type registry so the accepted list can
 * never drift from what the query builder knows how to render.
 */
const OPERATOR_KEYS = [
  ...new Set(
    Object.values(FILTER_OPERATORS).flatMap((entries) =>
      entries.map((entry) => entry.key)
    )
  ),
];

const COLUMN_KEY_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;

const MAX_SORT_TERMS = MAX_SORT_COLUMNS;

/*
 * A record payload is bounded here and re-checked against the live column
 * definitions in the service, because a definition can change between the
 * browser loading a form and submitting it.
 */
const MAX_VALUES_PER_RECORD = 200;

export const tableIdParamSchema = z.object({
  tableId: z.coerce.number().int().positive(),
});

export const recordIdParamSchema = z.object({
  tableId: z.coerce.number().int().positive(),
  recordId: z.coerce.number().int().positive(),
});

const recordFilterSchema = z.object({
  column: z.string().trim().regex(COLUMN_KEY_PATTERN),
  operator: z.enum(OPERATOR_KEYS),
  value: z.unknown().optional(),
});

/*
 * Filters arrive as one JSON array in the query string. Anything that is not a
 * JSON array is turned into a non-array value so the array schema reports a
 * normal validation failure instead of a 500.
 */
const filtersSchema = z.preprocess((raw) => {
  if (raw === undefined || raw === null || raw === "") return [];

  if (Array.isArray(raw)) return raw;

  if (typeof raw !== "string") return { invalid: true };

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : { invalid: true };
  } catch {
    return { invalid: true };
  }
}, z.array(recordFilterSchema).max(MAX_FILTERS));

const sortSchema = z
  .string()
  .trim()
  .max(64 * MAX_SORT_TERMS + MAX_SORT_TERMS * 8)
  .optional();

export const listRecordsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
  search: z.string().trim().max(200).optional(),
  sort: sortSchema,
  filters: filtersSchema.optional(),
  status: z.enum(["active", "archived"]).optional(),
  organizationEntityId: z.coerce.number().int().positive().optional(),
});

const valuesSchema = z.record(z.string().trim().regex(COLUMN_KEY_PATTERN), z.unknown());

const valuesLimit = (schema) =>
  schema.refine((payload) => Object.keys(payload.values).length <= MAX_VALUES_PER_RECORD, {
    message: `A record accepts a maximum of ${MAX_VALUES_PER_RECORD} values.`,
    path: ["values"],
  });

/*
 * `formId` switches the payload to a mapped submission: the keys are then form
 * field keys resolved through the mapping instead of column keys. Both key
 * spaces share the same identifier pattern, so one schema covers both.
 */
export const createRecordSchema = valuesLimit(
  z.object({
    values: valuesSchema,
    formId: z.coerce.number().int().positive().optional(),
    organizationEntityId: z.coerce.number().int().positive().nullish(),
  })
);

export const updateRecordSchema = valuesLimit(
  z
    .object({
      values: valuesSchema,
      formId: z.coerce.number().int().positive().optional(),
      organizationEntityId: z.coerce.number().int().positive().nullish(),
    })
    .refine((payload) => Object.keys(payload.values).length > 0, {
      message: "At least one value must be provided.",
      path: ["values"],
    })
);

export const facetQuerySchema = z.object({
  column: z.string().trim().regex(COLUMN_KEY_PATTERN),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
});
