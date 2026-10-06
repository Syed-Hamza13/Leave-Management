import { createClient } from "redis";
import { env } from "./env.js";

const redisOptions = {
  socket: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
};

if (env.REDIS_PASSWORD) {
  redisOptions.password = env.REDIS_PASSWORD;
}

export const redisClient = createClient(redisOptions);

redisClient.on("error", (error) => {
  console.error("❌ Redis error:", error);
});

redisClient.on("connect", () => {
  console.log("🔄 Redis connecting...");
});

redisClient.on("ready", () => {
  console.log("✅ Redis ready");
});

redisClient.on("reconnecting", () => {
  console.log("🔄 Redis reconnecting...");
});

export async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

export async function checkRedisConnection() {
  await redisClient.ping();
}