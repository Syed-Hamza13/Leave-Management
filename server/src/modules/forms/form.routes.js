import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  listFormsHandler,
  getFormHandler,
  getRenderableFormHandler,
  createFormHandler,
  updateFormHandler,
  archiveFormHandler,
  formUsageHandler,
  reorderFormFieldsHandler,
} from "./form.controller.js";

const VIEW = [PERMISSIONS.FORMS_VIEW, PERMISSIONS.FORMS_MANAGE];

export function createFormRoutes() {
  const router = Router();

  router.use(requireAuth);

  router.get("/", requirePermission(VIEW), listFormsHandler);
  router.get("/:formId", requirePermission(VIEW), getFormHandler);
  router.get("/:formId/usage", requirePermission(VIEW), formUsageHandler);

  /*
   * The render endpoint backs data entry, so it stays available to anyone who
   * may view forms rather than only to administrators.
   */
  router.get("/:formId/render", requirePermission(VIEW), getRenderableFormHandler);

  router.post("/", requirePermission(PERMISSIONS.FORMS_MANAGE), createFormHandler);

  router.patch(
    "/:formId",
    requirePermission(PERMISSIONS.FORMS_MANAGE),
    updateFormHandler
  );

  router.delete(
    "/:formId",
    requirePermission(PERMISSIONS.FORMS_MANAGE),
    archiveFormHandler
  );

  router.put(
    "/:formId/fields/order",
    requirePermission(PERMISSIONS.FORMS_MANAGE),
    reorderFormFieldsHandler
  );

  return router;
}
