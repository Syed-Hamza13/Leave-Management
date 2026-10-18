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

/*
 * Entering a record means reading the table it lands in, so an account that may
 * browse or create records reaches this definition even when it holds no part of
 * the table builder. Only these two read-only routes widen; listing tables and
 * every mutation stay behind the administration permissions.
 */
const ENTRY = [...VIEW, PERMISSIONS.RECORDS_VIEW, PERMISSIONS.RECORDS_CREATE];

export function createTableRoutes() {
  const router = Router();

  router.use(requireAuth);

  router.get("/", requirePermission(VIEW), listTablesHandler);
  router.get("/:tableId", requirePermission(ENTRY), getTableHandler);
  router.get("/:tableId/usage", requirePermission(VIEW), tableUsageHandler);
  router.get("/:tableId/columns", requirePermission(ENTRY), listColumnsHandler);

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
