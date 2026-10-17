import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { listAudit } from "./audit.controller.js";

export function createAuditRoutes() {
  const router = Router();

  router.use(requireAuth);

  router.get(
    "/events",
    requirePermission(PERMISSIONS.AUDIT_VIEW),
    listAudit
  );

  return router;
}
