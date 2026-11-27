import { db } from "../../config/database.js";
import { badRequest, forbidden, notFound } from "../../lib/appError.js";
import { parseJsonColumn, stringifyJsonColumn } from "../../lib/jsonColumn.js";
import { withTransaction } from "../../lib/transactions.js";
import { recordAudit } from "../audit/audit.service.js";
import { findSectionConfigRow } from "../sections/sectionConfig.repository.js";
import {
  findTableByKey,
  insertTable,
  insertColumn,
  findColumnsByTableId,
} from "../tables/table.repository.js";
import { findUserRowById, findProfileValuesByUserIds } from "../users/user.repository.js";

import {
  calculateLeaveDuration,
  checkNoticeRequirement,
  DEFAULT_CALCULATION_CONFIG,
} from "./leave.calculator.js";
import { findMatchingRule } from "./leave.ruleEvaluator.js";
import {
  loadActiveEntitiesWithProfiles,
  resolveApprovers,
  resolveNotifyTargets,
} from "./leave.routingResolver.js";
import {
  checkLeaveBalance,
  deductLeaveBalance,
  getLeaveBalanceTableId,
} from "./leave.balance.service.js";
import {
  findLeaveRules,
  saveLeaveRules as repoSaveLeaveRules,
  findHolidays as repoFindHolidays,
  saveHolidays as repoSaveHolidays,
  findLeaveSettings,
  saveLeaveSettings as repoSaveLeaveSettings,
  DEFAULT_LEAVE_SETTINGS,
} from "./leave.repository.js";

/**
 * Ensures a dynamic managed table exists with given columns.
 * Returns the table id.
 */
async function ensureTableWithColumns({ key, label, description, columns = [], actorUserId = null }) {
  let table = await findTableByKey(key);
  if (!table) {
    const tableId = await withTransaction(async (conn) => {
      const insertedId = await insertTable(conn, {
        key,
        label,
        description,
        actorUserId,
      });

      let sortOrder = 0;
      for (const col of columns) {
        await insertColumn(conn, {
          tableId: insertedId,
          key: col.key,
          label: col.label,
          dataType: col.dataType,
          config: col.config || {},
          isRequired: Boolean(col.isRequired),
          isUnique: Boolean(col.isUnique),
          isSearchable: Boolean(col.isSearchable ?? true),
          isVisible: Boolean(col.isVisible ?? true),
          sortOrder: sortOrder++,
          actorUserId,
        });
      }
      return insertedId;
    });

    table = { id: tableId, key, label };
  }
  return Number(table.id);
}

/**
 * Ensures default leave tables exist if not already configured.
 */
export async function ensureDefaultLeaveTables(actorUserId = null) {
  const requestsTableId = await ensureTableWithColumns({
    key: "leave_requests",
    label: "Leave Requests",
    description: "Configurable table for tracking employee leave applications.",
    columns: [
      { key: "applicant", label: "Applicant", dataType: "user_reference", isRequired: true },
      { key: "leave_type", label: "Leave Type", dataType: "dropdown", isRequired: true },
      { key: "start_date", label: "Start Date", dataType: "date", isRequired: true },
      { key: "end_date", label: "End Date", dataType: "date", isRequired: true },
      { key: "session", label: "Session / Duration", dataType: "dropdown", isRequired: false },
      { key: "days", label: "Calculated Days", dataType: "number", isRequired: true },
      { key: "reason", label: "Reason", dataType: "textarea", isRequired: false },
      { key: "is_emergency", label: "Emergency / Medical", dataType: "boolean", isRequired: false },
      { key: "status", label: "Status", dataType: "dropdown", isRequired: true },
      { key: "assigned_approver", label: "Assigned Approver", dataType: "user_reference", isRequired: false },
      { key: "notified_users", label: "Informed / CC", dataType: "user_reference", isRequired: false, config: { allowMultiple: true } },
      { key: "approver_remarks", label: "Approver Remarks", dataType: "textarea", isRequired: false },
    ],
    actorUserId,
  });

  const balancesTableId = await ensureTableWithColumns({
    key: "leave_balances",
    label: "Leave Balances",
    description: "Configurable table for employee leave quotas and ledger balances.",
    columns: [
      { key: "user", label: "User", dataType: "user_reference", isRequired: true },
      { key: "leave_type", label: "Leave Type", dataType: "dropdown", isRequired: true },
      { key: "year", label: "Year", dataType: "number", isRequired: true },
      { key: "opening_balance", label: "Opening Balance", dataType: "number", isRequired: false },
      { key: "accrued", label: "Accrued", dataType: "number", isRequired: false },
      { key: "availed", label: "Availed", dataType: "number", isRequired: false },
      { key: "closing_balance", label: "Closing Balance", dataType: "number", isRequired: true },
      { key: "short_leave_slots_remaining", label: "Short Leave Slots Remaining", dataType: "number", isRequired: false },
    ],
    actorUserId,
  });

  return { requestsTableId, balancesTableId };
}

