import { env } from "../../config/env.js";
import { loginUser, getCurrentUser } from "./auth.service.js";
import { loginSchema } from "./auth.validation.js";
import {
  registerSession,
  getSession,
  validateSession,
} from "./session.service.js";
import { revokeSessionById } from "./session.service.js";
import {
  generateDeviceToken,
  getDeviceByToken,
  registerDevice,
} from "./device.service.js";

const SESSION_MAX_AGE = 1000 * 60 * 60 * 8;

const DEVICE_COOKIE_NAME = "leave.device";

const DEVICE_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365;

function generateFreshSession(req) {
  return new Promise((resolve, reject) => {
    if (
      !req.sessionStore ||
      typeof req.sessionStore.generate !== "function"
    ) {
      return reject(
        new Error("Session store does not support fresh session generation")
      );
    }

    /*
     * IMPORTANT:
     *
     * Do NOT use req.session.regenerate() here.
     *
     * regenerate() destroys the existing Redis session first.
     *
     * If the incoming cookie belongs to another device/session,
     * that could destroy the legitimate user's session.
     *
     * store.generate() creates a completely fresh SID/session
     * without destroying the previous one.
     */
    req.sessionStore.generate(req);

    resolve();
  });
}

export async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);

    const userAgent = req.get("user-agent") || null;

    /*
     * Legacy client device id. requireAuth.js still compares
     * user_sessions.device_id against this header, so sessions
     * keep carrying it until the device cookie check replaces it.
     */
    const clientDeviceId = req.get("X-Device-ID") || null;

    let device = null;
    let deviceToken = req.cookies?.[DEVICE_COOKIE_NAME];

    if (deviceToken) {
      device = await getDeviceByToken(deviceToken);
    }

    console.log("========== LOGIN REQUEST ==========");
    console.log("IP:", req.ip);
    console.log("User-Agent:", userAgent);
    console.log("X-Device-ID:", clientDeviceId);
    console.log("Device cookie present:", Boolean(deviceToken));
    console.log("Known device:", device ? device.id : null);
    console.log("Session ID BEFORE fresh session:", req.sessionID);
    console.log("Existing session user:", req.session?.user?.id || null);
    console.log("===================================");

    /*
     * First validate credentials.
     *
     * We deliberately do this BEFORE touching the current session.
     */
    const user = await loginUser(data);

    /*
     * registerDevice() returns { deviceId, deviceToken }, whereas
     * getDeviceByToken() returns the user_devices row. userDeviceId
     * keeps one consistent source for the session binding.
     */
    let userDeviceId = device?.id ?? null;

    if (!userDeviceId || String(device.user_id) !== String(user.id)) {
      /*
       * Either no known device credential, or the credential
       * belongs to another user. Never attach this user's
       * sessions to that device — issue a fresh credential.
       */
      deviceToken = generateDeviceToken();

      const registered = await registerDevice({
        userId: user.id,
        deviceToken,
        userAgent,
      });

      userDeviceId = registered.deviceId;
    }

    res.cookie(DEVICE_COOKIE_NAME, deviceToken, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: DEVICE_COOKIE_MAX_AGE,
      path: "/",
    });

    /*
     * Capture the incoming session before replacing req.session.
     *
     * This is important because the incoming session may belong
     * to another legitimate browser.
     */
    const previousSessionId = req.sessionID;
    const previousSessionUserId = req.session?.user?.id || null;

    /*
     * If an authenticated session already exists, inspect it.
     *
     * This is only informational/security logic.
     * We NEVER destroy it here.
     */
    if (previousSessionId && previousSessionUserId) {
      const existingSession = await getSession(previousSessionId);

      if (existingSession) {
        const validation = await validateSession(
          previousSessionId,
          previousSessionUserId,
          device,
          userAgent
        );

        if (!validation.valid) {
          console.log(
            `⚠️ Existing session will NOT be destroyed: ${validation.reason}`
          );
        } else {
          console.log(
            "ℹ️ Existing authenticated session belongs to this device."
          );
        }
      }
    }

    /*
     * Create a completely NEW Express/Redis session.
     *
     * Unlike req.session.regenerate(), this does NOT destroy
     * the previous session.
     */
    await generateFreshSession(req);

    /*
     * The browser will now receive the new session ID.
     *
     * The previous session remains untouched in Redis and in
     * user_sessions.
     */
    req.session.user = {
      id: user.id,
    };

    req.session.authenticatedAt = new Date().toISOString();

    req.session.cookie.maxAge = SESSION_MAX_AGE;

    const sessionId = req.sessionID;

    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);

    await registerSession({
      userId: user.id,
      sessionId,
      userDeviceId,
      deviceId: clientDeviceId,
      userAgent,
      ipAddress: req.ip || null,
      expiresAt,
    });

    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    console.log("========== LOGIN SUCCESS ==========");
    console.log("Previous Session ID:", previousSessionId);
    console.log("New Session ID:", sessionId);
    console.log("User ID:", user.id);
    console.log("Previous session preserved:", Boolean(previousSessionId));
    console.log("===================================");

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const sessionId = req.sessionID;

    /*
     * Revoke only the current application-level session.
     */
    if (sessionId) {
      await revokeSessionById(sessionId);
    }

    /*
     * Destroy only the current Express/Redis session.
     */
    await new Promise((resolve, reject) => {
      req.session.destroy((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    res.clearCookie("leave.sid");

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    const userId = req.session?.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const user = await getCurrentUser(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
}