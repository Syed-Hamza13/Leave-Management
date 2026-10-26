import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { validateBody } from "../../middleware/validate.js";
import { PERMISSIONS } from "../../lib/permissions.js";

import * as controller from "./leave.controller.js";
import { applyLeaveSchema, calculateLeaveSchema, approvalActionSchema, rejectionActionSchema } from "./applications/application.validation.js";
import { policySchema, updatePolicySchema } from "./policy/policy.validation.js";
import { leaveTypeSchema, updateLeaveTypeSchema } from "./types/leaveType.validation.js";
import { ruleSchema, updateRuleSchema } from "./rules/rule.validator.js";
import { workflowSchema, workflowStepSchema } from "./workflow/workflow.validation.js";
import { calendarSchema, updateCalendarSchema, holidaySchema } from "./calendars/calendar.validation.js";
import { manualAdjustmentSchema } from "./balance/balance.validation.js";

export function createLeaveRoutes() {
  const router = Router();

  router.use(requireAuth);

  // Employee routes
  router.get("/dashboard", requirePermission(PERMISSIONS.LEAVE_VIEW), controller.getDashboard);
  router.get("/balances", requirePermission(PERMISSIONS.LEAVE_VIEW), controller.getBalances);
  router.get("/balances/my", requirePermission(PERMISSIONS.LEAVE_VIEW), controller.getBalances);
  router.get("/balances/:id/ledger", requirePermission(PERMISSIONS.LEAVE_VIEW), controller.getBalanceLedger);

  router.post("/calculate", requirePermission(PERMISSIONS.LEAVE_APPLY), validateBody(calculateLeaveSchema), controller.previewCalculation);
  router.post("/applications", requirePermission(PERMISSIONS.LEAVE_APPLY), validateBody(applyLeaveSchema), controller.submitApplication);
  router.get("/applications", requirePermission(PERMISSIONS.LEAVE_VIEW), controller.getMyApplications);
  router.get("/applications/:id", requirePermission(PERMISSIONS.LEAVE_VIEW), controller.getApplicationDetails);
  router.post("/applications/:id/cancel", requirePermission(PERMISSIONS.LEAVE_CANCEL), controller.cancelApplication);
  router.get("/calendar", requirePermission(PERMISSIONS.LEAVE_CALENDAR_VIEW), controller.getTeamCalendar);

  // Approvals
  router.get("/approvals/pending", requirePermission(PERMISSIONS.LEAVE_APPROVE), controller.getPendingApprovals);
  router.post("/approvals/:id/approve", requirePermission(PERMISSIONS.LEAVE_APPROVE), validateBody(approvalActionSchema), controller.approveApplication);
  router.post("/approvals/:id/reject", requirePermission(PERMISSIONS.LEAVE_REJECT), validateBody(rejectionActionSchema), controller.rejectApplication);

  // Leave types lookup for employee dropdowns
  router.get("/types", requirePermission(PERMISSIONS.LEAVE_VIEW, PERMISSIONS.LEAVE_APPLY), controller.getLeaveTypes);

  return router;
}