/**
 * Resolves the Leave Requests table ID from section config or table key.
 */
export async function getLeaveRequestsTableId() {
  const sectionRow = await findSectionConfigRow("leave-requests");
  if (sectionRow && sectionRow.setting_value) {
    const parsed = parseJsonColumn(sectionRow.setting_value, null);
    if (parsed && parsed.tableId) {
      return Number(parsed.tableId);
    }
  }

  const table =
    (await findTableByKey("leave_requests")) ||
    (await findTableByKey("leave_request"));

  if (table) return Number(table.id);

  const { requestsTableId } = await ensureDefaultLeaveTables();
  return requestsTableId;
}

/**
 * Loads applicant user object with custom profile attributes.
 */
async function loadApplicantUser(userId) {
  const userRow = await findUserRowById(userId);
  if (!userRow) {
    throw notFound("Applicant user not found.");
  }

  const profileMap = await findProfileValuesByUserIds([userId]);
  const values = profileMap.get(Number(userId)) || {};

  const [roleRows] = await db.execute(
    `SELECT r.role_key FROM roles r INNER JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`,
    [userId]
  );
  const roles = roleRows.map((r) => r.role_key);
  const role = roles[0] || null;

  return {
    id: Number(userRow.id),
    email: userRow.email,
    firstName: userRow.first_name,
    lastName: userRow.last_name,
    fullName: `${userRow.first_name} ${userRow.last_name}`.trim(),
    status: userRow.status,
    role,
    roles,
    values,
  };
}

/**
 * Previews a leave request calculation and routing without persisting.
 */
export async function previewLeaveRequest({
  applicantId,
  startDate,
  endDate,
  session = "full_day",
  leaveType = "Privilege Leave",
  isEmergency = false,
}) {
  const applicant = await loadApplicantUser(applicantId);
  const holidays = await repoFindHolidays();

  const isShortLeave = String(leaveType).toLowerCase().includes("short");
  const effectiveSession =
    session && session !== "full_day"
      ? session
      : isShortLeave
        ? "short_leave"
        : session || "full_day";

  const durationInfo = calculateLeaveDuration({
    startDate,
    endDate,
    session: effectiveSession,
    leaveType,
    holidays,
  });

  const noticeInfo = checkNoticeRequirement({
    startDate,
    calculatedDays: durationInfo.calculatedDays,
    isEmergency,
  });

  const balanceInfo = await checkLeaveBalance({
    userId: applicantId,
    leaveType,
    days: durationInfo.calculatedDays,
    session: effectiveSession,
  });

  const rules = await findLeaveRules();
  const entities = await loadActiveEntitiesWithProfiles();

  const requestData = {
    days: durationInfo.calculatedDays,
    leave_type: leaveType,
    session: effectiveSession,
    is_emergency: isEmergency,
    startDate,
    endDate,
  };

  const matchedRule = findMatchingRule(rules, { requestData, applicant });

  const approverInfo = matchedRule
    ? await resolveApprovers(matchedRule.actions, { applicant, entities })
    : { requiresApproval: true, approverUserIds: [], approverLabel: "Standard Approval" };

  const notifyUserIds = matchedRule
    ? resolveNotifyTargets(matchedRule.actions.notifyTargets, { applicant, entities })
    : [];

  return {
    duration: durationInfo,
    notice: noticeInfo,
    balance: balanceInfo,
    matchedRule: matchedRule ? { id: matchedRule.id, name: matchedRule.name } : null,
    approval: approverInfo,
    notifyUserIds,
  };
}

/**
 * Submits a new leave request.
 */
