import { doubleCsrf } from "csrf-csrf";
import { env } from "../config/env.js";

const {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
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