import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { sessionMiddleware } from "./config/session.js";

import { globalRateLimiter } from "./middleware/rateLimiter.js";
import { doubleCsrfProtection } from "./middleware/csrf.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

import healthRoutes from "./modules/health/health.routes.js";
import securityRoutes from "./modules/security/security.routes.js";

import authRoutes from "./modules/auth/auth.routes.js";

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

app.use(sessionMiddleware);
app.use(cookieParser());

app.use(globalRateLimiter);

app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/security", securityRoutes);

app.use("/api/v1/auth", authRoutes);

// Protect non-GET, non-HEAD, non-OPTIONS requests
app.use(doubleCsrfProtection);

app.use(notFound);
app.use(errorHandler);

export default app;