export async function submitLeaveRequest({
  applicantId,
  startDate,
  endDate,
  session = "full_day",
  leaveType = "Privilege Leave",
  isEmergency = false,
  reason = "",
  actorUserId = null,
}) {
  const isShortLeave = String(leaveType).toLowerCase().includes("short");
  const effectiveSession =
    session && session !== "full_day"
      ? session
      : isShortLeave
        ? "short_leave"
        : session || "full_day";

  const preview = await previewLeaveRequest({
    applicantId,
    startDate,
    endDate,
    session: effectiveSession,
    leaveType,
    isEmergency,
  });

  const tableId = await getLeaveRequestsTableId();
  const initialStatus = preview.approval.requiresApproval ? "Pending Approval" : "Approved";
  const assignedApproverId =
    preview.approval.activeApproverUserIds?.[0] || preview.approval.approverUserIds?.[0] || null;
  const activeApprovers =
    preview.approval.activeApproverUserIds || preview.approval.approverUserIds || [];

  const recordValues = {
    applicant: Number(applicantId),
    leave_type: leaveType,
    start_date: preview.duration.startDate,
    end_date: preview.duration.endDate,
    session: effectiveSession,
    days: preview.duration.calculatedDays,
    sandwiched_days: preview.duration.sandwichedDaysCount,
    reason,
    is_emergency: Boolean(isEmergency),
    status: initialStatus,
    approval_mode: preview.approval.approvalMode || "sequential",
    current_step: 0,
    approval_steps: preview.approval.steps || [],
    approval_history: [],
    assigned_approver: assignedApproverId,
    assigned_approvers: activeApprovers,
    all_approver_ids: preview.approval.approverUserIds || [],
    notified_users: preview.notifyUserIds,
    rule_id: preview.matchedRule?.id || null,
    approver_remarks: null,
  };

  const createdId = await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `
        INSERT INTO table_records (table_id, schema_version, data, status, created_by, updated_by)
        VALUES (?, 1, ?, 'active', ?, ?)
      `,
      [tableId, stringifyJsonColumn(recordValues), applicantId, actorUserId ?? applicantId]
    );

    const insertId = result.insertId;

    // If auto-approved (e.g. Short Leave), deduct balance right away
    if (initialStatus === "Approved") {
      await deductLeaveBalance(conn, {
        userId: applicantId,
        leaveType,
        days: preview.duration.calculatedDays,
        session: effectiveSession,
        actorUserId: actorUserId ?? applicantId,
      });
    }

    await recordAudit({
      connection: conn,
      action: "leave.request.create",
      entityType: "table_records",
      entityId: insertId,
      summary: {
        tableId,
        applicantId,
        leaveType,
        days: preview.duration.calculatedDays,
        status: initialStatus,
        assignedApproverId,
      },
      actorUserId: actorUserId ?? applicantId,
    });

    return insertId;
  });

  return {
    id: createdId,
    tableId,
    status: initialStatus,
    preview,
    values: recordValues,
  };
}

/**
 * Approves a leave request, advancing multi-step chains or completing final approval.
 */
