import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  getSectionConfigHandler,
  saveSectionConfigHandler,
  deleteSectionConfigHandler,
} from "./sectionConfig.controller.js";

const VIEW = [PERMISSIONS.RECORDS_VIEW, PERMISSIONS.FORMS_VIEW];
const MANAGE = [
  PERMISSIONS.FORMS_MANAGE,
  PERMISSIONS.TABLES_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.ORGANIZATION_MANAGE,
];

export function createSectionRoutes() {
  const router = Router();

  router.use(requireAuth);

  router.get("/:sectionKey/configuration", requirePermission(VIEW), getSectionConfigHandler);
  router.post("/:sectionKey/configuration", requirePermission(MANAGE), saveSectionConfigHandler);
  router.delete("/:sectionKey/configuration", requirePermission(MANAGE), deleteSectionConfigHandler);

  return router;
}
