import {
  loginUser,
  getCurrentUser,
} from "./auth.service.js";

import { loginSchema } from "./auth.validation.js";

export async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);

    /*
     * Regenerate the session before establishing
     * authenticated state.
     *
     * This helps prevent session fixation.
     */
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    const user = await loginUser(data);

    req.session.user = {
      id: user.id,
    };

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
    const user = await getCurrentUser(req.session.user.id);

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