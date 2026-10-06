import session from "express-session";
import { RedisStore } from "connect-redis";

import { redisClient } from "./redis.js";
import { env } from "./env.js";

export const sessionMiddleware = session({
  store: new RedisStore({
    client: redisClient,
    prefix: "leave-session:",
  }),

  name: "leave.sid",

  secret: env.SESSION_SECRET,

  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",

    maxAge: 1000 * 60 * 60 * 8,
  },
});