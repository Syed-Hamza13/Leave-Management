import { getUserSecurityState } from "../modules/auth/auth.repository.js";
import {
  validateSession,
  touchSession,
  markSessionAsExpired,
} from "../modules/auth/session.service.js";
import {
  getDeviceByToken,
  touchDevice,
} from "../modules/auth/device.service.js";

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
    const sessionId = req.sessionID;
    const authenticatedAt = req.session?.authenticatedAt;

    const deviceToken = req.cookies?.["leave.device"];
    const userAgent = req.get("User-Agent");

    const device = await getDeviceByToken(deviceToken);

    /*
     * Basic session check
     */
    if (!userId || !sessionId || !authenticatedAt) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    /*
     * Check application-level session registry.
     *
     * This allows us to revoke a session from the database
     * even though the Redis session itself may still exist.
     */

    const registeredSession = await validateSession(
      sessionId,
      userId,
      device,
      userAgent,
    );

    if (!registeredSession.valid) {
      const { reason } = registeredSession;

      console.log(`🚨 SESSION VALIDATION FAILED: ${reason}`);

      // Device binding mismatch:
      // DO NOT destroy the actual session.
      if (
        reason === "DEVICE_MISMATCH" ||
        reason === "DEVICE_MISSING" ||
        reason === "DEVICE_NOT_BOUND" ||
        reason === "DEVICE_USER_MISMATCH"
      ) {
        return res.status(401).json({
          success: false,
          code: "DEVICE_VALIDATION_FAILED",
          message:
            "This session is not valid for this device. Please login again.",
        });
      }

      // Expired: revoke the DB row as well so the registry
      // stops carrying a session that can never be used again.
      if (reason === "EXPIRED") {
        await markSessionAsExpired(sessionId);

        await destroySession(req);

        return res.status(401).json({
          success: false,
          code: "SESSION_INVALID",
          message:
            "Session expired or revoked. Please login again.",
        });
      }

      // Actual server-side invalidation:
      // revoked / missing session
      if (
        reason === "REVOKED" ||
        reason === "NOT_FOUND" ||
        reason === "USER_MISMATCH"
      ) {
        await destroySession(req);

        return res.status(401).json({
          success: false,
          code: "SESSION_INVALID",
          message:
            "Session expired or revoked. Please login again.",
        });
      }
    }

    /*
     * Check current user security state.
     */
    const securityState = await getUserSecurityState(userId);

    if (!securityState || securityState.status !== "active") {
      await destroySession(req);

      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    /*
     * Validate session authentication timestamp.
     */
    const authenticatedDate = new Date(authenticatedAt);

    if (Number.isNaN(authenticatedDate.getTime())) {
      await destroySession(req);

      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    /*
     * Password-change invalidation.
     *
     * If the password was changed after this session
     * was authenticated, invalidate the session.
     */
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

    /*
     * Update session activity.
     */
    await touchSession(sessionId);

    if (device?.id) {
      await touchDevice(device.id);
    }

    next();
  } catch (error) {
    next(error);
  }
}
