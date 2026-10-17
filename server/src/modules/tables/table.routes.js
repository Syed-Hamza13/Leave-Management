import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  listTablesHandler,
  getTableHandler,
  createTableHandler,
  updateTableHandler,
  archiveTableHandler,
  tableUsageHandler,
  listColumnsHandler,
  addColumnHandler,
  updateColumnHandler,
  archiveColumnHandler,
  reorderColumnsHandler,
} from "./table.controller.js";

const VIEW = [PERMISSIONS.TABLES_VIEW, PERMISSIONS.TABLES_MANAGE];

export function createTableRoutes() {
  const router = Router();

  router.use(requireAuth);

  router.get("/", requirePermission(VIEW), listTablesHandler);
  router.get("/:tableId", requirePermission(VIEW), getTableHandler);
  router.get("/:tableId/usage", requirePermission(VIEW), tableUsageHandler);
  router.get("/:tableId/columns", requirePermission(VIEW), listColumnsHandler);

  router.post("/", requirePermission(PERMISSIONS.TABLES_MANAGE), createTableHandler);

  router.patch(
    "/:tableId",
    requirePermission(PERMISSIONS.TABLES_MANAGE),
    updateTableHandler
  );

  router.delete(
    "/:tableId",
    requirePermission(PERMISSIONS.TABLES_MANAGE),
    archiveTableHandler
  );

  router.post(
    "/:tableId/columns",
    requirePermission(PERMISSIONS.TABLES_MANAGE),
    addColumnHandler
  );

  router.put(
    "/:tableId/columns/order",
    requirePermission(PERMISSIONS.TABLES_MANAGE),
    reorderColumnsHandler
  );

  router.patch(
    "/:tableId/columns/:columnId",
    requirePermission(PERMISSIONS.TABLES_MANAGE),
    updateColumnHandler
  );

  router.delete(
    "/:tableId/columns/:columnId",
    requirePermission(PERMISSIONS.TABLES_MANAGE),
    archiveColumnHandler
  );

  return router;
}
