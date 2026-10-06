import { Router } from "express";

import {
  generateCsrfToken,
} from "../../middleware/csrf.js";

const router = Router();

router.get("/csrf", (req, res) => {
  const token = generateCsrfToken(req, res);

  res.json({
    success: true,
    csrfToken: token,
  });
});

export default router;