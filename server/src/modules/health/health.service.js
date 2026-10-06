import {
  checkDatabaseConnection,
} from "../../config/database.js";

import {
  checkRedisConnection,
} from "../../config/redis.js";

export async function getHealthStatus() {
  const services = {
    mysql: "down",
    redis: "down",
  };

  try {
    await checkDatabaseConnection();
    services.mysql = "up";
  } catch (error) {
    console.error("MySQL health check failed:", error.message);
  }

  try {
    await checkRedisConnection();
    services.redis = "up";
  } catch (error) {
    console.error("Redis health check failed:", error.message);
  }

  const allHealthy =
    services.mysql === "up" &&
    services.redis === "up";

  return {
    status: allHealthy ? "ok" : "degraded",
    services,
    timestamp: new Date().toISOString(),
  };
}