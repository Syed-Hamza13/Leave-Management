import { db } from "../../../config/database.js";

export async function listLeaveTypesByPolicy(policyId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_types WHERE policy_id = ? AND status = 'active' ORDER BY sort_order ASC, id ASC`,
    [policyId]
  );
  return rows;
}

export async function findLeaveTypeById(id, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_types WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

export async function findLeaveTypeByKey(policyId, key, connection = db) {
  const [rows] = await connection.execute(
    `SELECT * FROM leave_types WHERE policy_id = ? AND type_key = ?`,
    [policyId, key]
  );
  return rows[0] || null;
}

export async function createLeaveType(data, connection = db) {
  const [result] = await connection.execute(
    `INSERT INTO leave_types
       (policy_id, type_key, name, description, unit, paid_status, requires_balance, requires_approval,
        allows_half_day, allows_partial_day, carry_forward_enabled, encashment_enabled, max_balance, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.policyId,
      data.typeKey,
      data.name,
      data.description || null,
      data.unit || "day",
      data.paidStatus || "paid",
      data.requiresBalance !== false ? 1 : 0,
      data.requiresApproval !== false ? 1 : 0,
      data.allowsHalfDay !== false ? 1 : 0,
      data.allowsPartialDay ? 1 : 0,
      data.carryForwardEnabled ? 1 : 0,
      data.encashmentEnabled ? 1 : 0,
      data.maxBalance || null,
      data.sortOrder || 0,
      data.status || "active",
    ]
  );
  return result.insertId;
}

export async function updateLeaveType(id, data, connection = db) {
  const fields = [];
  const values = [];

  const map = {
    name: "name",
    description: "description",
    unit: "unit",
    paidStatus: "paid_status",
    requiresBalance: "requires_balance",
    requiresApproval: "requires_approval",
    allowsHalfDay: "allows_half_day",
    allowsPartialDay: "allows_partial_day",
    carryForwardEnabled: "carry_forward_enabled",
    encashmentEnabled: "encashment_enabled",
    maxBalance: "max_balance",
    sortOrder: "sort_order",
    status: "status",
  };

  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = ?`);
      let val = data[key];
      if (typeof val === "boolean") val = val ? 1 : 0;
      values.push(val);
    }
  }

  if (fields.length === 0) return;

  values.push(id);
  await connection.execute(
    `UPDATE leave_types SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function checkLeaveTypeInUse(id, connection = db) {
  const [apps] = await connection.execute(
    `SELECT COUNT(*) AS total FROM leave_applications WHERE leave_type_id = ?`,
    [id]
  );
  if (apps[0].total > 0) return true;

  const [balances] = await connection.execute(
    `SELECT COUNT(*) AS total FROM leave_balances WHERE leave_type_id = ?`,
    [id]
  );
  return balances[0].total > 0;
}
