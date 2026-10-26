import crypto from "node:crypto";
import { notFound, badRequest, conflict, forbidden, unprocessable } from "../../../lib/appError.js";
import { withTransaction } from "../../../lib/transactions.js";
import { recordAudit } from "../../audit/audit.service.js";
import { LEAVE_ERROR_CODES, LEAVE_STATUS } from "../leave.constants.js";
import * as applicationRepo from "./application.repository.js";
import * as policyService from "../policy/policy.service.js";
import * as leaveTypeService from "../types/leaveType.service.js";
import * as calendarService from "../calendars/calendar.service.js";
import * as balanceService from "../balance/balance.service.js";
import * as workflowService from "../workflow/workflow.service.js";
import { calculateLeaveDays } from "../calculation/leaveCalculation.service.js";

function generateApplicationNumber() {
  const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
  const year = new Date().getFullYear();
  return `LV-${year}-${randomHex}`;
}

export async function calculatePreview({ userId, payload }) {
  const policy = await policyService.getPolicyForUser(userId);
  const leaveType = await leaveTypeService.getLeaveTypeById(payload.leaveTypeId);
  const calendar = await calendarService.getCalendarById(policy.calendar_id);
  const balance = await balanceService.getUserBalance(userId, leaveType.id);

  const calcResult = await calculateLeaveDays({
    user: { id: userId },
    policy,
    leaveType,
    startDate: payload.startDate,
    endDate: payload.endDate,
    calendar,
    balance,
    requestContext: {
      isHalfDay: payload.isHalfDay,
      halfDayType: payload.halfDayType,
      hours: payload.hours,
      emergencyFlag: payload.emergencyFlag,
      customData: payload.customData,
    },
  });

  // Approver preview path
  let approverPath = [];
  if (leaveType.requires_approval) {
    const workflow = await workflowService.resolveWorkflowForApplication({
      policyId: policy.id,
      calculatedUnits: calcResult.calculatedUnits,
    });
    if (workflow) {
      approverPath = await workflowService.buildApprovalSnapshot(workflow, userId);
    }
  }

  return {
    ...calcResult,
    availableBalance: balance ? Number(balance.closing_balance) : 0,
    requiresApproval: Boolean(leaveType.requires_approval),
    approvalPath: approverPath,
  };
}

export async function submitApplication({ userId, payload, actorUserId }) {
  return withTransaction(async (connection) => {
    const policy = await policyService.getPolicyForUser(userId);
    const leaveType = await leaveTypeService.getLeaveTypeById(payload.leaveTypeId);
    const calendar = await calendarService.getCalendarById(policy.calendar_id);
    const balance = await balanceService.getUserBalance(userId, leaveType.id, connection);

    // Check for overlapping leaves
    const overlaps = await applicationRepo.checkOverlappingLeaves(
      userId,
      payload.startDate,
      payload.endDate,
      null,
      connection
    );
    if (overlaps.length > 0) {
      throw conflict("You already have a submitted or approved leave request spanning these dates.", {
        code: LEAVE_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST,
        details: { existingApplication: overlaps[0].application_number },
      });
    }

    // Server-side calculation & rule evaluation
    const calcResult = await calculateLeaveDays({
      user: { id: userId },
      policy,
      leaveType,
      startDate: payload.startDate,
      endDate: payload.endDate,
      calendar,
      balance,
      requestContext: {
        isHalfDay: payload.isHalfDay,
        halfDayType: payload.halfDayType,
        hours: payload.hours,
        emergencyFlag: payload.emergencyFlag,
        customData: payload.customData,
      },
    });

    if (!calcResult.passed) {
      throw unprocessable("Leave request violates policy rules.", {
        code: LEAVE_ERROR_CODES.LEAVE_RULE_CONFIGURATION_INVALID,
        errors: { rules: calcResult.violations },
        details: { violations: calcResult.violations, warnings: calcResult.warnings },
      });
    }

    const appNumber = generateApplicationNumber();
    const requiresApproval = Boolean(leaveType.requires_approval);
    const initialStatus = requiresApproval ? LEAVE_STATUS.PENDING_APPROVAL : LEAVE_STATUS.APPROVED;

    const appId = await applicationRepo.createApplication(
      {
        applicationNumber: appNumber,
        userId,
        policyId: policy.id,
        policyVersion: policy.version,
        leaveTypeId: leaveType.id,
        startDate: payload.startDate,
        endDate: payload.endDate,
        requestedUnits: calcResult.calculatedUnits,
        calculatedUnits: calcResult.calculatedUnits,
        unit: calcResult.unit,
        reason: payload.reason,
        emergencyFlag: payload.emergencyFlag,
        status: initialStatus,
        customDataJson: payload.customData,
        submittedAt: new Date(),
      },
      connection
    );

    // Insert day breakdown
    await applicationRepo.insertApplicationDays(appId, calcResult.dayBreakdown, connection);

    // Build & freeze approval chain if approval is required
    if (requiresApproval) {
      const workflow = await workflowService.resolveWorkflowForApplication({
        policyId: policy.id,
        calculatedUnits: calcResult.calculatedUnits,
      });

      if (!workflow) {
        throw unprocessable("No applicable approval workflow resolved for this request.", {
          code: LEAVE_ERROR_CODES.LEAVE_WORKFLOW_NOT_RESOLVED,
        });
      }

      const snapshot = await workflowService.buildApprovalSnapshot(workflow, userId, connection);
      await applicationRepo.insertApplicationApprovals(appId, snapshot, connection);
    } else {
      // Auto-approved leave (e.g. short leave): deduct balance immediately
      await balanceService.deductBalanceForApplication(
        {
          userId,
          leaveTypeId: leaveType.id,
          units: calcResult.calculatedUnits,
          applicationId: appId,
          actorUserId,
        },
        connection
      );

      await applicationRepo.updateApplicationStatus(
        appId,
        {
          status: LEAVE_STATUS.APPROVED,
          approvedAt: new Date(),
        },
        connection
      );
    }

    await recordAudit({
      actorUserId,
      action: "LEAVE_REQUEST_SUBMITTED",
      entityType: "leave_application",
      entityId: appId,
      summary: {
        applicationNumber: appNumber,
        userId,
        leaveTypeId: leaveType.id,
        units: calcResult.calculatedUnits,
        status: initialStatus,
      },
      connection,
    });

    const created = await applicationRepo.findApplicationById(appId, connection);
    const days = await applicationRepo.listApplicationDays(appId, connection);
    const approvals = await applicationRepo.listApplicationApprovals(appId, connection);

    return { ...created, days, approvals };
  });
}

