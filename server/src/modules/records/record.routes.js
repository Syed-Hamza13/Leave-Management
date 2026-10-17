import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  archiveRecordHandler,
  createRecordHandler,
  facetValuesHandler,
  getRecordHandler,
  listRecordsHandler,
  updateRecordHandler,
} from "./record.controller.js";

const VIEW = [PERMISSIONS.RECORDS_VIEW];

export function createRecordRoutes() {
  const router = Router();

  router.use(requireAuth);

  router.get("/:tableId/records", requirePermission(VIEW), listRecordsHandler);

  /*
   * Declared before the :recordId routes so "facets" is never parsed as a
   * record identifier.
   */
  router.get("/:tableId/records/facets", requirePermission(VIEW), facetValuesHandler);

  router.post(
    "/:tableId/records",
    requirePermission(PERMISSIONS.RECORDS_CREATE),
    createRecordHandler
  );

  router.get("/:tableId/records/:recordId", requirePermission(VIEW), getRecordHandler);

  router.patch(
    "/:tableId/records/:recordId",
    requirePermission(PERMISSIONS.RECORDS_UPDATE),
    updateRecordHandler
  );

  router.delete(
    "/:tableId/records/:recordId",
    requirePermission(PERMISSIONS.RECORDS_DELETE),
    archiveRecordHandler
  );

  return router;
}
