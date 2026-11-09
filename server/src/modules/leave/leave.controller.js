import { ok, created } from "../../lib/responses.js";
import {
  leavePreviewSchema,
  leaveSubmitSchema,
  leaveActionSchema,
  leaveRulesSchema,
  workflowConfigSchema,
} from "./leave.validation.js";
import {
  previewLeaveRequest,
  submitLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  listMyRequests,
  listPendingApprovals,
  getLeaveRules,
  saveLeaveRules,
  getWorkflowConfig,
  saveWorkflowConfig,
  getHolidays,
  saveHolidays,
} from "./leave.service.js";

function getActorUserId(req) {
  return req.session?.user?.id ?? null;
}

export async function previewLeaveHandler(req, res, next) {
  try {
    const payload = leavePreviewSchema.parse(req.body);
    const applicantId = req.body.applicantId || getActorUserId(req);

    const preview = await previewLeaveRequest({
      applicantId,
      ...payload,
    });

    return ok(res, preview);
  } catch (error) {
    return next(error);
  }
}

export async function submitLeaveHandler(req, res, next) {
  try {
    const payload = leaveSubmitSchema.parse(req.body);
    const applicantId = getActorUserId(req);

    const result = await submitLeaveRequest({
      applicantId,
      ...payload,
      actorUserId: applicantId,
    });

    return created(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function approveLeaveHandler(req, res, next) {
  try {
    const { requestId } = req.params;
    const { remarks } = leaveActionSchema.parse(req.body || {});
    const actorUserId = getActorUserId(req);

    const result = await approveLeaveRequest({
      requestId: Number(requestId),
      remarks,
      actorUserId,
    });

    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function rejectLeaveHandler(req, res, next) {
  try {
    const { requestId } = req.params;
    const { remarks } = leaveActionSchema.parse(req.body || {});
    const actorUserId = getActorUserId(req);

    const result = await rejectLeaveRequest({
      requestId: Number(requestId),
      remarks,
      actorUserId,
    });

    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function cancelLeaveHandler(req, res, next) {
  try {
    const { requestId } = req.params;
    const actorUserId = getActorUserId(req);

    const result = await cancelLeaveRequest({
      requestId: Number(requestId),
      actorUserId,
    });

    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listMyRequestsHandler(req, res, next) {
  try {
    const userId = getActorUserId(req);
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const status = req.query.status || null;

    const result = await listMyRequests(userId, { status, page, pageSize });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listPendingApprovalsHandler(req, res, next) {
  try {
    const userId = getActorUserId(req);
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;

    const result = await listPendingApprovals(userId, { page, pageSize });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getLeaveRulesHandler(req, res, next) {
  try {
    const rules = await getLeaveRules();
    return ok(res, rules);
  } catch (error) {
    return next(error);
  }
}

export async function saveLeaveRulesHandler(req, res, next) {
  try {
    const { rules } = leaveRulesSchema.parse(req.body);
    const actorUserId = getActorUserId(req);

    const saved = await saveLeaveRules(rules, actorUserId);
    return ok(res, saved);
  } catch (error) {
    return next(error);
  }
}

export async function getWorkflowConfigHandler(req, res, next) {
  try {
    const config = await getWorkflowConfig();
    return ok(res, config);
  } catch (error) {
    return next(error);
  }
}

export async function saveWorkflowConfigHandler(req, res, next) {
  try {
    const config = workflowConfigSchema.parse(req.body);
    const actorUserId = getActorUserId(req);

    const saved = await saveWorkflowConfig(config, actorUserId);
    return ok(res, saved);
  } catch (error) {
    return next(error);
  }
}

export async function getHolidaysHandler(req, res, next) {
  try {
    const holidays = await getHolidays();
    return ok(res, holidays);
  } catch (error) {
    return next(error);
  }
}

export async function saveHolidaysHandler(req, res, next) {
  try {
    const holidays = Array.isArray(req.body) ? req.body : req.body.holidays || [];
    const actorUserId = getActorUserId(req);

    const saved = await saveHolidays(holidays, actorUserId);
    return ok(res, saved);
  } catch (error) {
    return next(error);
  }
}

