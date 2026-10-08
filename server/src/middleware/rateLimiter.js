import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../config/redis.js";

const redisStore = new RedisStore({
  sendCommand: (...args) => redisClient.sendCommand(args),
});

export const globalRateLimiter = rateLimit({
  store: redisStore,

  windowMs: 15 * 60 * 1000,

  limit: 300,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});


export const loginRateLimiter = rateLimit({
  store: redisStore,

  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});