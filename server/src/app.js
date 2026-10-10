import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { sessionMiddleware } from "./config/session.js";

import { createGlobalRateLimiter } from "./middleware/rateLimiter.js";
import { doubleCsrfProtection } from "./middleware/csrf.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

import healthRoutes from "./modules/health/health.routes.js";
import securityRoutes from "./modules/security/security.routes.js";
import { createAuthRoutes } from "./modules/auth/auth.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(helmet());

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use(cookieParser());
  app.use(sessionMiddleware);

  // Redis must already be connected before creating this limiter.
  app.use(createGlobalRateLimiter());

  app.use("/api/v1/health", healthRoutes);
  app.use("/api/v1/security", securityRoutes);
  app.use("/api/v1/auth", createAuthRoutes());

  app.use(doubleCsrfProtection);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}