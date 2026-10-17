import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  listMappingsHandler,
  compatibilityHandler,
  saveMappingHandler,
  getMappingHandler,
  getMappingForPairHandler,
  updateMappingHandler,
  deleteMappingHandler,
} from "./mapping.controller.js";

const VIEW = [PERMISSIONS.MAPPINGS_VIEW, PERMISSIONS.MAPPINGS_MANAGE];

export function createMappingRoutes() {
  const router = Router();

  router.use(requireAuth);

  /*
   * Static segments are declared before "/:mappingId" so they are not captured
   * by the parameter route.
   */
  router.get("/", requirePermission(VIEW), listMappingsHandler);
  router.get("/compatibility", requirePermission(VIEW), compatibilityHandler);
  router.get("/for/:formId/:tableId", requirePermission(VIEW), getMappingForPairHandler);

  router.put("/", requirePermission(PERMISSIONS.MAPPINGS_MANAGE), saveMappingHandler);

  router.get("/:mappingId", requirePermission(VIEW), getMappingHandler);

  router.patch(
    "/:mappingId",
    requirePermission(PERMISSIONS.MAPPINGS_MANAGE),
    updateMappingHandler
  );

  router.delete(
    "/:mappingId",
    requirePermission(PERMISSIONS.MAPPINGS_MANAGE),
    deleteMappingHandler
  );

  return router;
}
