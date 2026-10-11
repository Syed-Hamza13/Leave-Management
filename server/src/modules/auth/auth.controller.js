import { loginUser, getCurrentUser } from "./auth.service.js";
import { loginSchema } from "./auth.validation.js";
import { registerSession } from "./session.service.js";
import { revokeSessionById } from "./session.service.js";

export async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);

    const user = await loginUser(data);

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    req.session.user = {
      id: user.id,
    };

    req.session.authenticatedAt = new Date().toISOString();

    req.session.cookie.maxAge = 1000 * 60 * 60 * 8;

    const sessionId = req.sessionID;

    const expiresAt = new Date(Date.now() + req.session.cookie.maxAge);

    await registerSession({
      userId: user.id,
      sessionId,
      deviceId: data.deviceId || null,
      userAgent: req.get("user-agent") || null,
      ipAddress: req.ip || null,
      expiresAt,
    });

    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

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
     * Revoke the application-level session record first.
     */
    if (sessionId) {
      await revokeSessionById(sessionId);
    }

    /*
     * Destroy the actual Express/Redis session.
     */
    await new Promise((resolve, reject) => {
      req.session.destroy((error) => {
        if (error) reject(error);
        else resolve();
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