export async function getApplicationDetails(applicationId, callerUserId, hasManagePermission = false) {
  const app = await applicationRepo.findApplicationById(applicationId);
  if (!app) {
    throw notFound("Leave application not found", { code: LEAVE_ERROR_CODES.LEAVE_APPLICATION_NOT_FOUND });
  }

  // Authorization: caller must be applicant, assigned approver, or have admin manage permission
  const approvals = await applicationRepo.listApplicationApprovals(applicationId);
  const isApplicant = app.user_id === callerUserId;
  const isApprover = approvals.some((a) => a.approver_user_id === callerUserId);

  if (!isApplicant && !isApprover && !hasManagePermission) {
    throw forbidden("You are not authorized to view this leave application.");
  }

  const days = await applicationRepo.listApplicationDays(applicationId);

  return {
    ...app,
    custom_data_json: typeof app.custom_data_json === "string" ? JSON.parse(app.custom_data_json) : app.custom_data_json,
    days,
    approvals,
  };
}

export async function getUserApplications(userId, query) {
  return applicationRepo.listApplicationsForUser(userId, query);
}

export async function getAllApplications(query) {
  return applicationRepo.listAllApplications(query);
}

export async function getPendingApprovals(userId) {
  return applicationRepo.findPendingApprovalsForUser(userId);
}

export async function approveApplication({ applicationId, approverUserId, comments }) {
  return withTransaction(async (connection) => {
    const app = await applicationRepo.findApplicationById(applicationId, connection);
    if (!app) {
      throw notFound("Leave application not found", { code: LEAVE_ERROR_CODES.LEAVE_APPLICATION_NOT_FOUND });
    }

    if (app.status === LEAVE_STATUS.APPROVED) {
      throw badRequest("Application has already been approved.", { code: LEAVE_ERROR_CODES.LEAVE_ALREADY_APPROVED });
    }
    if (app.status === LEAVE_STATUS.REJECTED || app.status === LEAVE_STATUS.CANCELLED) {
      throw badRequest(`Cannot approve an application with status '${app.status}'.`, {
        code: LEAVE_ERROR_CODES.LEAVE_INVALID_STATE,
      });
    }

    const approvals = await applicationRepo.listApplicationApprovals(applicationId, connection);
    // Find the active pending step
    const pendingStep = approvals.find((a) => a.status === "PENDING");
    if (!pendingStep) {
      throw badRequest("No pending approval step found for this application.", {
        code: LEAVE_ERROR_CODES.LEAVE_INVALID_STATE,
      });
    }

    // Verify current approver is authorized (or system administrator)
    if (pendingStep.approver_user_id && pendingStep.approver_user_id !== approverUserId) {
      const isAdmin = await applicationRepo.isUserAdmin(approverUserId, connection);
      if (!isAdmin) {
        throw forbidden("You are not the designated approver for the active step.", {
          code: LEAVE_ERROR_CODES.LEAVE_APPROVAL_NOT_ASSIGNED,
        });
      }
    }

    // Mark current step approved
    await applicationRepo.updateApprovalStep(
      pendingStep.id,
      {
        status: "APPROVED",
        actionByUserId: approverUserId,
        comments: comments || null,
        actedAt: new Date(),
      },
      connection
    );

    // Check if more pending steps exist
    const remainingPending = approvals.filter(
      (a) => a.id !== pendingStep.id && a.status === "PENDING"
    );

    if (remainingPending.length === 0) {
      // Final step approved! Deduct balance atomically
      await balanceService.deductBalanceForApplication(
        {
          userId: app.user_id,
          leaveTypeId: app.leave_type_id,
          units: app.calculated_units,
          applicationId: app.id,
          actorUserId: approverUserId,
        },
        connection
      );

      await applicationRepo.updateApplicationStatus(
        applicationId,
        {
          status: LEAVE_STATUS.APPROVED,
          approvedAt: new Date(),
        },
        connection
      );
    } else {
      // Partially approved, moves to next step
      await applicationRepo.updateApplicationStatus(
        applicationId,
        {
          status: LEAVE_STATUS.PARTIALLY_APPROVED,
        },
        connection
      );
    }

    await recordAudit({
      actorUserId: approverUserId,
      action: "LEAVE_REQUEST_APPROVED",
      entityType: "leave_application",
      entityId: applicationId,
      summary: {
        stepOrder: pendingStep.step_order,
        isFinalApproval: remainingPending.length === 0,
        comments,
      },
      connection,
    });

    return applicationRepo.findApplicationById(applicationId, connection);
  });
}

