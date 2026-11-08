import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  listFieldsHandler,
  getFieldHandler,
  createFieldHandler,
  updateFieldHandler,
  archiveFieldHandler,
  restoreFieldHandler,
  fieldConnectedHandler,
  fieldUsageHandler,
} from "./field.controller.js";

export function createFieldRoutes() {
  const router = Router();

  router.use(requireAuth);

  router.get(
    "/",
    requirePermission(PERMISSIONS.FIELDS_VIEW, PERMISSIONS.FIELDS_MANAGE),
    listFieldsHandler
  );

  router.get(
    "/:fieldId",
    requirePermission(PERMISSIONS.FIELDS_VIEW, PERMISSIONS.FIELDS_MANAGE),
    getFieldHandler
  );

  router.get(
    "/:fieldId/usage",
    requirePermission(PERMISSIONS.FIELDS_VIEW, PERMISSIONS.FIELDS_MANAGE),
    fieldUsageHandler
  );

  router.post(
    "/",
    requirePermission(PERMISSIONS.FIELDS_MANAGE),
    createFieldHandler
  );

  router.patch(
    "/:fieldId",
    requirePermission(PERMISSIONS.FIELDS_MANAGE),
    updateFieldHandler
  );

  router.delete(
    "/:fieldId",
    requirePermission(PERMISSIONS.FIELDS_MANAGE),
    archiveFieldHandler
  );

  router.post(
    "/:fieldId/restore",
    requirePermission(PERMISSIONS.FIELDS_MANAGE),
    restoreFieldHandler
  );

  router.get(
    "/:fieldId/connected",
    requirePermission(PERMISSIONS.FIELDS_MANAGE),
    fieldConnectedHandler
  );

  return router;
}
