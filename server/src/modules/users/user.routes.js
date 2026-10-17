import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { createSensitiveRateLimiter } from "../../middleware/rateLimiter.js";
import { PERMISSIONS } from "../../lib/permissions.js";

import {
  createUserHandler,
  getUserHandler,
  listUsersHandler,
  setUserPasswordHandler,
  updateUserHandler,
} from "./user.controller.js";

export function createUserRoutes() {
  const router = Router();

  /*
   * One limiter instance so both credential-touching routes share a single
   * window rather than each getting its own budget.
   */
  const sensitiveLimit = createSensitiveRateLimiter("users");

  router.use(requireAuth);

  router.get(
    "/",
    requirePermission(PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_MANAGE),
    listUsersHandler
  );

  router.get(
    "/:userId",
    requirePermission(PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_MANAGE),
    getUserHandler
  );

  router.post(
    "/",
    sensitiveLimit,
    requirePermission(PERMISSIONS.USERS_MANAGE),
    createUserHandler
  );

  router.patch("/:userId", requirePermission(PERMISSIONS.USERS_MANAGE), updateUserHandler);

  router.put(
    "/:userId/password",
    sensitiveLimit,
    requirePermission(PERMISSIONS.USERS_MANAGE),
    setUserPasswordHandler
  );

  return router;
}
