import { doubleCsrf } from "csrf-csrf";
import { env } from "../config/env.js";

const {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => env.SESSION_SECRET,

  // Required by csrf-csrf
  getSessionIdentifier: (req) => req.session.id,

  cookieName: "csrf-token",

  cookieOptions: {
    httpOnly: false,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },

  getCsrfTokenFromRequest: (req) => {
    return req.headers["x-csrf-token"];
  },
});

export {
  generateCsrfToken,
  doubleCsrfProtection,
  invalidCsrfTokenError,
};