export function createAdminLeaveRoutes() {
  const router = Router();

  router.use(requireAuth);

  // Policies
  router.get("/policies", requirePermission(PERMISSIONS.LEAVE_POLICIES_VIEW), controller.getPolicies);
  router.get("/policies/:id", requirePermission(PERMISSIONS.LEAVE_POLICIES_VIEW), controller.getPolicy);
  router.post("/policies", requirePermission(PERMISSIONS.LEAVE_POLICIES_MANAGE), validateBody(policySchema), controller.createPolicy);
  router.patch("/policies/:id", requirePermission(PERMISSIONS.LEAVE_POLICIES_MANAGE), validateBody(updatePolicySchema), controller.updatePolicy);
  router.post("/policies/:id/publish", requirePermission(PERMISSIONS.LEAVE_POLICIES_MANAGE), controller.publishPolicy);
  router.post("/policies/:id/archive", requirePermission(PERMISSIONS.LEAVE_POLICIES_MANAGE), controller.archivePolicy);

  // Leave Types
  router.get("/types", requirePermission(PERMISSIONS.LEAVE_TYPES_VIEW), controller.getLeaveTypes);
  router.post("/types", requirePermission(PERMISSIONS.LEAVE_TYPES_MANAGE), validateBody(leaveTypeSchema), controller.createLeaveType);
  router.patch("/types/:id", requirePermission(PERMISSIONS.LEAVE_TYPES_MANAGE), validateBody(updateLeaveTypeSchema), controller.updateLeaveType);
  router.delete("/types/:id", requirePermission(PERMISSIONS.LEAVE_TYPES_MANAGE), controller.archiveLeaveType);

  // Rules
  router.get("/rules", requirePermission(PERMISSIONS.LEAVE_RULES_VIEW), controller.getRules);
  router.post("/rules", requirePermission(PERMISSIONS.LEAVE_RULES_MANAGE), validateBody(ruleSchema), controller.createRule);
  router.patch("/rules/:id", requirePermission(PERMISSIONS.LEAVE_RULES_MANAGE), validateBody(updateRuleSchema), controller.updateRule);
  router.delete("/rules/:id", requirePermission(PERMISSIONS.LEAVE_RULES_MANAGE), controller.deleteRule);

  // Workflows
  router.get("/workflows", requirePermission(PERMISSIONS.LEAVE_WORKFLOWS_VIEW), controller.getWorkflows);
  router.post("/workflows", requirePermission(PERMISSIONS.LEAVE_WORKFLOWS_MANAGE), validateBody(workflowSchema), controller.createWorkflow);
  router.patch("/workflows/:id", requirePermission(PERMISSIONS.LEAVE_WORKFLOWS_MANAGE), controller.updateWorkflow);
  router.delete("/workflows/:id", requirePermission(PERMISSIONS.LEAVE_WORKFLOWS_MANAGE), controller.deleteWorkflow);
  router.post("/workflows/:id/steps", requirePermission(PERMISSIONS.LEAVE_WORKFLOWS_MANAGE), validateBody(workflowStepSchema), controller.addWorkflowStep);
  router.delete("/workflows/steps/:stepId", requirePermission(PERMISSIONS.LEAVE_WORKFLOWS_MANAGE), controller.deleteWorkflowStep);

  // Calendars & Holidays
  router.get("/calendars", requirePermission(PERMISSIONS.LEAVE_CALENDARS_VIEW), controller.getCalendars);
  router.post("/calendars", requirePermission(PERMISSIONS.LEAVE_CALENDARS_MANAGE), validateBody(calendarSchema), controller.createCalendar);
  router.patch("/calendars/:id", requirePermission(PERMISSIONS.LEAVE_CALENDARS_MANAGE), validateBody(updateCalendarSchema), controller.updateCalendar);
  router.get("/holidays", requirePermission(PERMISSIONS.LEAVE_CALENDARS_VIEW), controller.getHolidays);
  router.post("/holidays", requirePermission(PERMISSIONS.LEAVE_CALENDARS_MANAGE), validateBody(holidaySchema), controller.addHoliday);
  router.delete("/holidays/:id", requirePermission(PERMISSIONS.LEAVE_CALENDARS_MANAGE), controller.deleteHoliday);

  // Balances
  router.get("/balances", requirePermission(PERMISSIONS.LEAVE_BALANCES_VIEW), controller.getAllBalances);
  router.post("/balances/adjust", requirePermission(PERMISSIONS.LEAVE_BALANCES_MANAGE), validateBody(manualAdjustmentSchema), controller.adjustBalance);

  // Reports
  router.get("/reports/summary", requirePermission(PERMISSIONS.LEAVE_REPORTS_VIEW), controller.getReportsSummary);
  router.get("/reports/register", requirePermission(PERMISSIONS.LEAVE_REPORTS_VIEW), controller.getMonthlyRegister);

  return router;
}
