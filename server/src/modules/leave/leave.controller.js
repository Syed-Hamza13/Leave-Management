import { ok, created, okMessage } from "../../lib/responses.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import * as balanceService from "./balance/balance.service.js";
import * as applicationService from "./applications/application.service.js";
import * as policyService from "./policy/policy.service.js";
import * as leaveTypeService from "./types/leaveType.service.js";
import * as ruleService from "./rules/rule.service.js";
import * as workflowService from "./workflow/workflow.service.js";
import * as calendarService from "./calendars/calendar.service.js";
import * as reportService from "./reports/report.service.js";

// ==========================================
// EMPLOYEE ACTIONS
// ==========================================

export async function getDashboard(req, res, next) {
  try {
    const userId = req.session.user.id;
    const [balances, myApps, pendingApprovals] = await Promise.all([
      balanceService.getUserBalances(userId),
      applicationService.getUserApplications(userId, { limit: 5 }),
      applicationService.getPendingApprovals(userId),
    ]);

    const activeLeaves = myApps.filter((a) => a.status === "APPROVED");
    const pendingRequests = myApps.filter((a) =>
      ["SUBMITTED", "PENDING_APPROVAL", "PARTIALLY_APPROVED"].includes(a.status)
    );

    const usedDays = balances.reduce((sum, b) => sum + Number(b.consumed || 0), 0);
    const availableDays = balances.reduce((sum, b) => sum + Number(b.closing_balance || 0), 0);

    return ok(res, {
      summary: {
        availableUnits: availableDays,
        usedUnits: usedDays,
        pendingCount: pendingRequests.length,
        approvalQueueCount: pendingApprovals.length,
      },
      balances,
      recentApplications: myApps.slice(0, 5),
      activeLeaves: activeLeaves.slice(0, 3),
      pendingApprovals: pendingApprovals.slice(0, 5),
    });
  } catch (err) {
    next(err);
  }
}

export async function getBalances(req, res, next) {
  try {
    const userId = req.session.user.id;
    const balances = await balanceService.getUserBalances(userId);
    return ok(res, balances);
  } catch (err) {
    next(err);
  }
}

export async function getBalanceLedger(req, res, next) {
  try {
    const balanceId = Number(req.params.id);
    const ledger = await balanceService.getBalanceLedger(balanceId);
    return ok(res, ledger);
  } catch (err) {
    next(err);
  }
}

