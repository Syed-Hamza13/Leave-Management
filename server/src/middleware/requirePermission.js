import { getUserPermissions } from "../modules/authorization/permission.service.js";
import { forbidden, unauthorized } from "../lib/appError.js";

/*
 * Authorization gate.
 *
 * requireAuth proves who signed in; this proves what they may do. Permissions
 * are resolved per request from the database so that role changes take effect
 * immediately and hiding a menu item in the client can never act as access
 * control.
 */
async function loadPermissions(req) {
  const userId = req.session?.user?.id;

  if (!userId) {
    throw unauthorized();
  }

  if (req.permissions) {
    return req.permissions;
  }

  const permissions = await getUserPermissions(userId);

  req.permissions = new Set(permissions);
  req.currentUserId = userId;

  return req.permissions;
}

export function requirePermission(...required) {
  const needed = required.flat();

  return async (req, res, next) => {
    try {
      const permissions = await loadPermissions(req);

      const allowed = needed.some((permission) => permissions.has(permission));

      if (!allowed) {
        throw forbidden("You do not have permission to perform this action.", {
          code: "PERMISSION_DENIED",
          details: { required: needed },
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAllPermissions(...required) {
  const needed = required.flat();

  return async (req, res, next) => {
    try {
      const permissions = await loadPermissions(req);

      const missing = needed.filter((permission) => !permissions.has(permission));

      if (missing.length > 0) {
        throw forbidden("You do not have permission to perform this action.", {
          code: "PERMISSION_DENIED",
          details: { required: needed, missing },
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/*
 * Attaches the permission set without requiring any specific permission.
 * Used by endpoints that adapt their response to what the caller may do.
 */
export async function attachPermissions(req, res, next) {
  try {
    await loadPermissions(req);

    next();
  } catch (error) {
    next(error);
  }
}