export async function approveLeaveRequest({ requestId, remarks = "", actorUserId }) {
  const tableId = await getLeaveRequestsTableId();

  const [rows] = await db.execute(
    `SELECT id, data, status, created_by FROM table_records WHERE id = ? AND table_id = ? LIMIT 1`,
    [requestId, tableId]
  );

  if (rows.length === 0) {
    throw notFound("Leave request not found.");
  }

  const record = rows[0];
  const values = parseJsonColumn(record.data, {});

  if (values.status === "Approved") {
    throw badRequest("This leave request is already approved.");
  }
  if (values.status === "Rejected") {
    throw badRequest("This leave request is already rejected.");
  }

  const steps = Array.isArray(values.approval_steps) ? values.approval_steps : [];
  const currentStepIdx = Number(values.current_step) || 0;
  const approvalMode = values.approval_mode || "sequential";
  const actorIdNum = Number(actorUserId);

  // If multi-step approval workflow is configured
  if (steps.length > 0) {
    const currentStep = steps[currentStepIdx];
    if (!currentStep) {
      throw badRequest("Invalid approval step state.");
    }

    const currentStepUserIds = (currentStep.userIds || []).map(Number);

    // In sequential mode, verify actor belongs to the current active step
    if (approvalMode === "sequential") {
      if (!currentStepUserIds.includes(actorIdNum)) {
        const isFutureApprover = steps.slice(currentStepIdx + 1).some(
          (s) => s.userIds && s.userIds.map(Number).includes(actorIdNum)
        );
        if (isFutureApprover) {
          throw badRequest(
            `Cannot approve yet. Waiting for Step ${currentStepIdx + 1} (${currentStep.label || "previous approver"}) to approve first.`
          );
        }
        throw forbidden("You are not authorized to approve at this stage of the approval chain.");
      }
    }

    // Record approval for current step
    if (!Array.isArray(currentStep.approvedBy)) {
      currentStep.approvedBy = [];
    }
    if (!currentStep.approvedBy.includes(actorIdNum)) {
      currentStep.approvedBy.push(actorIdNum);
    }

    // Record audit trail in approval history
    if (!Array.isArray(values.approval_history)) {
      values.approval_history = [];
    }
    values.approval_history.push({
      step: currentStepIdx + 1,
      stepLabel: currentStep.label,
      actorUserId: actorIdNum,
      action: "Approved",
      remarks,
      at: new Date().toISOString(),
    });

    // Check step completion condition
    const policy = currentStep.multiUserPolicy || "any";
    let isStepComplete = false;

    if (policy === "all") {
      const allApproved =
        currentStepUserIds.length > 0 &&
        currentStepUserIds.every((id) => currentStep.approvedBy.includes(Number(id)));
      if (allApproved) {
        currentStep.status = "approved";
        isStepComplete = true;
      } else {
        currentStep.status = "partially_approved";
        const remaining = currentStepUserIds.filter(
          (id) => !currentStep.approvedBy.includes(Number(id))
        );
        values.assigned_approvers = remaining;
        values.assigned_approver = remaining[0] || null;
      }
    } else {
      // "any": single user approval completes this step
      currentStep.status = "approved";
      isStepComplete = true;
    }

    // If step completed:
    if (isStepComplete) {
      const nextStepIdx = currentStepIdx + 1;

      // Are there more steps in sequential chain?
      if (approvalMode === "sequential" && nextStepIdx < steps.length) {
        values.current_step = nextStepIdx;
        const nextStep = steps[nextStepIdx];
        nextStep.status = "pending";
        values.assigned_approvers = nextStep.userIds || [];
        values.assigned_approver = nextStep.userIds?.[0] || null;
        values.approver_remarks = remarks;

        await withTransaction(async (conn) => {
          await conn.execute(
            `UPDATE table_records SET data = ?, updated_by = ? WHERE id = ?`,
            [stringifyJsonColumn(values), actorUserId, requestId]
          );

          await recordAudit({
            connection: conn,
            action: "leave.request.step_approve",
            entityType: "table_records",
            entityId: requestId,
            summary: {
              completedStep: currentStepIdx + 1,
              nextStep: nextStepIdx + 1,
              nextApprovers: nextStep.userIds,
              remarks,
            },
            actorUserId,
          });
        });

        return {
          id: requestId,
          status: "Pending Approval",
          stepCompleted: true,
          currentStep: nextStepIdx + 1,
          totalSteps: steps.length,
          values,
        };
      }
    } else {
      // Step partially approved (waiting for other users in this step)
      await withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE table_records SET data = ?, updated_by = ? WHERE id = ?`,
          [stringifyJsonColumn(values), actorUserId, requestId]
        );

        await recordAudit({
          connection: conn,
          action: "leave.request.step_partial_approve",
          entityType: "table_records",
          entityId: requestId,
          summary: {
            step: currentStepIdx + 1,
            approvedBy: currentStep.approvedBy,
            remarks,
          },
          actorUserId,
        });
      });

      return {
        id: requestId,
        status: "Pending Approval",
        stepCompleted: false,
        currentStep: currentStepIdx + 1,
        totalSteps: steps.length,
        values,
      };
    }
  }

  // All steps completed or legacy rule -> final approval!
  const updatedValues = {
    ...values,
    status: "Approved",
    approver_remarks: remarks,
    approved_by: actorUserId,
    approved_at: new Date().toISOString(),
  };

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE table_records SET data = ?, updated_by = ? WHERE id = ?`,
      [stringifyJsonColumn(updatedValues), actorUserId, requestId]
    );

    // Deduct leave balance ledger
    await deductLeaveBalance(conn, {
      userId: Number(values.applicant),
      leaveType: values.leave_type,
      days: Number(values.days),
      session: values.session,
      actorUserId,
    });

    await recordAudit({
      connection: conn,
      action: "leave.request.approve",
      entityType: "table_records",
      entityId: requestId,
      summary: {
        applicantId: values.applicant,
        days: values.days,
        remarks,
      },
      actorUserId,
    });
  });

  return { id: requestId, status: "Approved", values: updatedValues };
}

