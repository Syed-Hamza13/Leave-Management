import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  listDropdownsHandler,
  getDropdownHandler,
  createDropdownHandler,
  updateDropdownHandler,
  archiveDropdownHandler,
  listOptionsHandler,
  addOptionHandler,
  updateOptionHandler,
  deleteOptionHandler,
  reorderOptionsHandler,
} from "./dropdown.controller.js";

const VIEW = [PERMISSIONS.DROPDOWNS_VIEW, PERMISSIONS.DROPDOWNS_MANAGE];

export function createDropdownRoutes() {
  const router = Router();

  router.use(requireAuth);

  router.get("/", requirePermission(VIEW), listDropdownsHandler);
  router.get("/:dropdownId", requirePermission(VIEW), getDropdownHandler);

  router.post("/", requirePermission(PERMISSIONS.DROPDOWNS_MANAGE), createDropdownHandler);

  router.patch(
    "/:dropdownId",
    requirePermission(PERMISSIONS.DROPDOWNS_MANAGE),
    updateDropdownHandler
  );

  router.delete(
    "/:dropdownId",
    requirePermission(PERMISSIONS.DROPDOWNS_MANAGE),
    archiveDropdownHandler
  );

  router.get(
    "/:dropdownId/options",
    requirePermission([
      ...VIEW,
      /*
       * A dropdown-valued field on an entry form is filled from this list, so the
       * choices are readable by anyone allowed to submit a record.
       */
      PERMISSIONS.RECORDS_VIEW,
      PERMISSIONS.RECORDS_CREATE,
    ]),
    listOptionsHandler
  );

  router.post(
    "/:dropdownId/options",
    requirePermission(PERMISSIONS.DROPDOWNS_MANAGE),
    addOptionHandler
  );

  router.put(
    "/:dropdownId/options/order",
    requirePermission(PERMISSIONS.DROPDOWNS_MANAGE),
    reorderOptionsHandler
  );

  router.patch(
    "/:dropdownId/options/:optionId",
    requirePermission(PERMISSIONS.DROPDOWNS_MANAGE),
    updateOptionHandler
  );

  router.delete(
    "/:dropdownId/options/:optionId",
    requirePermission(PERMISSIONS.DROPDOWNS_MANAGE),
    deleteOptionHandler
  );

  return router;
}
