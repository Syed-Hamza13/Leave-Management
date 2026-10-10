import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../config/redis.js";

let redisStore;

function getRedisStore() {
  if (!redisClient.isReady) {
    throw new Error("Redis must be connected before creating rate limiters.");
  }

  if (!redisStore) {
    redisStore = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
  }

  return redisStore;
}

export function createGlobalRateLimiter() {
  return rateLimit({
    store: getRedisStore(),

    windowMs: 15 * 60 * 1000,
    limit: 300,

    standardHeaders: "draft-8",
    legacyHeaders: false,

    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  });
}

export function createLoginRateLimiter() {
  return rateLimit({
    store: getRedisStore(),

    windowMs: 15 * 60 * 1000,
    limit: 100,

    standardHeaders: "draft-8",
    legacyHeaders: false,

    message: {
      success: false,
      message: "Too many login attempts. Please try again later.",
    },
  });
} 