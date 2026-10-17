import { z } from "zod";

import { ROLES } from "../../lib/permissions.js";

export const idParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const assignRolesSchema = z.object({
  roleKeys: z
    .array(z.enum([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE]))
    .max(10)
    .transform((keys) => Array.from(new Set(keys))),
});
