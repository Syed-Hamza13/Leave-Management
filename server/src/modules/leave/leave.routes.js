import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  previewLeaveHandler,
  submitLeaveHandler,
  approveLeaveHandler,
  rejectLeaveHandler,
  cancelLeaveHandler,
  listMyRequestsHandler,
  listPendingApprovalsHandler,
  getLeaveRulesHandler,
  saveLeaveRulesHandler,
  getHolidaysHandler,
  saveHolidaysHandler,
  getLeaveSettingsHandler,
  saveLeaveSettingsHandler,
} from "./leave.controller.js";

const MANAGE = [
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.TABLES_MANAGE,
  PERMISSIONS.FORMS_MANAGE,
  PERMISSIONS.ORGANIZATION_MANAGE,
];

export function createLeaveRoutes() {
  const router = Router();

  router.use(requireAuth);

  // Leave Requests & Workflow Actions
  router.post("/preview", previewLeaveHandler);
  router.post("/requests", submitLeaveHandler);
  router.get("/my-requests", listMyRequestsHandler);
  router.get("/pending-approvals", listPendingApprovalsHandler);
  router.post("/requests/:requestId/approve", approveLeaveHandler);
  router.post("/requests/:requestId/reject", rejectLeaveHandler);
  router.post("/requests/:requestId/cancel", cancelLeaveHandler);

  // Dynamic Rule & Configuration Management
  router.get("/rules", getLeaveRulesHandler);
  router.post("/rules", requirePermission(MANAGE), saveLeaveRulesHandler);

  router.get("/holidays", getHolidaysHandler);
  router.post("/holidays", requirePermission(MANAGE), saveHolidaysHandler);

  // Workflow & Leave Settings
  router.get("/settings", getLeaveSettingsHandler);
  router.post("/settings", requirePermission(MANAGE), saveLeaveSettingsHandler);
  router.put("/settings", requirePermission(MANAGE), saveLeaveSettingsHandler);

  return router;
}

