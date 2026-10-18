
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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

/*
 * A browser that abandons a request — navigating away, or a component that
 * cancels its own fetch — leaves the socket gone by the time this middleware
 * runs, and `request.ip` is then undefined. The library hashes that key for its
 * draft-8 `RateLimit-Policy` header and throws, so an already-dead request came
 * back as a 500 in the log. Every limiter therefore resolves its own key and
 * guarantees a string: requests that cannot be attributed share one bucket
 * instead of reaching the hashing code with nothing.
 */
function clientKey(request) {
  return ipKeyGenerator(request.ip ?? "unattributed");
}

// Read rate-limit settings from environment variables.
// Existing values remain the defaults if variables are not configured.
const GLOBAL_RATE_LIMIT_WINDOW_MS = Number(
  process.env.GLOBAL_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000
);

const GLOBAL_RATE_LIMIT_MAX = Number(
  process.env.GLOBAL_RATE_LIMIT_MAX ?? 300
);

const LOGIN_RATE_LIMIT_WINDOW_MS = Number(
  process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000
);

const LOGIN_RATE_LIMIT_MAX = Number(
  process.env.LOGIN_RATE_LIMIT_MAX ?? 100
);

const SENSITIVE_RATE_LIMIT_WINDOW_MS = Number(
  process.env.SENSITIVE_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000
);

const SENSITIVE_RATE_LIMIT_MAX = Number(
  process.env.SENSITIVE_RATE_LIMIT_MAX ?? 20
);

export function createGlobalRateLimiter() {
  return rateLimit({
    store: createRedisStore("leave-ratelimit:global:"),
    keyGenerator: clientKey,
    windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS,
    limit: GLOBAL_RATE_LIMIT_MAX,
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
    keyGenerator: clientKey,
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: LOGIN_RATE_LIMIT_MAX,
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
    keyGenerator: clientKey,
    windowMs: SENSITIVE_RATE_LIMIT_WINDOW_MS,
    limit: SENSITIVE_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many sensitive operations. Please try again later.",
    },
  });
}
