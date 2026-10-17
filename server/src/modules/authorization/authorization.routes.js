import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  listAllRoles,
  myPermissions,
  updateUserRoles,
} from "./authorization.controller.js";

export function createAuthorizationRoutes() {
  const router = Router();

  router.use(requireAuth);

  /*
   * Every signed-in user may read their own permission set; the client uses it
   * to gate navigation. Actual enforcement stays on the server.
   */
  router.get("/permissions", myPermissions);

  router.get(
    "/roles",
    requirePermission(PERMISSIONS.USERS_VIEW),
    listAllRoles
  );

  router.put(
    "/users/:userId/roles",
    requirePermission(PERMISSIONS.USERS_MANAGE),
    updateUserRoles
  );

  return router;
}