export async function previewCalculation(req, res, next) {
  try {
    const userId = req.session.user.id;
    const result = await applicationService.calculatePreview({
      userId,
      payload: req.body,
    });
    return ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function submitApplication(req, res, next) {
  try {
    const userId = req.session.user.id;
    const result = await applicationService.submitApplication({
      userId,
      payload: req.body,
      actorUserId: userId,
    });
    return created(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getMyApplications(req, res, next) {
  try {
    const userId = req.session.user.id;
    const apps = await applicationService.getUserApplications(userId, req.query);
    return ok(res, apps);
  } catch (err) {
    next(err);
  }
}

export async function getApplicationDetails(req, res, next) {
  try {
    const appId = Number(req.params.id);
    const userId = req.session.user.id;
    const hasManage = req.permissions ? req.permissions.has(PERMISSIONS.LEAVE_POLICIES_MANAGE) : false;
    const details = await applicationService.getApplicationDetails(appId, userId, hasManage);
    return ok(res, details);
  } catch (err) {
    next(err);
  }
}

export async function cancelApplication(req, res, next) {
  try {
    const appId = Number(req.params.id);
    const userId = req.session.user.id;
    const reason = req.body?.reason || "Cancelled by employee";
    const result = await applicationService.cancelApplication({
      applicationId: appId,
      userId,
      reason,
    });
    return okMessage(res, "Leave application cancelled successfully.", result);
  } catch (err) {
    next(err);
  }
}

export async function getTeamCalendar(req, res, next) {
  try {
    const startDate = req.query.startDate || new Date().toISOString().slice(0, 10);
    const endDate = req.query.endDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const [apps, holidays] = await Promise.all([
      applicationService.getAllApplications({ startDate, endDate, status: "APPROVED" }),
      calendarService.getHolidaysBetween(1, startDate, endDate),
    ]);

    // Anonymize/mask sensitive info for team calendar view
    const calendarEvents = [
      ...apps.map((a) => ({
        id: `leave-${a.id}`,
        type: "leave",
        title: `${a.applicant_name} (${a.leave_type_name})`,
        startDate: a.start_date,
        endDate: a.end_date,
        units: a.calculated_units,
        applicantName: a.applicant_name,
      })),
      ...holidays.map((h) => ({
        id: `holiday-${h.id}`,
        type: "holiday",
        title: `Holiday: ${h.name}`,
        startDate: h.holiday_date,
        endDate: h.holiday_date,
        holidayType: h.holiday_type,
      })),
    ];

    return ok(res, calendarEvents);
  } catch (err) {
    next(err);
  }
}

// ==========================================
// APPROVAL ACTIONS
// ==========================================

export async function getPendingApprovals(req, res, next) {
  try {
    const userId = req.session.user.id;
    const pending = await applicationService.getPendingApprovals(userId);
    return ok(res, pending);
  } catch (err) {
    next(err);
  }
}

export async function approveApplication(req, res, next) {
  try {
    const appId = Number(req.params.id);
    const approverUserId = req.session.user.id;
    const comments = req.body?.comments;
    const result = await applicationService.approveApplication({
      applicationId: appId,
      approverUserId,
      comments,
    });
    return okMessage(res, "Leave request approved.", result);
  } catch (err) {
    next(err);
  }
}

export async function rejectApplication(req, res, next) {
  try {
    const appId = Number(req.params.id);
    const approverUserId = req.session.user.id;
    const comments = req.body?.comments;
    const result = await applicationService.rejectApplication({
      applicationId: appId,
      approverUserId,
      comments,
    });
    return okMessage(res, "Leave request rejected.", result);
  } catch (err) {
    next(err);
  }
}

// ==========================================
// ADMIN CONFIGURATION
// ==========================================

export async function getPolicies(req, res, next) {
  try {
    const policies = await policyService.getAllPolicies();
    return ok(res, policies);
  } catch (err) {
    next(err);
  }
}

export async function getPolicy(req, res, next) {
  try {
    const policy = await policyService.getPolicyById(Number(req.params.id));
    return ok(res, policy);
  } catch (err) {
    next(err);
  }
}

export async function createPolicy(req, res, next) {
  try {
    const userId = req.session.user.id;
    const createdPolicy = await policyService.createNewPolicy(req.body, userId);
    return created(res, createdPolicy);
  } catch (err) {
    next(err);
  }
}

export async function updatePolicy(req, res, next) {
  try {
    const userId = req.session.user.id;
    const updated = await policyService.updateExistingPolicy(Number(req.params.id), req.body, userId);
    return ok(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function publishPolicy(req, res, next) {
  try {
    const userId = req.session.user.id;
    const published = await policyService.publishPolicy(Number(req.params.id), userId);
    return okMessage(res, "Policy version published successfully.", published);
  } catch (err) {
    next(err);
  }
}

export async function archivePolicy(req, res, next) {
  try {
    const userId = req.session.user.id;
    const archived = await policyService.archivePolicy(Number(req.params.id), userId);
    return okMessage(res, "Policy archived.", archived);
  } catch (err) {
    next(err);
  }
}

export async function getLeaveTypes(req, res, next) {
  try {
    const policyId = Number(req.query.policyId);
    if (!policyId) {
      const defaultPolicy = await policyService.getPolicyForUser(req.session.user.id);
      const types = await leaveTypeService.getLeaveTypesForPolicy(defaultPolicy.id);
      return ok(res, types);
    }
    const types = await leaveTypeService.getLeaveTypesForPolicy(policyId);
    return ok(res, types);
  } catch (err) {
    next(err);
  }
}

export async function createLeaveType(req, res, next) {
  try {
    const type = await leaveTypeService.createNewLeaveType(req.body);
    return created(res, type);
  } catch (err) {
    next(err);
  }
}

export async function updateLeaveType(req, res, next) {
  try {
    const updated = await leaveTypeService.updateExistingLeaveType(Number(req.params.id), req.body);
    return ok(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function archiveLeaveType(req, res, next) {
  try {
    const result = await leaveTypeService.archiveLeaveType(Number(req.params.id));
    return ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getRules(req, res, next) {
  try {
    const policyId = Number(req.query.policyId);
    const rules = await ruleService.getRulesForPolicy(policyId, req.query.leaveTypeId);
    return ok(res, rules);
  } catch (err) {
    next(err);
  }
}

export async function createRule(req, res, next) {
  try {
    const rule = await ruleService.createNewRule(req.body);
    return created(res, rule);
  } catch (err) {
    next(err);
  }
}

export async function updateRule(req, res, next) {
  try {
    const updated = await ruleService.updateExistingRule(Number(req.params.id), req.body);
    return ok(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteRule(req, res, next) {
  try {
    const result = await ruleService.deleteRule(Number(req.params.id));
    return ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getWorkflows(req, res, next) {
  try {
    const policyId = Number(req.query.policyId);
    const workflows = await workflowService.getWorkflowsForPolicy(policyId);
    return ok(res, workflows);
  } catch (err) {
    next(err);
  }
}

export async function createWorkflow(req, res, next) {
  try {
    const wf = await workflowService.createNewWorkflow(req.body);
    return created(res, wf);
  } catch (err) {
    next(err);
  }
}

export async function updateWorkflow(req, res, next) {
  try {
    const updated = await workflowService.updateExistingWorkflow(Number(req.params.id), req.body);
    return ok(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteWorkflow(req, res, next) {
  try {
    const result = await workflowService.deleteWorkflow(Number(req.params.id));
    return ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function addWorkflowStep(req, res, next) {
  try {
    const step = await workflowService.addWorkflowStep(req.body);
    return created(res, step);
  } catch (err) {
    next(err);
  }
}

export async function deleteWorkflowStep(req, res, next) {
  try {
    const result = await workflowService.removeWorkflowStep(Number(req.params.stepId));
    return ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getCalendars(req, res, next) {
  try {
    const calendars = await calendarService.getAllCalendars();
    return ok(res, calendars);
  } catch (err) {
    next(err);
  }
}

export async function createCalendar(req, res, next) {
  try {
    const userId = req.session.user.id;
    const cal = await calendarService.createNewCalendar(req.body, userId);
    return created(res, cal);
  } catch (err) {
    next(err);
  }
}

export async function updateCalendar(req, res, next) {
  try {
    const userId = req.session.user.id;
    const updated = await calendarService.updateExistingCalendar(Number(req.params.id), req.body, userId);
    return ok(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function getHolidays(req, res, next) {
  try {
    const calendarId = Number(req.params.calendarId || req.query.calendarId || 1);
    const holidays = await calendarService.getCalendarHolidays(calendarId);
    return ok(res, holidays);
  } catch (err) {
    next(err);
  }
}

export async function addHoliday(req, res, next) {
  try {
    const userId = req.session.user.id;
    const holiday = await calendarService.addHoliday(req.body, userId);
    return created(res, holiday);
  } catch (err) {
    next(err);
  }
}

export async function deleteHoliday(req, res, next) {
  try {
    const result = await calendarService.removeHoliday(Number(req.params.id));
    return ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getAllBalances(req, res, next) {
  try {
    const balances = await balanceService.getAllBalances(req.query);
    return ok(res, balances);
  } catch (err) {
    next(err);
  }
}

export async function adjustBalance(req, res, next) {
  try {
    const userId = req.session.user.id;
    const adjusted = await balanceService.adjustBalance({
      balanceId: req.body.balanceId,
      quantity: req.body.quantity,
      transactionType: req.body.transactionType,
      reason: req.body.reason,
      actorUserId: userId,
    });
    return okMessage(res, "Balance adjusted successfully.", adjusted);
  } catch (err) {
    next(err);
  }
}

export async function getReportsSummary(req, res, next) {
  try {
    const summaries = await reportService.getLeaveSummaries();
    return ok(res, summaries);
  } catch (err) {
    next(err);
  }
}

export async function getMonthlyRegister(req, res, next) {
  try {
    const register = await reportService.getMonthlyRegister(req.query.year, req.query.month);
    return ok(res, register);
  } catch (err) {
    next(err);
  }
}