/**
 * Rejects a leave request.
 */
export async function rejectLeaveRequest({ requestId, remarks = "", actorUserId }) {
  const tableId = await getLeaveRequestsTableId();

  const [rows] = await db.execute(
    `SELECT id, data, status, created_by FROM table_records WHERE id = ? AND table_id = ? LIMIT 1`,
    [requestId, tableId]
  );

  if (rows.length === 0) {
    throw notFound("Leave request not found.");
  }

  const values = parseJsonColumn(rows[0].data, {});
  const steps = Array.isArray(values.approval_steps) ? values.approval_steps : [];
  const currentStepIdx = Number(values.current_step) || 0;
  const approvalMode = values.approval_mode || "sequential";
  const actorIdNum = Number(actorUserId);

  if (steps.length > 0) {
    const currentStep = steps[currentStepIdx];
    if (!currentStep) {
      throw badRequest("Invalid approval step state.");
    }
    const currentStepUserIds = (currentStep.userIds || []).map(Number);
    if (approvalMode === "sequential") {
      if (!currentStepUserIds.includes(actorIdNum)) {
        const isFutureApprover = steps.slice(currentStepIdx + 1).some(
          (s) => s.userIds && s.userIds.map(Number).includes(actorIdNum)
        );
        if (isFutureApprover) {
          throw badRequest(
            `Cannot reject yet. Waiting for Step ${currentStepIdx + 1} (${currentStep.label || "previous approver"}) to approve first.`
          );
        }
        throw forbidden("You are not authorized to decide at this stage of the approval chain.");
      }
    }
  }

  if (steps[currentStepIdx]) {
    steps[currentStepIdx].status = "rejected";
  }

  if (!Array.isArray(values.approval_history)) {
    values.approval_history = [];
  }
  values.approval_history.push({
    step: currentStepIdx + 1,
    actorUserId: actorIdNum,
    action: "Rejected",
    remarks,
    at: new Date().toISOString(),
  });

  const updatedValues = {
    ...values,
    status: "Rejected",
    approver_remarks: remarks,
    rejected_by: actorUserId,
    rejected_at: new Date().toISOString(),
  };

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE table_records SET data = ?, updated_by = ? WHERE id = ?`,
      [stringifyJsonColumn(updatedValues), actorUserId, requestId]
    );

    await recordAudit({
      connection: conn,
      action: "leave.request.reject",
      entityType: "table_records",
      entityId: requestId,
      summary: {
        applicantId: values.applicant,
        remarks,
      },
      actorUserId,
    });
  });

  return { id: requestId, status: "Rejected", values: updatedValues };
}

/**
 * Cancels a leave request (by applicant).
 */
export async function cancelLeaveRequest({ requestId, actorUserId }) {
  const tableId = await getLeaveRequestsTableId();

  const [rows] = await db.execute(
    `SELECT id, data, status, created_by FROM table_records WHERE id = ? AND table_id = ? LIMIT 1`,
    [requestId, tableId]
  );

  if (rows.length === 0) {
    throw notFound("Leave request not found.");
  }

  const values = parseJsonColumn(rows[0].data, {});
  if (Number(values.applicant) !== Number(actorUserId)) {
    throw forbidden("You can only cancel your own leave requests.");
  }

  if (values.status === "Approved") {
    throw badRequest("Approved leave requests cannot be directly cancelled. Please contact HR.");
  }

  const updatedValues = {
    ...values,
    status: "Cancelled",
    cancelled_at: new Date().toISOString(),
  };

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE table_records SET data = ?, updated_by = ? WHERE id = ?`,
      [stringifyJsonColumn(updatedValues), actorUserId, requestId]
    );

    await recordAudit({
      connection: conn,
      action: "leave.request.cancel",
      entityType: "table_records",
      entityId: requestId,
      summary: { requestId },
      actorUserId,
    });
  });

  return { id: requestId, status: "Cancelled", values: updatedValues };
}

