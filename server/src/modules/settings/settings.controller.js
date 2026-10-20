import { ok, okMessage } from "../../lib/responses.js";

import { updateSmtpSchema, updateTurnstileSchema } from "./settings.validation.js";
import {
  getSmtpSettings,
  getTurnstileSettings,
  listSettings,
  testSmtpSettings,
  updateSmtpSettings,
  updateTurnstileSettings,
} from "./settings.service.js";

function actorFrom(req) {
  return {
    userId: req.currentUserId ?? req.session?.user?.id ?? null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export async function listSettingsHandler(req, res, next) {
  try {
    return ok(res, await listSettings());
  } catch (error) {
    return next(error);
  }
}

export async function getSmtpHandler(req, res, next) {
  try {
    return ok(res, await getSmtpSettings());
  } catch (error) {
    return next(error);
  }
}

export async function updateSmtpHandler(req, res, next) {
  try {
    const payload = updateSmtpSchema.parse(req.body);

    return ok(
      res,
      await updateSmtpSettings(payload, {
        ...actorFrom(req),
      })
    );
  } catch (error) {
    return next(error);
  }
}

export async function testSmtpHandler(req, res, next) {
  try {
    const result = await testSmtpSettings(actorFrom(req));

    return okMessage(
      res,
      result.authAccepted
        ? "The mail server accepted the connection and the credentials."
        : "The mail server was reachable and answered over TLS.",
      result
    );
  } catch (error) {
    return next(error);
  }
}

export async function getTurnstileHandler(req, res, next) {
  try {
    return ok(res, await getTurnstileSettings());
  } catch (error) {
    return next(error);
  }
}

export async function updateTurnstileHandler(req, res, next) {
  try {
    const payload = updateTurnstileSchema.parse(req.body);

    return ok(
      res,
      await updateTurnstileSettings(payload, {
        ...actorFrom(req),
      })
    );
  } catch (error) {
    return next(error);
  }
}

