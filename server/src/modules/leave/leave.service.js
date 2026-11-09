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
  DEFAULT_WORKFLOW_CONFIG,
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
  findWorkflowConfig as repoFindWorkflowConfig,
  saveWorkflowConfig as repoSaveWorkflowConfig,
  findHolidays as repoFindHolidays,
  saveHolidays as repoSaveHolidays,
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

  return {
    id: Number(userRow.id),
    email: userRow.email,
    firstName: userRow.first_name,
    lastName: userRow.last_name,
    fullName: `${userRow.first_name} ${userRow.last_name}`.trim(),
    status: userRow.status,
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
  const workflowConfig = await repoFindWorkflowConfig();
  const holidays = await repoFindHolidays();

  const durationInfo = calculateLeaveDuration({
    startDate,
    endDate,
    session,
    holidays,
    config: workflowConfig,
  });

  const noticeInfo = checkNoticeRequirement({
    startDate,
    calculatedDays: durationInfo.calculatedDays,
    isEmergency,
    config: workflowConfig,
  });

  const balanceInfo = await checkLeaveBalance({
    userId: applicantId,
    leaveType,
    days: durationInfo.calculatedDays,
    session,
  });

  const rules = await findLeaveRules();
  const entities = await loadActiveEntitiesWithProfiles();

  const requestData = {
    days: durationInfo.calculatedDays,
    leave_type: leaveType,
    session,
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
  const preview = await previewLeaveRequest({
    applicantId,
    startDate,
    endDate,
    session,
    leaveType,
    isEmergency,
  });

  const tableId = await getLeaveRequestsTableId();
  const initialStatus = preview.approval.requiresApproval ? "Pending Approval" : "Approved";
  const assignedApproverId = preview.approval.approverUserIds[0] || null;

  const recordValues = {
    applicant: Number(applicantId),
    leave_type: leaveType,
    start_date: preview.duration.startDate,
    end_date: preview.duration.endDate,
    session,
    days: preview.duration.calculatedDays,
    sandwiched_days: preview.duration.sandwichedDaysCount,
    reason,
    is_emergency: Boolean(isEmergency),
    status: initialStatus,
    assigned_approver: assignedApproverId,
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
        session,
        actorUserId: actorUserId ?? applicantId,
      });
    }

    await recordAudit(conn, {
      action: "leave.request.create",
      entityType: "table_records",
      entityId: insertId,
      details: {
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
 * Approves a leave request.
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

    // Deduct leave balance
    await deductLeaveBalance(conn, {
      userId: Number(values.applicant),
      leaveType: values.leave_type,
      days: Number(values.days),
      session: values.session,
      actorUserId,
    });

    await recordAudit(conn, {
      action: "leave.request.approve",
      entityType: "table_records",
      entityId: requestId,
      details: {
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

    await recordAudit(conn, {
      action: "leave.request.reject",
      entityType: "table_records",
      entityId: requestId,
      details: {
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

    await recordAudit(conn, {
      action: "leave.request.cancel",
      entityType: "table_records",
      entityId: requestId,
      details: { requestId },
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
 */
export async function listPendingApprovals(userId, { page = 1, pageSize = 20 } = {}) {
  const tableId = await getLeaveRequestsTableId();
  const offset = (Math.max(1, page) - 1) * pageSize;

  // Requests where status is 'Pending Approval' and assigned_approver is current user
  const conditions = [
    `r.table_id = ?`,
    `r.status = 'active'`,
    `JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.status')) = 'Pending Approval'`,
    `JSON_UNQUOTE(JSON_EXTRACT(r.data, '$.assigned_approver')) = ?`,
  ];
  const params = [tableId, String(userId)];

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

  return {
    items: rows.map((r) => ({
      id: Number(r.id),
      tableId: Number(r.table_id),
      values: parseJsonColumn(r.data, {}),
      applicant: {
        id: parseJsonColumn(r.data, {}).applicant,
        name: `${r.applicant_first_name || ""} ${r.applicant_last_name || ""}`.trim(),
        email: r.applicant_email,
      },
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
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
    await recordAudit(conn, {
      action: "leave.rules.update",
      entityType: "app_settings",
      entityId: "leave_rules",
      details: { ruleCount: rules.length },
      actorUserId,
    });
  });
  return rules;
}

export async function getWorkflowConfig() {
  return repoFindWorkflowConfig();
}

export async function saveWorkflowConfig(config, actorUserId) {
  await withTransaction(async (conn) => {
    await repoSaveWorkflowConfig(conn, config, actorUserId);
    await recordAudit(conn, {
      action: "leave.workflow.update",
      entityType: "app_settings",
      entityId: "leave_workflow_config",
      details: { config },
      actorUserId,
    });
  });
  return config;
}

export async function getHolidays() {
  return repoFindHolidays();
}

export async function saveHolidays(holidays, actorUserId) {
  await withTransaction(async (conn) => {
    await repoSaveHolidays(conn, holidays, actorUserId);
    await recordAudit(conn, {
      action: "leave.holidays.update",
      entityType: "app_settings",
      entityId: "leave_holidays",
      details: { count: holidays.length },
      actorUserId,
    });
  });
  return holidays;
}

