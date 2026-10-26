import { db } from "../../../config/database.js";

export async function createApplication(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_applications
       (application_number, user_id, policy_id, policy_version, leave_type_id,
        start_date, end_date, requested_units, calculated_units, unit,
        reason, emergency_flag, status, custom_data_json, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.applicationNumber,
      data.userId,
      data.policyId,
      data.policyVersion || 1,
      data.leaveTypeId,
      data.startDate,
      data.endDate,
      data.requestedUnits,
      data.calculatedUnits,
      data.unit || "day",
      data.reason,
      data.emergencyFlag ? 1 : 0,
      data.status || "PENDING_APPROVAL",
      data.customDataJson ? JSON.stringify(data.customDataJson) : null,
      data.submittedAt || new Date(),
    ]
  );
  return result.insertId;
}

export async function findApplicationById(id, connection = db) {
  const [rows] = await connection.execute(
    `SELECT a.*, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS applicant_name, u.email AS applicant_email,
            t.name AS leave_type_name, t.type_key AS leave_type_key, t.unit AS leave_unit,
            p.name AS policy_name
     FROM leave_applications a
     JOIN users u ON a.user_id = u.id
     JOIN leave_types t ON a.leave_type_id = t.id
     JOIN leave_policies p ON a.policy_id = p.id
     WHERE a.id = ?`,
    [id]
  );
  return rows[0] || null;
}

export async function findApplicationByNumber(num, connection = db) {
  const [rows] = await connection.execute(
    `SELECT a.*, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS applicant_name, u.email AS applicant_email,
            t.name AS leave_type_name, t.type_key AS leave_type_key
     FROM leave_applications a
     JOIN users u ON a.user_id = u.id
     JOIN leave_types t ON a.leave_type_id = t.id
     WHERE a.application_number = ?`,
    [num]
  );
  return rows[0] || null;
}

export async function listApplicationsForUser(userId, query = {}, connection = db) {
  let sql = `SELECT a.*, t.name AS leave_type_name, t.type_key AS leave_type_key, t.unit AS leave_unit
             FROM leave_applications a
             JOIN leave_types t ON a.leave_type_id = t.id
             WHERE a.user_id = ?`;
  const params = [userId];

  if (query.status) {
    sql += ` AND a.status = ?`;
    params.push(query.status);
  }

  sql += ` ORDER BY a.created_at DESC`;
  const [rows] = await connection.execute(sql, params);
  return rows;
}

export async function listAllApplications(query = {}, connection = db) {
  let sql = `SELECT a.*, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS applicant_name, u.email AS applicant_email,
                    t.name AS leave_type_name, t.type_key AS leave_type_key
             FROM leave_applications a
             JOIN users u ON a.user_id = u.id
             JOIN leave_types t ON a.leave_type_id = t.id
             WHERE 1=1`;
  const params = [];

  if (query.status) {
    sql += ` AND a.status = ?`;
    params.push(query.status);
  }
  if (query.userId) {
    sql += ` AND a.user_id = ?`;
    params.push(query.userId);
  }
  if (query.startDate && query.endDate) {
    sql += ` AND (a.start_date <= ? AND a.end_date >= ?)`;
    params.push(query.endDate, query.startDate);
  }

  sql += ` ORDER BY a.created_at DESC`;
  const [rows] = await connection.execute(sql, params);
  return rows;
}