export async function rejectApplication({ applicationId, approverUserId, comments }) {
  return withTransaction(async (connection) => {
    const app = await applicationRepo.findApplicationById(applicationId, connection);
    if (!app) {
      throw notFound("Leave application not found", { code: LEAVE_ERROR_CODES.LEAVE_APPLICATION_NOT_FOUND });
    }

    if (app.status === LEAVE_STATUS.APPROVED || app.status === LEAVE_STATUS.REJECTED) {
      throw badRequest(`Application has already been resolved with status '${app.status}'.`, {
        code: LEAVE_ERROR_CODES.LEAVE_INVALID_STATE,
      });
    }

    const approvals = await applicationRepo.listApplicationApprovals(applicationId, connection);
    const pendingStep = approvals.find((a) => a.status === "PENDING");

    if (pendingStep && pendingStep.approver_user_id && pendingStep.approver_user_id !== approverUserId) {
      const isAdmin = await applicationRepo.isUserAdmin(approverUserId, connection);
      if (!isAdmin) {
        throw forbidden("You are not the designated approver for this application.", {
          code: LEAVE_ERROR_CODES.LEAVE_APPROVAL_NOT_ASSIGNED,
        });
      }
    }

    if (pendingStep) {
      await applicationRepo.updateApprovalStep(
        pendingStep.id,
        {
          status: "REJECTED",
          actionByUserId: approverUserId,
          comments: comments || null,
          actedAt: new Date(),
        },
        connection
      );
    }

    await applicationRepo.updateApplicationStatus(
      applicationId,
      {
        status: LEAVE_STATUS.REJECTED,
        rejectedAt: new Date(),
      },
      connection
    );

    await recordAudit({
      actorUserId: approverUserId,
      action: "LEAVE_REQUEST_REJECTED",
      entityType: "leave_application",
      entityId: applicationId,
      summary: { comments },
      connection,
    });

    return applicationRepo.findApplicationById(applicationId, connection);
  });
}

export async function cancelApplication({ applicationId, userId, reason }) {
  return withTransaction(async (connection) => {
    const app = await applicationRepo.findApplicationById(applicationId, connection);
    if (!app) {
      throw notFound("Leave application not found", { code: LEAVE_ERROR_CODES.LEAVE_APPLICATION_NOT_FOUND });
    }

    if (app.user_id !== userId) {
      throw forbidden("You can only cancel your own leave applications.");
    }

    if (app.status === LEAVE_STATUS.CANCELLED) {
      throw badRequest("Application has already been cancelled.", {
        code: LEAVE_ERROR_CODES.LEAVE_ALREADY_CANCELLED,
      });
    }

    if (app.status === LEAVE_STATUS.REJECTED) {
      throw badRequest("Cannot cancel a rejected application.", {
        code: LEAVE_ERROR_CODES.LEAVE_INVALID_STATE,
      });
    }

    // If already approved, reverse balance
    if (app.status === LEAVE_STATUS.APPROVED) {
      await balanceService.reverseBalanceForApplication(
        {
          userId,
          leaveTypeId: app.leave_type_id,
          units: app.calculated_units,
          applicationId: app.id,
          reason,
          actorUserId: userId,
        },
        connection
      );
    }

    await applicationRepo.updateApplicationStatus(
      applicationId,
      {
        status: LEAVE_STATUS.CANCELLED,
        cancelledAt: new Date(),
      },
      connection
    );

    await recordAudit({
      actorUserId: userId,
      action: "LEAVE_REQUEST_CANCELLED",
      entityType: "leave_application",
      entityId: applicationId,
      summary: { reason },
      connection,
    });

    return applicationRepo.findApplicationById(applicationId, connection);
  });
}
