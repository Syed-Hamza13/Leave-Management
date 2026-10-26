import { db } from "../../../config/database.js";

export async function getEmployeeLeaveSummaries(connection = db) {
  const [rows] = await connection.execute(
    `SELECT u.id AS user_id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS employee_name, u.email AS employee_email,
            t.id AS leave_type_id, t.name AS leave_type_name, t.type_key, t.unit,
            b.opening_balance, b.accrued, b.carried_forward, b.consumed, b.closing_balance
     FROM users u
     JOIN leave_balances b ON u.id = b.user_id
     JOIN leave_types t ON b.leave_type_id = t.id
     WHERE u.status = 'active'
     ORDER BY COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) ASC, t.sort_order ASC`
  );
  return rows;
}

export async function getMonthlyLeaveRegister(year, month, connection = db) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-31`;

  const [rows] = await connection.execute(
    `SELECT a.id, a.application_number, a.start_date, a.end_date, a.calculated_units, a.unit, a.status,
            u.id AS user_id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS employee_name, u.email AS employee_email,
            t.name AS leave_type_name,
            e.name AS entity_name
     FROM leave_applications a
     JOIN users u ON a.user_id = u.id
     JOIN leave_types t ON a.leave_type_id = t.id
     LEFT JOIN organization_entity_members m ON u.id = m.user_id AND m.status = 'active'
     LEFT JOIN organization_entities e ON m.organization_entity_id = e.id
     WHERE (a.start_date <= ? AND a.end_date >= ?)
     ORDER BY a.start_date ASC`,
    [endDate, startDate]
  );
  return rows;
}

export async function getPendingApprovalsSummary(connection = db) {
  const [rows] = await connection.execute(
    `SELECT appr.approver_user_id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) AS approver_name, u.email AS approver_email,
            COUNT(appr.id) AS pending_count,
            MIN(appr.created_at) AS oldest_pending_at
     FROM leave_application_approvals appr
     JOIN users u ON appr.approver_user_id = u.id
     WHERE appr.status = 'PENDING'
     GROUP BY appr.approver_user_id, COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email), u.email
     ORDER BY pending_count DESC`
  );
  return rows;
}
