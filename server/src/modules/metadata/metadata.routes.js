import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import {
  dataTypesHandler,
  lookupsHandler,
} from "./metadata.controller.js";

export function createMetadataRoutes() {
  const router = Router();

  /*
   * Read-only reference data with no mutation surface, so any authenticated
   * user may fetch it. Rendering a form already requires form access.
   */
  router.use(requireAuth);

  router.get("/data-types", dataTypesHandler);
  router.get("/lookups", lookupsHandler);

  return router;
}
