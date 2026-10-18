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

/*
 * The entry dialog has to know which form feeds a table before it can render
 * anything, so an account that may create records reads the connector too. This
 * exposes definitions only — stored values stay behind the record routes.
 */
const ENTRY = [...VIEW, PERMISSIONS.RECORDS_VIEW, PERMISSIONS.RECORDS_CREATE];

export function createMappingRoutes() {
  const router = Router();

  router.use(requireAuth);

  /*
   * Static segments are declared before "/:mappingId" so they are not captured
   * by the parameter route.
   */
  router.get("/", requirePermission(ENTRY), listMappingsHandler);
  router.get("/compatibility", requirePermission(VIEW), compatibilityHandler);
  router.get("/for/:formId/:tableId", requirePermission(ENTRY), getMappingForPairHandler);

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
