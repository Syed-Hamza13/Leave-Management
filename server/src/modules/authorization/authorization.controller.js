import { ok } from "../../lib/responses.js";
import {
  assignRolesSchema,
  idParamSchema,
} from "./authorization.validation.js";
import {
  assignRoles,
  getAuthorizationSummary,
  listRoles,
} from "./permission.service.js";

export async function myPermissions(req, res, next) {
  try {
    const userId = req.session?.user?.id;

    const summary = await getAuthorizationSummary(userId);

    return ok(res, summary);
  } catch (error) {
    return next(error);
  }
}

export async function listAllRoles(req, res, next) {
  try {
    const roles = await listRoles();

    return ok(res, roles);
  } catch (error) {
    return next(error);
  }
}

export async function updateUserRoles(req, res, next) {
  try {
    const { userId } = idParamSchema.parse(req.params);
    const { roleKeys } = assignRolesSchema.parse(req.body);

    const summary = await assignRoles({
      userId,
      roleKeys,
      actorUserId: req.currentUserId,
    });

    return ok(res, summary);
  } catch (error) {
    return next(error);
  }
}
