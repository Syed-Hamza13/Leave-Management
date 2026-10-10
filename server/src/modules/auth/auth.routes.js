import { Router } from "express";
import { login, logout, me } from "./auth.controller.js";
import { createLoginRateLimiter } from "../../middleware/rateLimiter.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { doubleCsrfProtection } from "../../middleware/csrf.js";

export function createAuthRoutes() {
  const router = Router();

  router.post(
    "/login",
    createLoginRateLimiter(),
    doubleCsrfProtection,
    login
  );

  router.post(
    "/logout",
    doubleCsrfProtection,
    requireAuth,
    logout
  );

  router.get(
    "/me",
    requireAuth,
    me
  );

  return router;
}