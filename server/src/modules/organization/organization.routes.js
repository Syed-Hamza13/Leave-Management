import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  listEntityTypesHandler,
  getEntityTypeHandler,
  createEntityTypeHandler,
  updateEntityTypeHandler,
  archiveEntityTypeHandler,
  listConfigurationsHandler,
  createConfigurationHandler,
  updateConfigurationHandler,
  deleteConfigurationHandler,
  listEntitiesHandler,
  getEntityHandler,
  createEntityHandler,
  updateEntityHandler,
  archiveEntityHandler,
} from "./organization.controller.js";

const VIEW = [PERMISSIONS.ORGANIZATION_VIEW];
const MANAGE = [PERMISSIONS.ORGANIZATION_MANAGE];

export function createOrganizationRoutes() {
  const router = Router();

  router.use(requireAuth);

  router.get("/entity-types", requirePermission(VIEW), listEntityTypesHandler);
  router.post("/entity-types", requirePermission(MANAGE), createEntityTypeHandler);

  router.get(
    "/entity-types/:entityTypeId",
    requirePermission(VIEW),
    getEntityTypeHandler
  );

  router.patch(
    "/entity-types/:entityTypeId",
    requirePermission(MANAGE),
    updateEntityTypeHandler
  );

  router.delete(
    "/entity-types/:entityTypeId",
    requirePermission(MANAGE),
    archiveEntityTypeHandler
  );

  router.get(
    "/entity-types/:entityTypeId/configurations",
    requirePermission(VIEW),
    listConfigurationsHandler
  );

  router.post(
    "/entity-types/:entityTypeId/configurations",
    requirePermission(MANAGE),
    createConfigurationHandler
  );

  /*
   * Configurations are addressed by their own id once created, so they sit
   * outside the entity-type subtree.
   */
  router.patch(
    "/configurations/:configurationId",
    requirePermission(MANAGE),
    updateConfigurationHandler
  );

  router.delete(
    "/configurations/:configurationId",
    requirePermission(MANAGE),
    deleteConfigurationHandler
  );

  router.get("/entities", requirePermission(VIEW), listEntitiesHandler);
  router.post("/entities", requirePermission(MANAGE), createEntityHandler);

  router.get("/entities/:entityId", requirePermission(VIEW), getEntityHandler);

  router.patch("/entities/:entityId", requirePermission(MANAGE), updateEntityHandler);

  router.delete("/entities/:entityId", requirePermission(MANAGE), archiveEntityHandler);

  return router;
}
