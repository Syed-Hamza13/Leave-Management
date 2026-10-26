import { ok } from "../../lib/responses.js";
import {
  sectionKeyParamSchema,
  saveSectionConfigSchema,
} from "./sectionConfig.validation.js";
import {
  getSectionConfiguration,
  saveSectionConfiguration,
  deleteSectionConfiguration,
} from "./sectionConfig.service.js";

function actorFrom(req) {
  return {
    userId: req.session?.user?.id ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  };
}

export async function getSectionConfigHandler(req, res, next) {
  try {
    const { sectionKey } = sectionKeyParamSchema.parse(req.params);
    const config = await getSectionConfiguration(sectionKey);

    return ok(res, config);
  } catch (error) {
    return next(error);
  }
}

export async function saveSectionConfigHandler(req, res, next) {
  try {
    const { sectionKey } = sectionKeyParamSchema.parse(req.params);
    const payload = saveSectionConfigSchema.parse(req.body);

    const saved = await saveSectionConfiguration(sectionKey, payload, actorFrom(req));

    return ok(res, saved);
  } catch (error) {
    return next(error);
  }
}

export async function deleteSectionConfigHandler(req, res, next) {
  try {
    const { sectionKey } = sectionKeyParamSchema.parse(req.params);
    const result = await deleteSectionConfiguration(sectionKey, actorFrom(req));

    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}
