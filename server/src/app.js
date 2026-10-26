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
import { createFieldRoutes } from "./modules/fields/field.routes.js";
import { createDropdownRoutes } from "./modules/dropdowns/dropdown.routes.js";
import { createFormRoutes } from "./modules/forms/form.routes.js";
import { createTableRoutes } from "./modules/tables/table.routes.js";
import { createMappingRoutes } from "./modules/mappings/mapping.routes.js";
import { createMetadataRoutes } from "./modules/metadata/metadata.routes.js";
import { createRecordRoutes } from "./modules/records/record.routes.js";
import { createOrganizationRoutes } from "./modules/organization/organization.routes.js";
import { createAuthorizationRoutes } from "./modules/authorization/authorization.routes.js";
import { createAuditRoutes } from "./modules/audit/audit.routes.js";
import { createUserRoutes } from "./modules/users/user.routes.js";
import { createSettingsRoutes } from "./modules/settings/settings.routes.js";
import { createSectionRoutes } from "./modules/sections/sectionConfig.routes.js";

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

  /*
   * Mounted after the CSRF gate: these routers only declare requireAuth and
   * requirePermission, so the gate above is what protects their mutations.
   */
  app.use("/api/v1/admin/fields", createFieldRoutes());
  app.use("/api/v1/admin/dropdowns", createDropdownRoutes());
  app.use("/api/v1/admin/forms", createFormRoutes());
  app.use("/api/v1/admin/tables", createTableRoutes());
  app.use("/api/v1/admin/mappings", createMappingRoutes());
  app.use("/api/v1/admin/metadata", createMetadataRoutes());
  app.use("/api/v1/admin/audit", createAuditRoutes());
  app.use("/api/v1/admin/users", createUserRoutes());
  app.use("/api/v1/admin/settings", createSettingsRoutes());
  app.use("/api/v1/authorization", createAuthorizationRoutes());
  app.use("/api/v1/tables", createRecordRoutes());
  app.use("/api/v1/organization", createOrganizationRoutes());
  app.use("/api/v1/sections", createSectionRoutes());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}