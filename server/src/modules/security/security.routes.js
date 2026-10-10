import { Router } from "express";

import {
  generateCsrfToken,
} from "../../middleware/csrf.js";

const router = Router();

router.get("/csrf", async (req, res, next) => {
  try {
    // Make sure the anonymous session is actually persisted.
    req.session.csrfInitialized = true;

    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    const token = generateCsrfToken(req, res);

    res.json({
      success: true,
      csrfToken: token,
    });
  } catch (error) {
    next(error);
  }
});

export default router;