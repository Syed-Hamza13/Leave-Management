import { getHealthStatus } from "./health.service.js";

export async function healthController(req, res) {
  const health = await getHealthStatus();

  const statusCode = health.status === "ok" ? 200 : 503;

  res.status(statusCode).json({
    success: health.status === "ok",
    ...health,
  });
}