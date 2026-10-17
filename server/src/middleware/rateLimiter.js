import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { redisClient } from "../config/redis.js";

function createRedisStore(prefix) {
  if (!redisClient.isReady) {
    throw new Error(
      "Redis must be connected before creating rate limiters."
    );
  }

  return new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix,
  });
}

export function createGlobalRateLimiter() {
  return rateLimit({
    store: createRedisStore("leave-ratelimit:global:"),
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
    store: createRedisStore("leave-ratelimit:login:"),
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

/*
 * Credential and outbound-touching administration actions are rate limited
 * separately from ordinary admin traffic: creating an account, setting a
 * password and probing an SMTP host are each low-frequency by nature, so a
 * tight window cannot disrupt legitimate work. Each surface gets its own named
 * window so exhausting one does not spend the other's budget.
 */
export function createSensitiveRateLimiter(name) {
  return rateLimit({
    store: createRedisStore(`leave-ratelimit:sensitive:${name}`),
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many sensitive operations. Please try again later.",
    },
  });
}