/**
 * Lists leave requests applied by the user.
 */
export async function listMyRequests(userId, { status = null, page = 1, pageSize = 20 } = {}) {
  const tableId = await getLeaveRequestsTableId();
  const offset = (Math.max(1, page) - 1) * pageSize;

  const conditions = [
    `r.table_id = ?`,
    `r.status = 'active'`,
    `JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.applicant')) = ?`,
  ];
  const params = [tableId, String(userId)];

  if (status && status !== "all") {
    conditions.push(`JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.status')) = ?`);
    params.push(status);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM table_records r ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await db.execute(
    `
      SELECT
        r.id,
        r.table_id,
        r.data,
        r.status,
        r.created_at,
        r.updated_at
      FROM table_records r
      ${whereClause}
      ORDER BY r.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, String(pageSize), String(offset)]
  );

  return {
    items: rows.map((r) => ({
      id: Number(r.id),
      tableId: Number(r.table_id),
      values: parseJsonColumn(r.data, {}),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Lists leave requests pending approval by the current user.
 * Supports multi-step chains where all approvers in the chain can see the request,
 * but only the active step approver can act (approve/reject).
 */
export async function listPendingApprovals(userId, { page = 1, pageSize = 20 } = {}) {
  const tableId = await getLeaveRequestsTableId();
  const offset = (Math.max(1, page) - 1) * pageSize;

  const leaveSettings = await findLeaveSettings();
  const waitingTemplate =
    leaveSettings.waitingMessageTemplate ||
    DEFAULT_LEAVE_SETTINGS.waitingMessageTemplate;

  // Requests where status is 'Pending Approval' and user is either the assigned approver,
  // in assigned_approvers, or anywhere in all_approver_ids
  const conditions = [
    `r.table_id = ?`,
    `r.status = 'active'`,
    `JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.status')) = 'Pending Approval'`,
    `(JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.assigned_approver')) = ?
      OR JSON_CONTAINS(COALESCE(JSON_EXTRACT(r.data, '$.assigned_approvers'), JSON_ARRAY()), CAST(? AS JSON))
      OR JSON_CONTAINS(COALESCE(JSON_EXTRACT(r.data, '$.all_approver_ids'), JSON_ARRAY()), CAST(? AS JSON)))`,
  ];
  const params = [
    tableId,
    String(userId),
    JSON.stringify(Number(userId)),
    JSON.stringify(Number(userId)),
  ];

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM table_records r ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await db.execute(
    `
      SELECT
        r.id,
        r.table_id,
        r.data,
        r.status,
        r.created_at,
        r.updated_at,
        u.first_name AS applicant_first_name,
        u.last_name AS applicant_last_name,
        u.email AS applicant_email
      FROM table_records r
      LEFT JOIN users u ON u.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.applicant')) AS UNSIGNED)
      ${whereClause}
      ORDER BY r.id ASC
      LIMIT ? OFFSET ?
    `,
    [...params, String(pageSize), String(offset)]
  );

  // Collect all user IDs mentioned in steps across all returned rows to ensure user names are resolved
  const allNeededUserIds = new Set();
  const parsedRows = rows.map((r) => {
    const values = parseJsonColumn(r.data, {});
    const steps = Array.isArray(values.approval_steps) ? values.approval_steps : [];
    for (const step of steps) {
      if (Array.isArray(step.userIds)) {
        for (const uid of step.userIds) {
          if (uid) allNeededUserIds.add(Number(uid));
        }
      }
    }
    return { r, values, steps };
  });

  const userNameMap = new Map();
  if (allNeededUserIds.size > 0) {
    try {
      const uIds = Array.from(allNeededUserIds);
      const [uRows] = await db.execute(
        `SELECT id, first_name, last_name, email FROM users WHERE id IN (${uIds.map(() => "?").join(",")})`,
        uIds
      );
      for (const u of uRows) {
        const fullName =
          `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || `User #${u.id}`;
        userNameMap.set(Number(u.id), fullName);
      }
    } catch (err) {
      console.warn("Could not load user names in listPendingApprovals:", err.message);
    }
  }

  const userIdNum = Number(userId);

  const items = parsedRows.map(({ r, values, steps }) => {
    const currentStepIdx = Number(values.current_step) || 0;
    const approvalMode = values.approval_mode || "sequential";

    let canAct = true;
    let waitingMessage = null;
    let myStepOrder = null;
    const currentStepOrder = currentStepIdx + 1;

    if (steps.length > 0) {
      // Find which step(s) include the current user
      const myStepIndices = [];
      steps.forEach((step, idx) => {
        const uids = (step.userIds || []).map(Number);
        if (uids.includes(userIdNum)) {
          myStepIndices.push(idx);
        }
      });

      if (myStepIndices.length > 0) {
        myStepOrder = myStepIndices[0] + 1;

        if (approvalMode === "sequential") {
          const currentStep = steps[currentStepIdx] || {};
          const currentStepUserIds = (currentStep.userIds || []).map(Number);

          if (myStepIndices.includes(currentStepIdx)) {
            // Current active step!
            const approvedBy = (currentStep.approvedBy || []).map(Number);
            if (approvedBy.includes(userIdNum)) {
              canAct = false;
              waitingMessage =
                "You have already approved this step. Waiting for other step approvers.";
            } else {
              canAct = true;
            }
          } else if (Math.min(...myStepIndices) > currentStepIdx) {
            // Current user is in a future step in the chain!
            canAct = false;

            // Resolve name(s) of the active approver whose turn it is
            let approverName = currentStep.approverNamesText;
            if (!approverName && currentStepUserIds.length > 0) {
              approverName = currentStepUserIds
                .map((id) => userNameMap.get(id))
                .filter(Boolean)
                .join(", ");
            }
            if (!approverName) {
              approverName = currentStep.label || `Step ${currentStepOrder} Approver`;
            }

            const stepLabel = currentStep.label || `Step ${currentStepOrder}`;

            // Replace template placeholders
            waitingMessage = waitingTemplate
              .replace(/{approver}/g, approverName)
              .replace(/{step}/g, stepLabel)
              .replace(/{stepNumber}/g, String(currentStepOrder));
          } else if (Math.max(...myStepIndices) < currentStepIdx) {
            // Current user already acted in an earlier step
            canAct = false;
            waitingMessage =
              "You have already completed your approval step for this request.";
          }
        } else {
          // Parallel mode
          const allMyStepsApproved = myStepIndices.every((idx) => {
            const s = steps[idx];
            return (s.approvedBy || []).map(Number).includes(userIdNum);
          });
          if (allMyStepsApproved) {
            canAct = false;
            waitingMessage = "You have already approved this request.";
          } else {
            canAct = true;
          }
        }
      }
    }

    return {
      id: Number(r.id),
      tableId: Number(r.table_id),
      values,
      canAct,
      waitingMessage,
      myStepOrder,
      currentStepOrder,
      applicant: {
        id: values.applicant,
        name: `${r.applicant_first_name || ""} ${r.applicant_last_name || ""}`.trim(),
        email: r.applicant_email,
      },
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Rules and Settings Management
export async function getLeaveRules() {
  return findLeaveRules();
}

export async function saveLeaveRules(rules, actorUserId) {
  await withTransaction(async (conn) => {
    await repoSaveLeaveRules(conn, rules, actorUserId);
    await recordAudit({
      connection: conn,
      action: "leave.rules.update",
      entityType: "app_settings",
      entityId: "leave_rules",
      summary: { ruleCount: rules.length },
      actorUserId,
    });
  });
  return rules;
}

export async function getLeaveSettings() {
  return findLeaveSettings();
}

export async function saveLeaveSettings(settings, actorUserId) {
  await withTransaction(async (conn) => {
    await repoSaveLeaveSettings(conn, settings, actorUserId);
    await recordAudit({
      connection: conn,
      action: "leave.settings.update",
      entityType: "app_settings",
      entityId: "leave_settings",
      summary: { ...settings },
      actorUserId,
    });
  });
  return settings;
}

export async function getHolidays() {
  return repoFindHolidays();
}

export async function saveHolidays(holidays, actorUserId) {
  await withTransaction(async (conn) => {
    await repoSaveHolidays(conn, holidays, actorUserId);
    await recordAudit({
      connection: conn,
      action: "leave.holidays.update",
      entityType: "app_settings",
      entityId: "leave_holidays",
      summary: { count: holidays.length },
      actorUserId,
    });
  });
  return holidays;
}