export async function insertApplicationDays(appId, days, connection = db) {
  for (const day of days) {
    await connection.execute(
      `INSERT INTO leave_application_days (application_id, date, day_type, counted, units, calculation_metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        appId,
        day.date,
        day.dayType,
        day.counted ? 1 : 0,
        day.units,
        day.reason ? JSON.stringify({ reason: day.reason }) : null,
      ]
    );
  }
}

export async function listApplicationDays(appId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_application_days WHERE application_id = ? ORDER BY date ASC`,
    [appId]
  );
  return rows;
}

export async function insertApplicationApprovals(appId, approvals, connection = db) {
  for (const app of approvals) {
    await connection.execute(
      `INSERT INTO leave_application_approvals
         (application_id, step_order, approver_type, approver_user_id, approver_role_key, approver_entity_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        appId,
        app.stepOrder,
        app.approverType,
        app.approverUserId || null,
        app.approverRoleKey || null,
        app.approverEntityId || null,
        app.status || "PENDING",
      ]
    );
  }
}

export async function listApplicationApprovals(appId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT appr.*, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS approver_name, u.email AS approver_email,
            COALESCE(NULLIF(CONCAT_WS(' ', act.first_name, act.last_name), ''), act.email) AS action_by_name
     FROM leave_application_approvals appr
     LEFT JOIN users u ON appr.approver_user_id = u.id
     LEFT JOIN users act ON appr.action_by_user_id = act.id
     WHERE appr.application_id = ?
     ORDER BY appr.step_order ASC`,
    [appId]
  );
  return rows;
}

export async function updateApplicationStatus(id, updates, connection = db) {
  const fields = [];
  const values = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.approvedAt !== undefined) {
    fields.push("approved_at = ?");
    values.push(updates.approvedAt);
  }
  if (updates.rejectedAt !== undefined) {
    fields.push("rejected_at = ?");
    values.push(updates.rejectedAt);
  }
  if (updates.cancelledAt !== undefined) {
    fields.push("cancelled_at = ?");
    values.push(updates.cancelledAt);
  }

  if (fields.length === 0) return;

  values.push(id);
  await connection.execute(
    `UPDATE leave_applications SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function updateApprovalStep(id, updates, connection = db) {
  const fields = [];
  const values = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.actionByUserId !== undefined) {
    fields.push("action_by_user_id = ?");
    values.push(updates.actionByUserId);
  }
  if (updates.comments !== undefined) {
    fields.push("comments = ?");
    values.push(updates.comments);
  }
  if (updates.actedAt !== undefined) {
    fields.push("acted_at = ?");
    values.push(updates.actedAt);
  }

  if (fields.length === 0) return;

  values.push(id);
  await connection.execute(
    `UPDATE leave_application_approvals SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function findPendingApprovalsForUser(userId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT a.*, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS applicant_name, u.email AS applicant_email,
            t.name AS leave_type_name, t.type_key AS leave_type_key,
            appr.id AS current_approval_id, appr.step_order AS current_step_order
     FROM leave_application_approvals appr
     JOIN leave_applications a ON appr.application_id = a.id
     JOIN users u ON a.user_id = u.id
     JOIN leave_types t ON a.leave_type_id = t.id
     WHERE (appr.approver_user_id = ?
            OR appr.approver_user_id IS NULL
            OR EXISTS (
               SELECT 1 FROM user_roles ur
               JOIN roles r ON ur.role_id = r.id
               WHERE ur.user_id = ? AND r.role_key IN ('admin', 'super_admin')
            ))
       AND appr.status = 'PENDING'
       AND a.status IN ('SUBMITTED', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED')
     ORDER BY a.created_at ASC`,
    [userId, userId]
  );
  return rows;
}

export async function checkOverlappingLeaves(userId, startDate, endDate, excludeAppId = null, connection = db) {
  let sql = `SELECT * FROM leave_applications
             WHERE user_id = ?
               AND status IN ('SUBMITTED', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED')
               AND (start_date <= ? AND end_date >= ?)`;
  const params = [userId, endDate, startDate];

  if (excludeAppId) {
    sql += ` AND id <> ?`;
    params.push(excludeAppId);
  }

  const [rows] = await connection.execute(sql, params);
  return rows;
}

export async function isUserAdmin(userId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id = ? AND r.role_key IN ('admin', 'super_admin')`,
    [userId]
  );
  return rows.length > 0;
}

