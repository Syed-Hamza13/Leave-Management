import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { createSensitiveRateLimiter } from "../../middleware/rateLimiter.js";
import { PERMISSIONS } from "../../lib/permissions.js";

import {
  getSmtpHandler,
  getTurnstileHandler,
  listSettingsHandler,
  testSmtpHandler,
  updateSmtpHandler,
  updateTurnstileHandler,
} from "./settings.controller.js";

export function createSettingsRoutes() {
  const router = Router();

  router.use(requireAuth);

  /*
   * Read endpoints never return a stored credential, so viewing settings is
   * safe for the admin role while changing them, and reaching the mail server
   * with the stored password, is super_admin only.
   */
  router.get("/", requirePermission(PERMISSIONS.SETTINGS_VIEW), listSettingsHandler);

  router.get("/smtp", requirePermission(PERMISSIONS.SETTINGS_VIEW), getSmtpHandler);

  router.patch("/smtp", requirePermission(PERMISSIONS.SETTINGS_MANAGE), updateSmtpHandler);

  /*
   * Turnstile security settings.
   */
  router.get("/turnstile", requirePermission(PERMISSIONS.SETTINGS_VIEW), getTurnstileHandler);

  router.patch("/turnstile", requirePermission(PERMISSIONS.SETTINGS_MANAGE), updateTurnstileHandler);

  /*
   * The test route opens a socket to an administrator-supplied host, which is
   * both an outbound-connection and a credential-use surface, so it gets its own
   * tight window.
   */
  router.post(
    "/smtp/test",
    createSensitiveRateLimiter("smtp"),
    requirePermission(PERMISSIONS.SETTINGS_MANAGE),
    testSmtpHandler
  );

  return router;
}
