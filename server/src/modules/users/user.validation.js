import { z } from "zod";

import { ROLES } from "../../lib/permissions.js";

const ROLE_KEYS = Object.values(ROLES);

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  role: z.enum(ROLE_KEYS).optional(),
  sort: z.string().trim().max(120).optional(),
});

/*
 * The password arrives here and is hashed immediately; it is never stored in a
 * readable column, echoed back, or written to an audit summary.
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long.")
  .max(128, "Password must not exceed 128 characters.");

export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(255)
    .transform((value) => value.toLowerCase()),

  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().max(100).nullish(),

  password: passwordSchema,

  roleKeys: z
    .array(z.enum(ROLE_KEYS))
    .max(ROLE_KEYS.length)
    .optional()
    .transform((keys) => (keys ? Array.from(new Set(keys)) : undefined)),

  status: z.enum(["active", "disabled"]).optional(),
  values: z.record(z.any()).optional().default({}),
});

export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().max(100).nullish(),
    status: z.enum(["active", "disabled"]).optional(),
    values: z.record(z.any()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const setPasswordSchema = z.object({
  password: passwordSchema,
});
