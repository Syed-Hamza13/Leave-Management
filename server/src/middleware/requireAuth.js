import { getUserSecurityState } from "../modules/auth/auth.repository.js";

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function parseDatabaseUtcDate(value) {
  if (!value) return null;

  const normalized = String(value).trim().replace(" ", "T");

  const date = new Date(`${normalized}Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

export async function requireAuth(req, res, next) {
  try {
    const userId = req.session?.user?.id;
    const authenticatedAt = req.session?.authenticatedAt;

    if (!userId || !authenticatedAt) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const securityState = await getUserSecurityState(userId);

    if (!securityState || securityState.status !== "active") {
      await destroySession(req);

      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const authenticatedDate = new Date(authenticatedAt);

    if (Number.isNaN(authenticatedDate.getTime())) {
      await destroySession(req);

      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const passwordChangedDate = parseDatabaseUtcDate(
      securityState.password_changed_at,
    );

    if (passwordChangedDate && authenticatedDate < passwordChangedDate) {
      console.log("🚨 PASSWORD CHANGED — DESTROYING SESSION");

      await destroySession(req);

      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}
