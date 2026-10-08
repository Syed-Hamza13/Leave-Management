import { Router } from "express";

import {
  login,
  logout,
  me,
} from "./auth.controller.js";

import { loginRateLimiter } from "../../middleware/rateLimiter.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { doubleCsrfProtection } from "../../middleware/csrf.js";

const router = Router();

router.post(
  "/login",
  loginRateLimiter,
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

export default router;